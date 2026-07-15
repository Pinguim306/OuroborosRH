// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "solady/src/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/src/utils/SafeTransferLib.sol";

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IWETH9 {
    function withdraw(uint256) external;
}

/// @title CoilSwapRouterV3
/// @notice The interface-fee wrapper for **v3** tokens on Robinhood Chain (the ones the Coil Swap
///   tab can't route through the v4 CoilSwapRouter). It skims the same interface fee off every
///   trade and forwards the rest through Uniswap's SwapRouter02, so the protocol earns on *any*
///   token routed, not only Coil v4 launches.
/// @dev Trust-minimized: never custodies funds across calls (pull input → skim fee → swap → forward
///   output, all in one tx) and holds no privileged power over pools. The fee is owner-tunable but
///   hard-capped at `MAX_INTERFACE_FEE_BPS`.
contract CoilSwapRouterV3 is Ownable, ReentrancyGuard {
    using SafeTransferLib for address;

    ISwapRouter02 public immutable swapRouter;
    address public immutable weth;

    address public feeRecipient;
    uint256 public interfaceFeeBps;

    uint256 public constant MAX_INTERFACE_FEE_BPS = 100; // 1%
    uint256 private constant BPS = 10_000;

    error DeadlinePassed();
    error TooLittleReceived();
    error FeeTooHigh();
    error ZeroAddress();
    error EthSendFailed();

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

    constructor(ISwapRouter02 _swapRouter, address _weth, address _owner, address _feeRecipient, uint256 _feeBps) {
        if (address(_swapRouter) == address(0) || _weth == address(0) || _owner == address(0) || _feeRecipient == address(0)) {
            revert ZeroAddress();
        }
        if (_feeBps > MAX_INTERFACE_FEE_BPS) revert FeeTooHigh();
        swapRouter = _swapRouter;
        weth = _weth;
        _initializeOwner(_owner);
        feeRecipient = _feeRecipient;
        interfaceFeeBps = _feeBps;
    }

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

    /// @notice Buy `token` with ETH (exact input) through the v3 pool at fee tier `poolFee` (e.g.
    ///   100 / 500 / 3000 / 10000). The interface fee is skimmed off the ETH; the rest is swapped
    ///   WETH->token and delivered to `recipient` (0 -> caller). The frontend picks `poolFee` by
    ///   probing which tier has a pool, so any token with a v3 pool in any tier is tradeable.
    function buy(address token, uint24 poolFee, uint256 minAmountOut, address recipient, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (recipient == address(0)) recipient = msg.sender;

        uint256 fee = msg.value * interfaceFeeBps / BPS;
        uint256 swapAmount = msg.value - fee;
        if (fee > 0) feeRecipient.safeTransferETH(fee);

        amountOut = swapRouter.exactInputSingle{value: swapAmount}(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: token,
                fee: poolFee,
                recipient: recipient,
                amountIn: swapAmount,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
        if (amountOut < minAmountOut) revert TooLittleReceived();
        emit Swapped(msg.sender, weth, token, msg.value, fee, amountOut);
    }

    /// @notice Sell `amountIn` of `token` for ETH (exact input) through the v3 pool at fee tier
    ///   `poolFee`. Interface fee is skimmed off the token; the rest is swapped token->WETH,
    ///   unwrapped, and the ETH sent to `recipient`.
    function sell(address token, uint24 poolFee, uint256 amountIn, uint256 minAmountOut, address recipient, uint256 deadline)
        external
        nonReentrant
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert DeadlinePassed();
        if (recipient == address(0)) recipient = msg.sender;

        token.safeTransferFrom(msg.sender, address(this), amountIn);
        uint256 fee = amountIn * interfaceFeeBps / BPS;
        uint256 swapAmount = amountIn - fee;
        if (fee > 0) token.safeTransfer(feeRecipient, fee);

        token.safeApprove(address(swapRouter), swapAmount);
        amountOut = swapRouter.exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: token,
                tokenOut: weth,
                fee: poolFee,
                recipient: address(this),
                amountIn: swapAmount,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0
            })
        );
        if (amountOut < minAmountOut) revert TooLittleReceived();

        IWETH9(weth).withdraw(amountOut);
        recipient.safeTransferETH(amountOut);
        emit Swapped(msg.sender, token, weth, amountIn, fee, amountOut);
    }

    receive() external payable {} // WETH.withdraw sends ETH here
}
