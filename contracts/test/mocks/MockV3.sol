// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "src/interfaces/IERC20.sol";
import {INonfungiblePositionManager, ISwapRouter02} from "src/interfaces/IUniswapV3.sol";

/// @notice Just enough Uniswap V3 to exercise the instant-V3 launch wiring in unit
///         tests: pool creation/initialization, single-sided mint (pulls the token
///         side), fee collection, and the dev-buy swap. Not real AMM math — the
///         price/tick behavior must be validated with fork tests against the live
///         Uniswap V3 before deploying.

contract MockWETH9 {
    string public constant name = "Wrapped Ether";
    mapping(address => uint256) public balanceOf;

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "weth send failed");
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    receive() external payable {}
}

contract MockV3Pool {
    uint160 public sqrtPriceX96;
    bool public initialized;

    function initialize(uint160 _sqrtPriceX96) external {
        require(!initialized, "AI"); // matches the real pool's revert on re-init
        sqrtPriceX96 = _sqrtPriceX96;
        initialized = true;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (sqrtPriceX96, 0, 0, 0, 0, 0, true);
    }
}

contract MockV3Factory {
    mapping(bytes32 => address) public pools;

    function _key(address a, address b, uint24 fee) internal pure returns (bytes32) {
        (address t0, address t1) = a < b ? (a, b) : (b, a);
        return keccak256(abi.encodePacked(t0, t1, fee));
    }

    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[_key(a, b, fee)];
    }

    function createPool(address a, address b, uint24 fee) external returns (address pool) {
        pool = address(new MockV3Pool());
        pools[_key(a, b, fee)] = pool;
    }
}

contract MockPositionManager {
    address public immutable factory;
    address public immutable WETH9;

    uint256 public nextId = 1;

    struct Minted {
        address token0;
        address token1;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0;
        uint256 amount1;
        address recipient;
    }

    mapping(uint256 => Minted) public minted;

    // Fees the next collect() call will hand out (funded by the test).
    uint256 public pendingCollect0;
    uint256 public pendingCollect1;

    constructor(address _factory, address _weth) {
        factory = _factory;
        WETH9 = _weth;
    }

    function mint(INonfungiblePositionManager.MintParams calldata p)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        tokenId = nextId++;
        // Pull the offered side(s), mimicking a real single-sided mint. A tiny bit is
        // left behind so the launchpad's dust-burn path gets exercised.
        amount0 = p.amount0Desired > 1e18 ? p.amount0Desired - 1e18 : p.amount0Desired;
        amount1 = p.amount1Desired > 1e18 ? p.amount1Desired - 1e18 : p.amount1Desired;
        if (amount0 > 0) IERC20(p.token0).transferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(p.token1).transferFrom(msg.sender, address(this), amount1);
        minted[tokenId] = Minted(p.token0, p.token1, p.tickLower, p.tickUpper, amount0, amount1, p.recipient);
        liquidity = 1e18;
    }

    /// @dev Test hook: set what the next collect() pays out (already held by this mock).
    function setPendingFees(uint256 fee0, uint256 fee1) external {
        pendingCollect0 = fee0;
        pendingCollect1 = fee1;
    }

    function collect(INonfungiblePositionManager.CollectParams calldata p)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        Minted memory m = minted[p.tokenId];
        amount0 = pendingCollect0;
        amount1 = pendingCollect1;
        pendingCollect0 = 0;
        pendingCollect1 = 0;
        if (amount0 > 0) IERC20(m.token0).transfer(p.recipient, amount0);
        if (amount1 > 0) IERC20(m.token1).transfer(p.recipient, amount1);
    }
}

contract MockSwapRouter02 {
    ISwapRouter02.ExactInputSingleParams public lastSwap;
    uint256 public lastValue;
    uint256 public swapCount;

    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 amountOut)
    {
        lastSwap = p;
        lastValue = msg.value;
        swapCount++;
        return 0; // no real AMM here; the recorded call is what the tests assert on
    }
}
