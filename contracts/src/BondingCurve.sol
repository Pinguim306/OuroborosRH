// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";
import {OuroToken} from "src/OuroToken.sol";
import {IDexRouter, IDexFactory} from "src/interfaces/IDexRouter.sol";

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
///         **graduates**: it migrates the remaining tokens + all real ETH into a
///         Uniswap-V2-style pair as permanent liquidity, burns the LP, and locks the
///         curve (trading then happens on the DEX).
contract BondingCurve is ReentrancyGuard {
    uint256 private constant BPS = 10_000;
    uint256 private constant WAD = 1e18;
    /// @dev LP tokens are sent here at graduation → liquidity is permanently locked.
    address private constant DEAD = 0x000000000000000000000000000000000000dEaD;

    OuroToken public immutable token;
    /// @notice Developer / platform address that receives the dev fee.
    address public immutable feeRecipient;
    /// @notice Where the holder-fee stream goes. address(0) = Loop Rewards (streamed
    ///         to all holders through the token); anything else = Creator Rewards
    ///         (paid straight to that address, chosen at launch, immutable).
    address public immutable rewardsRecipient;
    /// @notice Uniswap-V2-style router used to migrate liquidity at graduation.
    IDexRouter public immutable router;

    uint256 public nativeReserve; // virtual seed + real, used for pricing
    uint256 public tokenReserve; // tokens remaining for sale
    uint256 public realNativeRaised; // real native held by the curve (excl. virtual seed)

    uint256 public immutable devFeeBps;
    uint256 public immutable liqFeeBps;
    uint256 public immutable holderFeeBps;
    uint256 public immutable graduationTarget;

    /// @notice Anti-whale cap: max tokens a single buy may receive, as bps of total
    ///         supply (e.g. 200 = 2%). 0 disables the cap. Applies during the curve
    ///         only — once graduated, trading is on the DEX with no cap.
    uint256 public immutable maxBuyBps;
    uint256 public immutable maxBuyTokens;

    bool public graduated;
    /// @notice The DEX pair created at graduation (0 until graduated).
    address public pair;

    event Trade(
        address indexed trader,
        bool isBuy,
        uint256 nativeAmount,
        uint256 tokenAmount,
        uint256 newPrice
    );
    event FeeRouted(uint256 toDev, uint256 toLiquidity, uint256 toHolders);
    event Graduated(address indexed pair, uint256 nativeLiquidity, uint256 tokenLiquidity);

    error AlreadyGraduated();
    error SlippageExceeded();
    error ZeroAmount();
    error NativeTransferFailed();
    error MaxBuyExceeded();
    error UnexpectedNative();

    constructor(
        address _token,
        address _feeRecipient,
        address _rewardsRecipient,
        address _router,
        uint256 _virtualNative,
        uint256 _curveSupply,
        uint256 _devFeeBps,
        uint256 _liqFeeBps,
        uint256 _holderFeeBps,
        uint256 _graduationTarget,
        uint256 _maxBuyBps
    ) {
        token = OuroToken(payable(_token));
        feeRecipient = _feeRecipient;
        rewardsRecipient = _rewardsRecipient;
        router = IDexRouter(_router);
        nativeReserve = _virtualNative;
        tokenReserve = _curveSupply;
        devFeeBps = _devFeeBps;
        liqFeeBps = _liqFeeBps;
        holderFeeBps = _holderFeeBps;
        graduationTarget = _graduationTarget;
        maxBuyBps = _maxBuyBps;
        maxBuyTokens = (_curveSupply * _maxBuyBps) / BPS;
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
        return _buy(msg.sender, minTokensOut);
    }

    /// @notice Buy on the curve and deliver the tokens to `to`. Used by the launchpad
    ///         to execute a creator's "dev buy" in the same transaction as the launch,
    ///         so the tokens (and their dividend accrual) land directly on the creator.
    ///         The same anti-whale cap and fees apply as a normal buy.
    function buyFor(address to, uint256 minTokensOut)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        return _buy(to, minTokensOut);
    }

    function _buy(address to, uint256 minTokensOut) internal returns (uint256 tokensOut) {
        if (graduated) revert AlreadyGraduated();
        if (msg.value == 0) revert ZeroAmount();

        (uint256 devPart, uint256 liqPart, uint256 holderPart) = _feeParts(msg.value);
        uint256 netIn = msg.value - devPart - liqPart - holderPart;

        tokensOut = getAmountOut(netIn, nativeReserve, tokenReserve);
        if (tokensOut < minTokensOut) revert SlippageExceeded();
        if (maxBuyTokens != 0 && tokensOut > maxBuyTokens) revert MaxBuyExceeded();

        nativeReserve += netIn + liqPart;
        tokenReserve -= tokensOut;
        realNativeRaised += netIn + liqPart;

        // Deliver tokens first so the buyer is part of the dividend base before their
        // own holder-fee is streamed.
        require(token.transfer(to, tokensOut), "token transfer failed");
        _routeFees(devPart, liqPart, holderPart);
        emit Trade(to, true, msg.value, tokensOut, currentPrice());

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
        if (holderPart > 0) _routeRewards(holderPart);
        // liqPart already retained in nativeReserve as permanent liquidity.
        emit FeeRouted(devPart, liqPart, holderPart);
    }

    /// @dev Loop Rewards streams through the token to every holder; Creator Rewards
    ///      pays the launch-time recipient directly.
    function _routeRewards(uint256 amount) internal {
        if (rewardsRecipient == address(0)) token.distributeRewards{value: amount}();
        else _sendNative(rewardsRecipient, amount);
    }

    function _maybeGraduate() internal {
        if (graduated || realNativeRaised < graduationTarget) return;
        graduated = true;

        uint256 tokenLiq = tokenReserve;
        uint256 ethLiq = realNativeRaised;
        tokenReserve = 0;
        realNativeRaised = 0;

        // Resolve (or create) the pair and exclude it from dividends BEFORE it holds
        // tokens, so pooled liquidity never accrues holder rewards. The curve is the
        // token's dividend authority solely to perform this one exclusion.
        address weth = router.WETH();
        IDexFactory factory = IDexFactory(router.factory());
        address _pair = factory.getPair(address(token), weth);
        if (_pair == address(0)) _pair = factory.createPair(address(token), weth);
        pair = _pair;
        token.setExcludedFromDividends(_pair, true);

        // Migrate all remaining tokens + real ETH as permanent liquidity; LP is burned.
        // If a griefer pre-created the pair at a skewed ratio, the router adds at that
        // ratio and refunds the excess ETH here (see `receive`), instead of reverting.
        token.approve(address(router), tokenLiq);
        router.addLiquidityETH{value: ethLiq}(address(token), tokenLiq, 0, 0, DEAD, block.timestamp);
        token.approve(address(router), 0);

        // Sweep leftovers so a pre-seeded pair can't strand value: leftover tokens are
        // burned to DEAD (excluded from dividends first, so they never dilute holders).
        uint256 tokLeft = token.balanceOf(address(this));
        if (tokLeft > 0) {
            token.setExcludedFromDividends(DEAD, true);
            require(token.transfer(DEAD, tokLeft), "sweep transfer failed");
        }

        // Point the token at the pair so post-graduation DEX trades are taxed
        // (fee-on-transfer → the protocol vault). Done before renouncing authority,
        // so the pair can never be changed afterwards. Migration transfers above were
        // from the curve, which is tax-exempt, so they were never taxed.
        token.setDexPair(_pair);

        // Freeze exclusions forever — no one can exclude a holder afterwards.
        token.renounceAuthority();

        // Any refunded ETH follows the rewards route (holders or creator) — the
        // griefer's skew ends up paying the community rather than bricking the launch.
        uint256 ethLeft = address(this).balance;
        if (ethLeft > 0) _routeRewards(ethLeft);

        emit Graduated(_pair, ethLiq, tokenLiq);
    }

    /// @dev Accept native ONLY from the router (its `addLiquidityETH` refunds excess
    ///      ETH when the pair pre-exists at a different ratio). Rejecting everyone
    ///      else protects users from accidentally sending ETH here.
    receive() external payable {
        if (msg.sender != address(router)) revert UnexpectedNative();
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
