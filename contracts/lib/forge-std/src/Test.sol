// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

import {Vm} from "./Vm.sol";

/// @notice Minimal vendored test base (subset of forge-std's Test). Assertions
///         revert on failure, which Foundry reports as a failed test. For the full
///         DSTest/StdAssertions surface, install foundry-rs/forge-std.
abstract contract Test {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function assertTrue(bool condition) internal pure {
        require(condition, "assertTrue failed");
    }

    function assertTrue(bool condition, string memory err) internal pure {
        require(condition, err);
    }

    function assertFalse(bool condition) internal pure {
        require(!condition, "assertFalse failed");
    }

    function assertEq(uint256 a, uint256 b) internal pure {
        require(a == b, "assertEq(uint) failed");
    }

    function assertEq(uint256 a, uint256 b, string memory err) internal pure {
        require(a == b, err);
    }

    function assertEq(address a, address b) internal pure {
        require(a == b, "assertEq(address) failed");
    }

    function assertEq(int256 a, int256 b) internal pure {
        require(a == b, "assertEq(int) failed");
    }

    function assertEq(bool a, bool b) internal pure {
        require(a == b, "assertEq(bool) failed");
    }

    function assertGt(uint256 a, uint256 b) internal pure {
        require(a > b, "assertGt failed");
    }

    function assertGt(uint256 a, uint256 b, string memory err) internal pure {
        require(a > b, err);
    }

    function assertGe(uint256 a, uint256 b) internal pure {
        require(a >= b, "assertGe failed");
    }

    function assertLt(uint256 a, uint256 b) internal pure {
        require(a < b, "assertLt failed");
    }

    function assertLe(uint256 a, uint256 b) internal pure {
        require(a <= b, "assertLe failed");
    }

    function assertApproxEqAbs(uint256 a, uint256 b, uint256 maxDelta) internal pure {
        uint256 delta = a > b ? a - b : b - a;
        require(delta <= maxDelta, "assertApproxEqAbs failed");
    }

    function assertApproxEqAbs(uint256 a, uint256 b, uint256 maxDelta, string memory err)
        internal
        pure
    {
        uint256 delta = a > b ? a - b : b - a;
        require(delta <= maxDelta, err);
    }
}
