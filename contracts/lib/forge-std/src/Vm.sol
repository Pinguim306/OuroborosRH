// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0;

/// @notice Minimal vendored subset of forge-std's Vm cheatcode interface — only the
///         cheatcodes used by this repo's tests/scripts, so the suite builds with no
///         `forge install`. For the full interface, install foundry-rs/forge-std.
interface Vm {
    function warp(uint256 newTimestamp) external;
    function deal(address who, uint256 newBalance) external;
    function prank(address sender) external;
    function startPrank(address sender) external;
    function stopPrank() external;
    function expectRevert() external;
    function expectRevert(bytes4 revertData) external;
    function expectRevert(bytes calldata revertData) external;
    function addr(uint256 privateKey) external pure returns (address keyAddr);
    function envUint(string calldata name) external view returns (uint256 value);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function label(address account, string calldata newLabel) external;
    function assume(bool condition) external pure;
}
