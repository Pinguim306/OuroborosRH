// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "solady/src/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";

/// @dev Minimal, ABI-compatible view of CoilSwapRouter (the v4 interface-fee router). The PoolKey
///   fields match Uniswap v4's PoolKey layout exactly, so we can call it without pulling in v4-core.
interface ICoilSwapRouter {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    function swapExactInSingle(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external payable returns (uint256 amountOut);
}

/// @title CoilBuybackBurner
/// @notice The buy&burn treasury for the official $COIL token. Set as a launched token's
///   `platformTreasury`, it receives that token's BURN fee slice (native ETH, pushed by the hook's
///   permissionless `sweepTreasury()`). Anyone can then call `buybackAndBurn()`: the accrued ETH is
///   swapped for $COIL through the CoilSwapRouter and delivered to the dead address — permanently
///   removing it from circulation.
/// @dev Trust-minimised: the burn path is permissionless and always sends the bought COIL to
///   `DEAD`, so no privileged party can divert it. The owner can only (a) point at the COIL token
///   once it's launched and (b) rescue the incidental non-COIL token dust that each source token's
///   burn slice drips in (its own token, alongside the ETH we actually use).
contract CoilBuybackBurner is Ownable, ReentrancyGuard {
    using SafeTransferLib for address;

    /// @dev Bought COIL is sent here — an address no one holds the key to, i.e. burned.
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @dev Matches CoilHook's immutable pool params (LP fee 0, tickSpacing 200, hook == token).
    uint24 public constant POOL_FEE = 0;
    int24 public constant TICK_SPACING = 200;

    ICoilSwapRouter public immutable swapRouter;

    /// @dev The official COIL token/hook. Owner-set (once) so the burner can be deployed and wired
    ///   in as `platformTreasury` BEFORE COIL is launched, then pointed at COIL afterwards — which
    ///   lets COIL's own burn slice fund its buyback too.
    address public coil;

    uint256 public totalEthSpent;
    uint256 public totalCoilBurned;

    event CoilSet(address coil);
    event BuybackBurned(uint256 ethIn, uint256 coilBurned);
    event Rescued(address indexed token, uint256 amount, address indexed to);

    error ZeroAddress();
    error CoilNotSet();
    error NothingToBuy();

    constructor(ICoilSwapRouter _swapRouter, address _owner) {
        if (address(_swapRouter) == address(0) || _owner == address(0)) revert ZeroAddress();
        swapRouter = _swapRouter;
        _initializeOwner(_owner);
    }

    /// @dev Accept the ETH burn slice pushed by each source token's `sweepTreasury()`.
    receive() external payable {}

    /// @notice Point the burner at the official COIL token (once it's launched). Owner-only.
    function setCoil(address _coil) external onlyOwner {
        if (_coil == address(0)) revert ZeroAddress();
        coil = _coil;
        emit CoilSet(_coil);
    }

    /// @notice The COIL PoolKey (native ETH is currency0 < COIL is currency1; the hook is the token).
    function poolKey() public view returns (ICoilSwapRouter.PoolKey memory) {
        return ICoilSwapRouter.PoolKey({
            currency0: address(0),
            currency1: coil,
            fee: POOL_FEE,
            tickSpacing: TICK_SPACING,
            hooks: coil
        });
    }

    /// @notice Buy $COIL with the accrued ETH and burn it (send to DEAD). Permissionless.
    /// @param amountIn ETH to spend; 0 (or > balance) spends the whole balance.
    /// @param minCoilOut Slippage floor — revert if fewer COIL come back.
    /// @param deadline Swap deadline (unix seconds).
    function buybackAndBurn(uint256 amountIn, uint256 minCoilOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 burned)
    {
        if (coil == address(0)) revert CoilNotSet();
        uint256 bal = address(this).balance;
        if (amountIn == 0 || amountIn > bal) amountIn = bal;
        if (amountIn == 0) revert NothingToBuy();

        burned = swapRouter.swapExactInSingle{value: amountIn}(
            poolKey(), true, amountIn, minCoilOut, DEAD, deadline
        );

        totalEthSpent += amountIn;
        totalCoilBurned += burned;
        emit BuybackBurned(amountIn, burned);
    }

    /// @notice Recover the non-COIL token dust that source tokens' burn slices drip in (their own
    ///   token, which we don't buy back). Owner-only; cannot touch the ETH used for buybacks.
    function rescue(address token, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 amt = token.balanceOf(address(this));
        if (amt > 0) token.safeTransfer(to, amt);
        emit Rescued(token, amt, to);
    }
}
