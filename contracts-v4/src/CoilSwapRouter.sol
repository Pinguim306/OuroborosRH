// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "solady/src/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @title CoilSwapRouter
/// @notice The on-chain half of the Coil "Swap / Trade any token" tab. It executes an exact-input
///   Uniswap v4 swap on behalf of a user and skims an **interface fee** off the input into the
///   protocol wallet — the same model the Uniswap frontend uses to earn on volume it routes.
///
///   For Coil's own tokens (which live in CoilHook pools) this stacks with the hook's own protocol
///   cut: a trade routed here pays the interface fee AND the hook's per-swap protocol fee, both to
///   the protocol wallet. For any other v4-pooled token, the interface fee alone is pure top-of-
///   funnel revenue. The tab is the funnel that pushes traders toward Coil launches.
///
///   Trust-minimized: the router never custodies funds across calls (it pulls the input, skims the
///   fee, swaps, and forwards the output in a single transaction) and holds no privileged power
///   over pools. The interface fee is owner-tunable but hard-capped at `MAX_INTERFACE_FEE_BPS`.
contract CoilSwapRouter is IUnlockCallback, Ownable, ReentrancyGuard {
    using SafeTransferLib for address;

    IPoolManager public immutable poolManager;

    /// @notice Where the interface fee goes (the protocol wallet).
    address public feeRecipient;

    /// @notice Interface fee in bps of the input, tunable by the owner within the cap.
    uint256 public interfaceFeeBps;

    /// @notice Hard cap on the interface fee (1%) — a guarantee to traders.
    uint256 public constant MAX_INTERFACE_FEE_BPS = 100;

    uint256 private constant BPS = 10_000;

    error DeadlinePassed();
    error TooLittleReceived();
    error FeeTooHigh();
    error ZeroAddress();
    error NotPoolManager();
    error BadValue();

    event InterfaceFeeUpdated(uint256 bps);
    event FeeRecipientUpdated(address recipient);
    event Swapped(
        address indexed user,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 interfaceFee,
        uint256 amountOut
    );

    /// @dev Passed through `unlock` to the callback — the swap parameters + who receives the output.
    struct SwapCallback {
        PoolKey key;
        bool zeroForOne;
        uint256 amountIn; // post-interface-fee input that actually enters the swap
        address recipient;
    }

    constructor(IPoolManager _poolManager, address _owner, address _feeRecipient, uint256 _feeBps) {
        if (address(_poolManager) == address(0) || _feeRecipient == address(0) || _owner == address(0)) {
            revert ZeroAddress();
        }
        if (_feeBps > MAX_INTERFACE_FEE_BPS) revert FeeTooHigh();
        poolManager = _poolManager;
        _initializeOwner(_owner);
        feeRecipient = _feeRecipient;
        interfaceFeeBps = _feeBps;
    }

    /*                            ADMIN                            */

    function setInterfaceFeeBps(uint256 v) external onlyOwner {
        if (v > MAX_INTERFACE_FEE_BPS) revert FeeTooHigh();
        interfaceFeeBps = v;
        emit InterfaceFeeUpdated(v);
    }

    function setFeeRecipient(address v) external onlyOwner {
        if (v == address(0)) revert ZeroAddress();
        feeRecipient = v;
        emit FeeRecipientUpdated(v);
    }

    /*                            SWAP                             */

    /// @notice Swap `amountIn` of the input currency for the output currency of `key`, exact-input,
    ///   through a single v4 pool. The interface fee is skimmed off the input to `feeRecipient`;
    ///   the rest is swapped and the output sent to `recipient` (defaults to the caller).
    /// @param key The v4 pool to trade through.
    /// @param zeroForOne True to swap currency0 → currency1 (input is currency0), false for the reverse.
    /// @param amountIn Total input the caller provides (interface fee is taken from this).
    /// @param minAmountOut Slippage floor; the swap reverts if the output is below this.
    /// @param recipient Who receives the output (0 → the caller).
    /// @param deadline Unix time after which the swap reverts.
    function swapExactInSingle(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external payable nonReentrant returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (recipient == address(0)) recipient = msg.sender;

        Currency input = zeroForOne ? key.currency0 : key.currency1;
        Currency output = zeroForOne ? key.currency1 : key.currency0;

        uint256 fee = amountIn * interfaceFeeBps / BPS;
        uint256 swapAmount = amountIn - fee;

        // Pull the input in and take the interface fee, per currency kind.
        if (Currency.unwrap(input) == address(0)) {
            if (msg.value != amountIn) revert BadValue();
            if (fee > 0) feeRecipient.safeTransferETH(fee);
        } else {
            if (msg.value != 0) revert BadValue();
            address t = Currency.unwrap(input);
            t.safeTransferFrom(msg.sender, address(this), amountIn);
            if (fee > 0) t.safeTransfer(feeRecipient, fee);
        }

        amountOut = abi.decode(
            poolManager.unlock(abi.encode(SwapCallback(key, zeroForOne, swapAmount, recipient))), (uint256)
        );
        if (amountOut < minAmountOut) revert TooLittleReceived();

        emit Swapped(
            msg.sender, Currency.unwrap(input), Currency.unwrap(output), amountIn, fee, amountOut
        );
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        SwapCallback memory c = abi.decode(data, (SwapCallback));

        BalanceDelta delta = poolManager.swap(
            c.key,
            SwapParams({
                zeroForOne: c.zeroForOne,
                amountSpecified: -int256(c.amountIn), // negative = exact input
                sqrtPriceLimitX96: c.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );

        Currency input = c.zeroForOne ? c.key.currency0 : c.key.currency1;
        Currency output = c.zeroForOne ? c.key.currency1 : c.key.currency0;

        // Whatever the swap says we owe on the input side, we settle from the funds we hold; the
        // hook's own fee (if any) is already reflected in these deltas, so this is always correct.
        int256 inputDelta = c.zeroForOne ? int256(delta.amount0()) : int256(delta.amount1());
        int256 outputDelta = c.zeroForOne ? int256(delta.amount1()) : int256(delta.amount0());

        if (inputDelta < 0) _settle(input, uint256(-inputDelta));

        uint256 out = outputDelta > 0 ? uint256(outputDelta) : 0;
        if (out > 0) poolManager.take(output, c.recipient, out);

        return abi.encode(out);
    }

    /// @dev Pay the pool manager what we owe on a currency: for ETH, forward value; for a token,
    ///   sync → transfer → settle.
    function _settle(Currency currency, uint256 amount) private {
        if (Currency.unwrap(currency) == address(0)) {
            poolManager.settle{value: amount}();
        } else {
            poolManager.sync(currency);
            Currency.unwrap(currency).safeTransfer(address(poolManager), amount);
            poolManager.settle();
        }
    }

    receive() external payable {}
}
