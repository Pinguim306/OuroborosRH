// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {DeployCoilLaunchpad} from "../script/DeployCoilLaunchpad.s.sol";

/// @notice The deploy script's v4-infra preflight.
///
/// This exists because of a real chain: Arc (5042) runs the Uniswap v4 PoolManager, StateView and
/// Quoter at byte-for-byte the same addresses as Robinhood Chain, but has NO PositionManager and no
/// UniversalRouter — the two whose constructors need a WETH9 that Arc doesn't have. Copying a
/// sibling chain's env across therefore produces a launchpad that deploys cleanly and then reverts
/// on every launch, inside `CoilHook.seed()`, where the locked position is minted through the POSM.
///
/// A `!= address(0)` check cannot catch that. These cases pin down what can.
contract MockPoolManager {
    address public protocolFeeController;
}

contract MockPosm {
    address public poolManager;

    constructor(address pm) {
        poolManager = pm;
    }
}

/// @dev Has code, answers nothing — a stand-in for "some other contract lives at this address".
contract Opaque {}

/// @dev The guard is internal to the script (it runs inside `run()`), so expose it for testing
///   rather than duplicating its logic here.
contract PreflightHarness is DeployCoilLaunchpad {
    function check(address pm, address posm, address permit2) external view {
        _assertV4Infra(pm, posm, permit2);
    }
}

contract DeployPreflightTest is Test {
    PreflightHarness harness;
    MockPoolManager pm;
    MockPosm posm;
    Opaque permit2;

    function setUp() public {
        harness = new PreflightHarness();
        pm = new MockPoolManager();
        posm = new MockPosm(address(pm));
        permit2 = new Opaque();
    }

    function test_PassesWhenPosmIsBoundToThisPoolManager() public view {
        harness.check(address(pm), address(posm), address(permit2));
    }

    /// The Arc case, exactly: PoolManager present, PositionManager address empty.
    function test_RevertsWhenPositionManagerHasNoCode() public {
        address empty = address(uint160(0xB0B));
        assertEq(empty.code.length, 0, "fixture must be an empty address");
        vm.expectRevert("POSITION_MANAGER has no code on this chain");
        harness.check(address(pm), empty, address(permit2));
    }

    function test_RevertsWhenPoolManagerHasNoCode() public {
        vm.expectRevert("POOL_MANAGER has no code on this chain");
        harness.check(address(uint160(0xB0B)), address(posm), address(permit2));
    }

    function test_RevertsWhenPermit2HasNoCode() public {
        vm.expectRevert("PERMIT2 has no code on this chain");
        harness.check(address(pm), address(posm), address(uint160(0xB0B)));
    }

    /// Something is deployed there, it just isn't a PoolManager.
    function test_RevertsWhenPoolManagerIsSomethingElse() public {
        Opaque notAPoolManager = new Opaque();
        vm.expectRevert("POOL_MANAGER is not a v4 PoolManager (protocolFeeController() failed)");
        harness.check(address(notAPoolManager), address(posm), address(permit2));
    }

    function test_RevertsWhenPositionManagerIsSomethingElse() public {
        Opaque notAPosm = new Opaque();
        vm.expectRevert("POSITION_MANAGER is not a v4 PositionManager");
        harness.check(address(pm), address(notAPosm), address(permit2));
    }

    /// The subtle one: a genuine POSM, but wired to a different PoolManager singleton. It would
    /// deploy and then mint liquidity into a pool nobody trades on.
    function test_RevertsWhenPositionManagerBelongsToAnotherPoolManager() public {
        MockPoolManager other = new MockPoolManager();
        MockPosm strayPosm = new MockPosm(address(other));
        vm.expectRevert("POSITION_MANAGER belongs to a different PoolManager");
        harness.check(address(pm), address(strayPosm), address(permit2));
    }
}
