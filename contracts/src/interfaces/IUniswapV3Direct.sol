// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The slice of the Uniswap V3 pool surface used when talking to pools
///         DIRECTLY — no NonfungiblePositionManager, no SwapRouter. The Arc stack
///         holds its positions at the pool level (keyed by owner/tickLower/tickUpper)
///         and pays the pool from inside the mint/swap callbacks.
interface IUniswapV3PoolDirect {
    function initialize(uint160 sqrtPriceX96) external;

    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );

    /// @notice Mint liquidity for `recipient` over [tickLower, tickUpper]. The pool
    ///         calls `uniswapV3MintCallback` on msg.sender to get paid.
    function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data)
        external
        returns (uint256 amount0, uint256 amount1);

    /// @notice Burn liquidity from the caller's position. Burning 0 is the standard
    ///         "poke" that updates the position's fee growth so collect() sees the
    ///         fees accrued since the last touch.
    function burn(int24 tickLower, int24 tickUpper, uint128 amount)
        external
        returns (uint256 amount0, uint256 amount1);

    /// @notice Pay out tokens owed to the caller's position (accrued fees, and any
    ///         principal previously burned). Amounts are capped at what is owed.
    function collect(
        address recipient,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount0Requested,
        uint128 amount1Requested
    ) external returns (uint128 amount0, uint128 amount1);

    /// @notice Exact-in/out swap. The pool sends the output to `recipient` first,
    ///         then calls `uniswapV3SwapCallback` on msg.sender to collect the input.
    function swap(
        address recipient,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata data
    ) external returns (int256 amount0, int256 amount1);

    function token0() external view returns (address);
    function token1() external view returns (address);
    function liquidity() external view returns (uint128);
}

interface IUniswapV3MintCallback {
    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data) external;
}

interface IUniswapV3SwapCallback {
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external;
}
