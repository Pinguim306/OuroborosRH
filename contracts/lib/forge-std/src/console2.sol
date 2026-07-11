// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/// @notice Minimal no-op console shim (vendored). Real forge-std forwards to the
///         console address; here logs are compiled out to keep the repo dep-free.
library console2 {
    function log(string memory) internal pure {}
    function log(string memory, uint256) internal pure {}
    function log(string memory, address) internal pure {}
    function log(string memory, bool) internal pure {}
    function log(address) internal pure {}
    function log(uint256) internal pure {}
}
