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

    constructor(address _factory, address _weth) {
        factory = _factory;
        WETH = _weth;
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
        // Pull the tokens into the pair and keep the ETH (mock pooled liquidity).
        require(IERC20(token).transferFrom(msg.sender, pair, amountTokenDesired), "pull failed");
        (bool ok,) = pair.call{value: msg.value}("");
        require(ok, "eth to pair failed");
        return (amountTokenDesired, msg.value, 1e18);
    }
}
