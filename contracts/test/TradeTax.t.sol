// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OuroToken} from "src/OuroToken.sol";

/// @notice Unit tests for the post-graduation trade tax (fee-on-transfer). This
///         contract is the token's authority, so it can set the pair directly —
///         standing in for what the bonding curve does at graduation.
contract TradeTaxTest is Test {
    OuroToken internal token;

    address internal vault = address(0x7A17); // protocol vault
    address internal pair = address(0xDE43); // DEX pair
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant SUPPLY = 1_000_000 ether;
    uint256 internal constant TAX_BPS = 100; // 1%

    function setUp() public {
        // to = authority = address(this): the "factory" holds supply and can set the pair.
        token = new OuroToken("Loop", "LOOP", SUPPLY, address(this), address(this), "", TAX_BPS, vault);
        // Fund the pair and a user BEFORE the pair is set, so setup isn't taxed.
        token.transfer(pair, 400_000 ether);
        token.transfer(alice, 100_000 ether);
        token.setDexPair(pair);
    }

    function testBuyIsTaxed() public {
        // Buy = tokens flow pair -> user.
        vm.prank(pair);
        token.transfer(bob, 1_000 ether);
        assertEq(token.balanceOf(bob), 990 ether); // 1% skimmed
        assertEq(token.balanceOf(vault), 10 ether);
    }

    function testSellIsTaxed() public {
        // Sell = tokens flow user -> pair.
        vm.prank(alice);
        token.transfer(pair, 1_000 ether);
        assertEq(token.balanceOf(vault), 10 ether);
        // The pair receives 990 (net of tax) on top of its initial 400k.
        assertEq(token.balanceOf(pair), 400_000 ether + 990 ether);
    }

    function testWalletTransferNotTaxed() public {
        // Neither side is the pair → no tax.
        vm.prank(alice);
        token.transfer(bob, 1_000 ether);
        assertEq(token.balanceOf(bob), 1_000 ether);
        assertEq(token.balanceOf(vault), 0);
    }

    function testExemptSideNotTaxed() public {
        token.setTaxExempt(alice, true);
        vm.prank(alice);
        token.transfer(pair, 1_000 ether);
        assertEq(token.balanceOf(vault), 0); // exempt seller pays no tax
    }

    function testNoTaxBeforePairSet() public {
        OuroToken fresh =
            new OuroToken("Pre", "PRE", SUPPLY, address(this), address(this), "", TAX_BPS, vault);
        // dexPair unset → even a transfer to the future pair address isn't taxed.
        fresh.transfer(pair, 1_000 ether);
        assertEq(fresh.balanceOf(pair), 1_000 ether);
        assertEq(fresh.balanceOf(vault), 0);
    }

    function testTaxCannotExceedCap() public {
        vm.expectRevert(OuroToken.TaxTooHigh.selector);
        new OuroToken("Bad", "BAD", SUPPLY, address(this), address(this), "", 300, vault); // >2%
    }

    function testPairCannotBeChangedAfterRenounce() public {
        token.renounceAuthority();
        vm.expectRevert(OuroToken.NotAuthority.selector);
        token.setDexPair(address(0xBEEF));
    }
}
