// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {CoilBuybackBurner, ICoilSwapRouter} from "../../src/CoilBuybackBurner.sol";

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
}

/// @dev Fork proof of CoilBuybackBurner against Robinhood Chain's live CoilSwapRouter and the real
///   $COIL pool: funding the burner with ETH and calling buybackAndBurn() buys COIL and parks it at
///   the dead address (a burn).
///
///   Provide the deployed router and the launched COIL token:
///     COIL_SWAP_ROUTER=0x…  COIL_ADDRESS=0x…  \
///     FOUNDRY_PROFILE=e2e forge test --match-contract CoilBuybackBurnerForkTest \
///       --fork-url $RPC_URL -vv
///   Self-skips off chain id 4663 or when the envs are unset, so plain runs are never broken.
contract CoilBuybackBurnerForkTest is Test {
    address constant DEAD = 0x000000000000000000000000000000000000dEaD;

    CoilBuybackBurner burner;
    address coil;

    function setUp() public {
        if (block.chainid != 4663) {
            vm.skip(true);
            return;
        }
        address router = vm.envOr("COIL_SWAP_ROUTER", address(0));
        coil = vm.envOr("COIL_ADDRESS", address(0));
        if (router == address(0) || coil == address(0)) {
            vm.skip(true);
            return;
        }
        require(router.code.length > 0, "CoilSwapRouter has no code on this fork");
        require(coil.code.length > 0, "COIL has no code on this fork");

        burner = new CoilBuybackBurner(ICoilSwapRouter(router), address(this));
        burner.setCoil(coil);
    }

    /// @dev The accrued ETH buys COIL, and the bought COIL lands at the dead address (burned).
    function test_Fork_BuybackAndBurn() public {
        uint256 ethIn = 0.02 ether;
        vm.deal(address(burner), ethIn);

        uint256 deadBefore = IERC20(coil).balanceOf(DEAD);
        uint256 burned = burner.buybackAndBurn(0, 0, block.timestamp + 1);

        assertGt(burned, 0, "bought some COIL");
        assertEq(IERC20(coil).balanceOf(DEAD) - deadBefore, burned, "burned COIL parked at DEAD");
        assertEq(address(burner).balance, 0, "spent the whole ETH balance");
        assertEq(burner.totalCoilBurned(), burned, "burn accounting");
        console2.log("COIL burned:", burned);
    }
}
