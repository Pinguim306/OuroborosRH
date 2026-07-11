// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";
import {OuroToken} from "src/OuroToken.sol";

/// @title BondingCurve
/// @notice The trading + fee-routing legs of the Ouroboros loop.
///
///         A constant-product virtual-reserve curve (pump.fun style). Every trade
///         charges three fee components, each a fraction of the trade in basis points:
///           - `devFeeBps`     → the developer / platform (`feeRecipient`)
///           - `liqFeeBps`     → stays in the curve as **permanent liquidity**
///           - `holderFeeBps`  → streamed to the token so **holders can claim it**
///                               (no staking — see OuroToken)
///
///         When cumulative real native raised reaches `graduationTarget`, the curve
///         locks and "graduates".
contract BondingCurve is ReentrancyGuard {
    uint256 private constant BPS = 10_000;
    uint256 private constant WAD = 1e18;

    OuroToken public immutable token;
    /// @notice Developer / platform address that receives the dev fee.
    address public immutable feeRecipient;

    uint256 public nativeReserve; // virtual seed + real, used for pricing
    uint256 public tokenReserve; // tokens remaining for sale
    uint256 public realNativeRaised; // real native held by the curve (excl. virtual seed)

    uint256 public immutable devFeeBps;
    uint256 public immutable liqFeeBps;
    uint256 public immutable holderFeeBps;
    uint256 public immutable graduationTarget;

    bool public graduated;

    event Trade(
        address indexed trader,
        bool isBuy,
        uint256 nativeAmount,
        uint256 tokenAmount,
        uint256 newPrice
    );
    event FeeRouted(uint256 toDev, uint256 toLiquidity, uint256 toHolders);
    event Graduated(uint256 nativeLocked, uint256 tokensLocked);

    error AlreadyGraduated();
    error SlippageExceeded();
    error ZeroAmount();
    error NativeTransferFailed();

    constructor(
        address _token,
        address _feeRecipient,
        uint256 _virtualNative,
        uint256 _curveSupply,
        uint256 _devFeeBps,
        uint256 _liqFeeBps,
        uint256 _holderFeeBps,
        uint256 _graduationTarget
    ) {
        token = OuroToken(payable(_token));
        feeRecipient = _feeRecipient;
        nativeReserve = _virtualNative;
        tokenReserve = _curveSupply;
        devFeeBps = _devFeeBps;
        liqFeeBps = _liqFeeBps;
        holderFeeBps = _holderFeeBps;
        graduationTarget = _graduationTarget;
    }

    // --------------------------------------------------------------------- //
    //  Views                                                                //
    // --------------------------------------------------------------------- //

    function totalFeeBps() public view returns (uint256) {
        return devFeeBps + liqFeeBps + holderFeeBps;
    }

    function currentPrice() public view returns (uint256) {
        if (tokenReserve == 0) return 0;
        return (nativeReserve * WAD) / tokenReserve;
    }

    function graduationProgress() external view returns (uint256) {
        if (graduationTarget == 0) return 0;
        uint256 p = (realNativeRaised * WAD) / graduationTarget;
        return p > WAD ? WAD : p;
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256)
    {
        if (amountIn == 0) return 0;
        return (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    function quoteBuy(uint256 nativeIn) external view returns (uint256 tokensOut, uint256 totalFee) {
        totalFee = (nativeIn * totalFeeBps()) / BPS;
        tokensOut = getAmountOut(nativeIn - totalFee, nativeReserve, tokenReserve);
    }

    function quoteSell(uint256 tokenIn) external view returns (uint256 nativeOut, uint256 totalFee) {
        uint256 gross = getAmountOut(tokenIn, tokenReserve, nativeReserve);
        totalFee = (gross * totalFeeBps()) / BPS;
        nativeOut = gross - totalFee;
    }

    // --------------------------------------------------------------------- //
    //  Trading                                                              //
    // --------------------------------------------------------------------- //

    function buy(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        if (graduated) revert AlreadyGraduated();
        if (msg.value == 0) revert ZeroAmount();

        (uint256 devPart, uint256 liqPart, uint256 holderPart) = _feeParts(msg.value);
        uint256 netIn = msg.value - devPart - liqPart - holderPart;

        tokensOut = getAmountOut(netIn, nativeReserve, tokenReserve);
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        nativeReserve += netIn + liqPart;
        tokenReserve -= tokensOut;
        realNativeRaised += netIn + liqPart;

        // Deliver tokens first so the buyer is part of the dividend base before their
        // own holder-fee is streamed.
        require(token.transfer(msg.sender, tokensOut), "token transfer failed");
        _routeFees(devPart, liqPart, holderPart);
        emit Trade(msg.sender, true, msg.value, tokensOut, currentPrice());

        _maybeGraduate();
    }

    function sell(uint256 tokenIn, uint256 minNativeOut)
        external
        nonReentrant
        returns (uint256 nativeOut)
    {
        if (graduated) revert AlreadyGraduated();
        if (tokenIn == 0) revert ZeroAmount();

        require(token.transferFrom(msg.sender, address(this), tokenIn), "token transferFrom failed");

        uint256 gross = getAmountOut(tokenIn, tokenReserve, nativeReserve);
        (uint256 devPart, uint256 liqPart, uint256 holderPart) = _feeParts(gross);
        nativeOut = gross - devPart - liqPart - holderPart;
        if (nativeOut < minNativeOut) revert SlippageExceeded();

        tokenReserve += tokenIn;
        nativeReserve = nativeReserve - gross + liqPart;
        realNativeRaised -= (gross - liqPart);

        _sendNative(msg.sender, nativeOut);
        _routeFees(devPart, liqPart, holderPart);
        emit Trade(msg.sender, false, nativeOut, tokenIn, currentPrice());
    }

    // --------------------------------------------------------------------- //
    //  Internals                                                            //
    // --------------------------------------------------------------------- //

    function _feeParts(uint256 amount)
        internal
        view
        returns (uint256 devPart, uint256 liqPart, uint256 holderPart)
    {
        devPart = (amount * devFeeBps) / BPS;
        liqPart = (amount * liqFeeBps) / BPS;
        holderPart = (amount * holderFeeBps) / BPS;
    }

    function _routeFees(uint256 devPart, uint256 liqPart, uint256 holderPart) internal {
        if (devPart > 0) _sendNative(feeRecipient, devPart);
        if (holderPart > 0) token.distributeRewards{value: holderPart}();
        // liqPart already retained in nativeReserve as permanent liquidity.
        emit FeeRouted(devPart, liqPart, holderPart);
    }

    function _maybeGraduate() internal {
        if (!graduated && realNativeRaised >= graduationTarget) {
            graduated = true;
            emit Graduated(realNativeRaised, tokenReserve);
        }
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
