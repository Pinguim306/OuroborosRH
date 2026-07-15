// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {CoilSwapRouterV3, ISwapRouter02} from "../../src/CoilSwapRouterV3.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
}

/// @dev Fork proof of CoilSwapRouterV3 against Robinhood Chain's REAL SwapRouter02 and a live v3
///   pool: a real buy/sell through the wrapper skims the interface fee and forwards the rest.
///
///   Provide a token that has a 1%-tier v3 pool with liquidity (e.g. one of your instant-V3
///   launches — those carry no transfer tax, which v3 requires) and the chain's WETH:
///     V3_TEST_TOKEN=0x…  WETH_ADDRESS=0x…  \
///     FOUNDRY_PROFILE=e2e forge test --match-contract CoilSwapRouterV3ForkTest \
///       --fork-url $RPC_URL -vv
///   Self-skips off chain id 4663 or when V3_TEST_TOKEN/WETH_ADDRESS are unset, so plain runs are
///   never broken.
contract CoilSwapRouterV3ForkTest is Test {
    // Uniswap SwapRouter02 on Robinhood Chain (override via SWAP_ROUTER_02).
    address constant DEFAULT_SWAP02 = 0xCaf681a66D020601342297493863E78C959E5cb2;
    uint256 constant IFEE_BPS = 20; // 0.20%

    CoilSwapRouterV3 router;
    address feeRecipient = makeAddr("feeRecipient");
    address alice = makeAddr("alice");
    address token;
    address weth;

    function setUp() public {
        if (block.chainid != 4663) {
            vm.skip(true);
            return;
        }
        token = vm.envOr("V3_TEST_TOKEN", address(0));
        weth = vm.envOr("WETH_ADDRESS", address(0));
        if (token == address(0) || weth == address(0)) {
            vm.skip(true);
            return;
        }
        address swap02 = vm.envOr("SWAP_ROUTER_02", DEFAULT_SWAP02);
        require(swap02.code.length > 0, "SwapRouter02 has no code on this fork");

        router = new CoilSwapRouterV3(ISwapRouter02(swap02), weth, address(this), feeRecipient, IFEE_BPS);
    }

    /// @dev Buy: the interface fee is skimmed off the ETH, the rest buys the token for the trader.
    function test_Fork_Buy_TakesInterfaceFee() public {
        uint256 ethIn = 0.01 ether;
        vm.deal(alice, ethIn);

        uint256 feeBefore = feeRecipient.balance;
        vm.prank(alice);
        uint256 out = router.buy{value: ethIn}(token, 0, alice, block.timestamp + 1);

        assertEq(feeRecipient.balance - feeBefore, ethIn * IFEE_BPS / 10_000, "interface fee taken (ETH)");
        assertEq(IERC20(token).balanceOf(alice), out, "alice received the token");
        assertGt(out, 0);
        console2.log("bought:", out);
    }

    /// @dev Sell: the interface fee is skimmed off the token, the rest is swapped to ETH.
    function test_Fork_Sell_TakesInterfaceFee() public {
        // Buy first so alice holds the token.
        uint256 ethIn = 0.02 ether;
        vm.deal(alice, ethIn);
        vm.prank(alice);
        uint256 bought = router.buy{value: ethIn}(token, 0, alice, block.timestamp + 1);
        uint256 sellAmt = bought / 2;
        require(sellAmt > 0, "nothing bought - pool may be empty");

        vm.prank(alice);
        IERC20(token).approve(address(router), sellAmt);

        uint256 feeTokBefore = IERC20(token).balanceOf(feeRecipient);
        uint256 ethBefore = alice.balance;
        vm.prank(alice);
        uint256 ethOut = router.sell(token, sellAmt, 0, alice, block.timestamp + 1);

        assertEq(
            IERC20(token).balanceOf(feeRecipient) - feeTokBefore,
            sellAmt * IFEE_BPS / 10_000,
            "interface fee taken (token)"
        );
        assertEq(alice.balance - ethBefore, ethOut, "alice received ETH");
        assertGt(ethOut, 0);
        console2.log("sold for ETH:", ethOut);
    }
}
