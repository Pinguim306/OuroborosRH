// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "src/utils/Ownable.sol";
import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";
import {IERC20} from "src/interfaces/IERC20.sol";
import {IUniswapV3Factory} from "src/interfaces/IUniswapV3.sol";
import {IUniswapV3PoolDirect, IUniswapV3SwapCallback} from "src/interfaces/IUniswapV3Direct.sol";

/// @title ArcSwapRouter
/// @notice Minimal exact-in router for the Arc launchpad's token/USDC V3 pools, used
///         by the Coil site (external terminals bring their own routers). Skims the
///         interface fee off the input, swaps directly on the pool, and delivers the
///         output straight from the pool to the recipient — this contract never holds
///         user funds.
///
///         All amounts are ERC20 units: USDC through Arc's native-USDC facade
///         (6 decimals — approve it like any token; facade balances are native
///         balances), tokens in their own 18 decimals.
contract ArcSwapRouter is Ownable, ReentrancyGuard, IUniswapV3SwapCallback {
    uint256 private constant BPS = 10_000;
    /// @notice Hard cap on the interface fee (1%) — it can never be cranked past this.
    uint256 public constant MAX_INTERFACE_FEE_BPS = 100;

    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    IUniswapV3Factory public immutable v3Factory;
    /// @notice The canonical native-USDC ERC20 facade (quote side of every pool).
    address public immutable usdc;

    address public feeRecipient;
    /// @notice Interface fee in bps, taken from the input amount.
    uint256 public interfaceFeeBps;

    /// @dev The pool a swap is in flight for, and who pays its input.
    address private pendingPool;
    address private pendingPayer;
    address private pendingTokenIn;

    event Swapped(
        address indexed token, address indexed trader, bool buy, uint256 amountIn, uint256 amountOut
    );
    event FeeRecipientUpdated(address indexed feeRecipient);
    event InterfaceFeeUpdated(uint256 bps);

    error PoolNotFound();
    error DeadlinePassed();
    error TooLittleReceived();
    error FeeTooHigh();
    error UnexpectedCallback();

    constructor(
        address initialOwner,
        address _v3Factory,
        address _usdc,
        address _feeRecipient,
        uint256 _interfaceFeeBps
    ) Ownable(initialOwner) {
        if (_v3Factory == address(0) || _usdc == address(0) || _feeRecipient == address(0)) {
            revert ZeroAddress();
        }
        if (_interfaceFeeBps > MAX_INTERFACE_FEE_BPS) revert FeeTooHigh();
        v3Factory = IUniswapV3Factory(_v3Factory);
        usdc = _usdc;
        feeRecipient = _feeRecipient;
        interfaceFeeBps = _interfaceFeeBps;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function setInterfaceFeeBps(uint256 bps) external onlyOwner {
        if (bps > MAX_INTERFACE_FEE_BPS) revert FeeTooHigh();
        interfaceFeeBps = bps;
        emit InterfaceFeeUpdated(bps);
    }

    /// @notice Swap `amountIn` of the input currency exact-in through the token's
    ///         USDC pool. `buy` = true swaps USDC → token, false swaps token → USDC.
    ///         The caller must have approved this router on the input currency for
    ///         `amountIn`; the interface fee is taken from it, the rest is swapped and
    ///         the output is sent by the pool directly to `recipient` (0 = caller).
    function swapExactIn(
        address token,
        uint24 fee,
        bool buy,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (recipient == address(0)) recipient = msg.sender;

        address pool = v3Factory.getPool(token, usdc, fee);
        if (pool == address(0)) revert PoolNotFound();

        address tokenIn = buy ? usdc : token;
        uint256 skim = (amountIn * interfaceFeeBps) / BPS;
        if (skim > 0) {
            require(IERC20(tokenIn).transferFrom(msg.sender, feeRecipient, skim), "fee pull failed");
        }

        // USDC in means zeroForOne exactly when USDC sorts as token0 (and vice versa).
        bool usdcIs0 = usdc < token;
        bool zeroForOne = buy ? usdcIs0 : !usdcIs0;

        pendingPool = pool;
        pendingPayer = msg.sender;
        pendingTokenIn = tokenIn;
        (int256 amount0, int256 amount1) = IUniswapV3PoolDirect(pool).swap(
            recipient,
            zeroForOne,
            int256(amountIn - skim),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            ""
        );
        pendingPool = address(0);
        pendingPayer = address(0);
        pendingTokenIn = address(0);

        // The output leg is the negative delta (paid out by the pool).
        amountOut = uint256(-(zeroForOne ? amount1 : amount0));
        if (amountOut < minAmountOut) revert TooLittleReceived();
        emit Swapped(token, msg.sender, buy, amountIn, amountOut);
    }

    /// @inheritdoc IUniswapV3SwapCallback
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        if (msg.sender != pendingPool || pendingPool == address(0)) revert UnexpectedCallback();
        int256 owed = amount0Delta > 0 ? amount0Delta : amount1Delta;
        require(
            IERC20(pendingTokenIn).transferFrom(pendingPayer, msg.sender, uint256(owed)),
            "swap pay failed"
        );
    }
}
