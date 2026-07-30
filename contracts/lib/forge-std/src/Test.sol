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

    /// @dev Relative tolerance, 1e18-scaled like forge-std (0.01e18 = 1%).
    function assertApproxEqRel(uint256 a, uint256 b, uint256 maxPercentDelta, string memory err)
        internal
        pure
    {
        if (b == 0) {
            require(a == 0, err);
            return;
        }
        uint256 delta = a > b ? a - b : b - a;
        require((delta * 1e18) / b <= maxPercentDelta, err);
    }

    function assertGt(int256 a, int256 b, string memory err) internal pure {
        require(a > b, err);
    }

    function assertEq(int256 a, int256 b, string memory err) internal pure {
        require(a == b, err);
    }

    function assertEq(address a, address b, string memory err) internal pure {
        require(a == b, err);
    }

    /// @dev forge-std's makeAddr, minus the label (the vendored Vm keeps labels optional).
    function makeAddr(string memory name) internal pure returns (address a) {
        a = vm.addr(uint256(keccak256(abi.encodePacked(name))));
    }

    /// @dev CREATE address for (deployer, nonce) — RLP for nonces a fresh contract
    ///      actually uses (1..127 covers every case in these tests).
    function computeCreateAddress(address deployer, uint256 nonce) internal pure returns (address) {
        require(nonce > 0 && nonce < 128, "nonce out of shim range");
        return address(
            uint160(
                uint256(
                    keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, bytes1(uint8(nonce))))
                )
            )
        );
    }
}
