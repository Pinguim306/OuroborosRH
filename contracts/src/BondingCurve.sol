// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "src/interfaces/IERC20.sol";
import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";
import {HolderRewards} from "src/HolderRewards.sol";

/// @title BondingCurve
/// @notice The trading + "Fees → Liquidity" legs of the Ouroboros loop.
///
///         A constant-product virtual-reserve curve (pump.fun style). Buyers send
///         native coin and receive tokens; sellers do the reverse. Every trade
///         charges `feeBps`. Instead of skimming the fee to a treasury:
///           - `liqShareBps` of the fee stays in the curve as **permanent liquidity**
///             (deepening the market and lifting the floor), and
///           - the remainder is streamed to `rewards` for holders.
///
///         When cumulative real native raised reaches `graduationTarget`, the curve
///         locks and "graduates" — in production this migrates liquidity to a DEX;
///         here the reserves are locked and trading on the curve stops.
contract BondingCurve is ReentrancyGuard {
    uint256 private constant BPS = 10_000;
    uint256 private constant WAD = 1e18;

    IERC20 public immutable token;
    HolderRewards public immutable rewards;

    /// @notice Native reserve (virtual seed + real accumulated), used for pricing.
    uint256 public nativeReserve;
    /// @notice Token reserve remaining for sale on the curve.
    uint256 public tokenReserve;
    /// @notice Real native coin actually held by the curve (excludes the virtual seed).
    uint256 public realNativeRaised;

    uint256 public immutable feeBps; // e.g. 100 = 1%
    uint256 public immutable liqShareBps; // share of the fee that becomes liquidity
    uint256 public immutable graduationTarget; // real native raised that triggers graduation

    bool public graduated;

    event Trade(
        address indexed trader,
        bool isBuy,
        uint256 nativeAmount,
        uint256 tokenAmount,
        uint256 feePaid,
        uint256 newPrice
    );
    event FeeToLiquidity(uint256 liquidityAdded, uint256 rewardStreamed);
    event Graduated(uint256 nativeLocked, uint256 tokensLocked);

    error AlreadyGraduated();
    error SlippageExceeded();
    error ZeroAmount();
    error NativeTransferFailed();

    constructor(
        address _token,
        address payable _rewards,
        uint256 _virtualNative,
        uint256 _curveSupply,
        uint256 _feeBps,
        uint256 _liqShareBps,
        uint256 _graduationTarget
    ) {
        token = IERC20(_token);
        rewards = HolderRewards(_rewards);
        nativeReserve = _virtualNative;
        tokenReserve = _curveSupply;
        feeBps = _feeBps;
        liqShareBps = _liqShareBps;
        graduationTarget = _graduationTarget;
    }

    // --------------------------------------------------------------------- //
    //  Views                                                                //
    // --------------------------------------------------------------------- //

    /// @notice Spot price in native per token, WAD-scaled.
    function currentPrice() public view returns (uint256) {
        if (tokenReserve == 0) return 0;
        return (nativeReserve * WAD) / tokenReserve;
    }

    /// @notice Progress toward graduation, WAD-scaled (1e18 = 100%).
    function graduationProgress() external view returns (uint256) {
        if (graduationTarget == 0) return 0;
        uint256 p = (realNativeRaised * WAD) / graduationTarget;
        return p > WAD ? WAD : p;
    }

    /// @notice Constant-product output: amountIn * reserveOut / (reserveIn + amountIn).
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        pure
        returns (uint256)
    {
        if (amountIn == 0) return 0;
        return (amountIn * reserveOut) / (reserveIn + amountIn);
    }

    /// @notice Quote tokens received for `nativeIn` (after fee).
    function quoteBuy(uint256 nativeIn) external view returns (uint256 tokensOut, uint256 fee) {
        fee = (nativeIn * feeBps) / BPS;
        uint256 liqPart = (fee * liqShareBps) / BPS;
        uint256 netIn = nativeIn - fee;
        tokensOut = getAmountOut(netIn, nativeReserve, tokenReserve);
        // liqPart deepens the reserve after the swap; reflected on the next quote.
        liqPart;
    }

    /// @notice Quote native received for `tokenIn` (after fee).
    function quoteSell(uint256 tokenIn) external view returns (uint256 nativeOut, uint256 fee) {
        uint256 gross = getAmountOut(tokenIn, tokenReserve, nativeReserve);
        fee = (gross * feeBps) / BPS;
        nativeOut = gross - fee;
    }

    // --------------------------------------------------------------------- //
    //  Trading                                                              //
    // --------------------------------------------------------------------- //

    function buy(uint256 minTokensOut) external payable nonReentrant returns (uint256 tokensOut) {
        if (graduated) revert AlreadyGraduated();
        if (msg.value == 0) revert ZeroAmount();

        uint256 fee = (msg.value * feeBps) / BPS;
        uint256 liqPart = (fee * liqShareBps) / BPS;
        uint256 rewardPart = fee - liqPart;
        uint256 netIn = msg.value - fee;

        tokensOut = getAmountOut(netIn, nativeReserve, tokenReserve);
        if (tokensOut < minTokensOut) revert SlippageExceeded();

        // netIn drives the swap; liqPart is folded back in as permanent liquidity.
        nativeReserve += netIn + liqPart;
        tokenReserve -= tokensOut;
        realNativeRaised += netIn + liqPart;

        _streamRewards(rewardPart);
        emit FeeToLiquidity(liqPart, rewardPart);

        require(token.transfer(msg.sender, tokensOut), "token transfer failed");
        emit Trade(msg.sender, true, msg.value, tokensOut, fee, currentPrice());

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
        uint256 fee = (gross * feeBps) / BPS;
        uint256 liqPart = (fee * liqShareBps) / BPS;
        uint256 rewardPart = fee - liqPart;
        nativeOut = gross - fee;
        if (nativeOut < minNativeOut) revert SlippageExceeded();

        tokenReserve += tokenIn;
        // Reserve drops by the gross payout, but liqPart is retained as liquidity.
        nativeReserve = nativeReserve - gross + liqPart;
        realNativeRaised -= (gross - liqPart);

        _streamRewards(rewardPart);
        emit FeeToLiquidity(liqPart, rewardPart);

        _sendNative(msg.sender, nativeOut);
        emit Trade(msg.sender, false, nativeOut, tokenIn, fee, currentPrice());
    }

    // --------------------------------------------------------------------- //
    //  Internals                                                            //
    // --------------------------------------------------------------------- //

    function _streamRewards(uint256 amount) internal {
        if (amount > 0) _sendNative(payable(address(rewards)), amount);
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
