// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Uniswap-V2-style router interface. On Robinhood Chain a real
///         graduation would add the curve's locked reserves as liquidity here and
///         burn/lock the LP. Kept as an interface so the reference suite stays
///         self-contained and testable without a live DEX.
interface IDexRouter {
    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    ) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);
}
