// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "src/interfaces/IERC20.sol";
import {IDexFactory} from "src/interfaces/IDexRouter.sol";

/// @notice Trivial Uniswap-V2-style mocks — just enough to exercise graduation in
///         tests (resolve a pair address, pull tokens, accept ETH). Not real AMMs.

contract MockWETH {}

contract MockPair {
    // A pooled-liquidity sink. Holds tokens; needs no logic for the tests.
    receive() external payable {}
}

contract MockDexFactory is IDexFactory {
    mapping(address => mapping(address => address)) public pairs;

    function getPair(address a, address b) external view returns (address) {
        return pairs[a][b];
    }

    function createPair(address a, address b) external returns (address pair) {
        pair = address(new MockPair());
        pairs[a][b] = pair;
        pairs[b][a] = pair;
    }
}

contract MockDexRouter {
    address public factory;
    address public WETH;

    /// @dev Simulates a pre-seeded/skewed pair: the router only uses part of the
    ///      offered amounts and refunds the excess ETH to the caller — exactly what
    ///      the real UniswapV2Router02 does when the pair already has reserves.
    uint256 public refundBps;

    constructor(address _factory, address _weth) {
        factory = _factory;
        WETH = _weth;
    }

    function setRefundBps(uint256 _refundBps) external {
        refundBps = _refundBps;
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256,
        uint256,
        address,
        uint256
    ) external payable returns (uint256, uint256, uint256) {
        address pair = IDexFactory(factory).getPair(token, WETH);
        if (pair == address(0)) pair = IDexFactory(factory).createPair(token, WETH);

        uint256 tokenUsed = amountTokenDesired - (amountTokenDesired * refundBps) / 10_000;
        uint256 ethUsed = msg.value - (msg.value * refundBps) / 10_000;

        // Pull only the used tokens into the pair and keep the used ETH there.
        require(IERC20(token).transferFrom(msg.sender, pair, tokenUsed), "pull failed");
        (bool ok,) = pair.call{value: ethUsed}("");
        require(ok, "eth to pair failed");

        // Refund the excess ETH to the caller (reverts if the caller can't receive).
        uint256 refund = msg.value - ethUsed;
        if (refund > 0) {
            (bool ok2,) = msg.sender.call{value: refund}("");
            require(ok2, "refund failed");
        }
        return (tokenUsed, ethUsed, 1e18);
    }
}
