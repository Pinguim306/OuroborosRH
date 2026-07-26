// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/test/shared/HookMiner.sol";

import {CoilHook} from "../src/CoilHook.sol";
import {CoilLaunchpad} from "../src/CoilLaunchpad.sol";
import {MockPoolManager, MockPermit2, MockPosm} from "./mocks/MockV4.sol";

/// @dev Logic-level coverage of the CoilLaunchpad factory against v4 mocks: it deploys a CoilHook
///   at a mined (flag-valid) CREATE2 address, seeds it, renounces, records the market and takes
///   the creation fee. The real pool/seed/swap mechanics are covered by test/e2e (native solc).
contract CoilLaunchpadUnitTest is Test {
    CoilLaunchpad pad;
    MockPoolManager pm;
    MockPosm posm;
    MockPermit2 permit2;

    address owner = makeAddr("owner");
    address protocolWallet = makeAddr("protocolWallet");
    address treasury = makeAddr("treasury");
    address launcher = makeAddr("launcher");

    uint256 constant CREATION_FEE = 0.01 ether;
    uint256 constant SUPPLY = 1_000_000 ether;
    // Fee curve under test: 45% of the fee to the protocol on a 1% token, sliding to 25% on a 5%
    // one; 20% of whatever is left is the burn cut. 25% (not 20%) at the ceiling is what keeps the
    // protocol's absolute take rising across the whole range — see FeeCurve's note.
    uint256 constant SHARE_AT_MIN = 4500;
    uint256 constant SHARE_AT_MAX = 2500;
    uint256 constant BURN_SHARE = 2000;
    /// @dev The rate most tests launch at (1%), matching the launchpad's floor.
    uint256 constant FEE_BPS = 100;
    int24 constant TICK_LOWER = -6000;
    int24 constant TICK_UPPER = 0;

    uint160 constant FLAGS = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);

    function setUp() public {
        pm = new MockPoolManager();
        posm = new MockPosm();
        permit2 = new MockPermit2();

        CoilLaunchpad.FeeCurve memory feeCurve = CoilLaunchpad.FeeCurve({
            protocolShareAtMinBps: SHARE_AT_MIN,
            protocolShareAtMaxBps: SHARE_AT_MAX,
            burnShareOfRemainderBps: BURN_SHARE
        });

        // Off-chain pricing is opaque to this mock suite — MockPosm.multicall ignores the seed
        // params — so plausible constants suffice here (sqrtPriceX96 at tick 0 = 2**96). The real
        // pricing is exercised in the e2e suite against a live PoolManager. See test/e2e.
        CoilLaunchpad.LaunchConfig memory launch = CoilLaunchpad.LaunchConfig({
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            sqrtPriceX96: 79228162514264337593543950336, // TickMath.getSqrtPriceAtTick(0)
            liquidity: uint128(1e24)
        });

        pad = new CoilLaunchpad(
            owner, IPoolManager(address(pm)), address(posm), address(permit2),
            protocolWallet, treasury, CREATION_FEE, SUPPLY, feeCurve, launch
        );
    }

    /// @dev Reproduce the launchpad's exact constructor args so HookMiner finds a matching salt.
    function _mine(string memory name, string memory symbol, address creator)
        internal
        view
        returns (bytes32 salt, address predicted)
    {
        return _mine(name, symbol, creator, FEE_BPS);
    }

    function _mine(string memory name, string memory symbol, address creator, uint256 totalFeeBps)
        internal
        view
        returns (bytes32 salt, address predicted)
    {
        bytes memory args = abi.encode(
            IPoolManager(address(pm)),
            address(pad), // owner = the launchpad
            address(posm),
            address(permit2),
            protocolWallet,
            treasury,
            creator,
            SUPPLY,
            name,
            symbol,
            pad.resolveFees(totalFeeBps)
        );
        (predicted, salt) = HookMiner.find(address(pad), FLAGS, type(CoilHook).creationCode, args);
    }

    function test_Config() public view {
        assertEq(pad.LAUNCHPAD_VERSION(), 4);
        assertEq(pad.feeRecipient(), protocolWallet);
        assertEq(pad.platformTreasury(), treasury);
        assertEq(pad.creationFee(), CREATION_FEE);
        assertEq(pad.tokenSupply(), SUPPLY);
    }

    /*                        FEE CURVE                           */

    /// @dev The two anchors the curve is specified by: 45% of a 1% fee, 20% of a 5% one.
    function test_FeeCurve_HitsBothAnchors() public view {
        CoilHook.FeeConfig memory lo = pad.resolveFees(100);
        assertEq(lo.protocolBps + lo.holderBps + lo.burnBps, 100, "1% splits to exactly 1%");
        assertEq(lo.protocolBps, 45, "45% of 100 bps");

        CoilHook.FeeConfig memory hi = pad.resolveFees(500);
        assertEq(hi.protocolBps + hi.holderBps + hi.burnBps, 500, "5% splits to exactly 5%");
        assertEq(hi.protocolBps, 125, "25% of 500 bps");
    }

    /// @dev The point of the curve: the protocol's SHARE falls as the creator raises the rate,
    ///   while its absolute take still grows. Both directions matter — a share that rose would
    ///   invert the incentive, and an absolute take that shrank would punish the platform.
    function test_FeeCurve_ShareFallsWhileTakeGrows() public view {
        uint256 prevShare = type(uint256).max;
        uint256 prevTake = 0;
        for (uint256 total = 100; total <= 500; total += 50) {
            CoilHook.FeeConfig memory f = pad.resolveFees(total);
            uint256 share = f.protocolBps * 10_000 / total;
            assertLt(share, prevShare, "protocol share must fall as the rate rises");
            assertGt(f.protocolBps, prevTake, "protocol take must still grow");
            assertGe(share, 2500, "share never drops below the ceiling-end anchor");
            prevShare = share;
            prevTake = f.protocolBps;
        }
    }

    /// @dev No value may be lost to rounding: the hook pays each bucket as a proportion of the
    ///   total, so the three parts have to reconstitute it exactly at every rate.
    function testFuzz_FeeCurve_SplitsExactly(uint256 total) public view {
        total = bound(total, pad.MIN_FEE_BPS(), pad.MAX_FEE_BPS());
        CoilHook.FeeConfig memory f = pad.resolveFees(total);
        assertEq(f.protocolBps + f.holderBps + f.burnBps, total, "no dust lost");
        assertGt(f.holderBps, 0, "creator/holder slice is never zero");
    }

    function test_FeeCurve_RejectsOutOfRange() public {
        // Read the bounds FIRST: `vm.expectRevert` attaches to the very next call, and a getter
        // invoked inside the argument list would be that call.
        uint256 belowMin = pad.MIN_FEE_BPS() - 1;
        uint256 aboveMax = pad.MAX_FEE_BPS() + 1;

        vm.expectRevert(CoilLaunchpad.InvalidTotalFee.selector);
        pad.resolveFees(belowMin);
        vm.expectRevert(CoilLaunchpad.InvalidTotalFee.selector);
        pad.resolveFees(aboveMax);
    }

    /// @dev A curve whose share RISES with the rate is rejected outright — it would mean a creator
    ///   raising their fee hands the protocol a bigger cut of a bigger number, twice over.
    function test_FeeCurve_RejectsNonMonotonic() public {
        vm.prank(owner);
        vm.expectRevert(CoilLaunchpad.InvalidFeeCurve.selector);
        pad.setFeeCurve(
            CoilLaunchpad.FeeCurve({
                protocolShareAtMinBps: 2000,
                protocolShareAtMaxBps: 4500,
                burnShareOfRemainderBps: 0
            })
        );
    }

    function test_FeeCurve_OnlyOwnerCanSet() public {
        vm.prank(launcher);
        vm.expectRevert();
        pad.setFeeCurve(
            CoilLaunchpad.FeeCurve({
                protocolShareAtMinBps: 3000,
                protocolShareAtMaxBps: 3000,
                burnShareOfRemainderBps: 0
            })
        );
    }

    /// @dev A chain with no $COIL sets the burn share to zero; everything left is the creator's.
    function test_FeeCurve_ZeroBurnGivesRemainderToCreator() public {
        vm.prank(owner);
        pad.setFeeCurve(
            CoilLaunchpad.FeeCurve({
                protocolShareAtMinBps: SHARE_AT_MIN,
                protocolShareAtMaxBps: SHARE_AT_MAX,
                burnShareOfRemainderBps: 0
            })
        );
        CoilHook.FeeConfig memory f = pad.resolveFees(200);
        assertEq(f.burnBps, 0, "nothing to burn");
        assertEq(f.protocolBps + f.holderBps, 200, "creator takes the whole remainder");
    }

    /// @dev The rate is baked into the hook's constructor args, so it is part of the mined address.
    ///   A launch whose salt was mined for a different rate must not land.
    function test_CreateV4_SaltMinedForAnotherRateReverts() public {
        (bytes32 salt,) = _mine("Rate", "RATE", address(0), 100);
        vm.deal(launcher, 1 ether);
        vm.prank(launcher);
        vm.expectRevert();
        pad.createTokenV4{value: CREATION_FEE}("Rate", "RATE", "ipfs://r", salt, false, 300);
    }

    /// @dev A launch at a non-default rate carries that exact waterfall into the deployed hook.
    function test_CreateV4_CustomRateReachesTheHook() public {
        (bytes32 salt, address predicted) = _mine("Rich", "RICH", address(0), 300);
        vm.deal(launcher, 1 ether);
        vm.prank(launcher);
        (address token,) =
            pad.createTokenV4{value: CREATION_FEE}("Rich", "RICH", "ipfs://rich", salt, false, 300);
        assertEq(token, predicted, "landed at the mined address");

        CoilHook.FeeConfig memory expected = pad.resolveFees(300);
        CoilHook hook = CoilHook(payable(token));
        assertEq(hook.TOTAL_FEE_BPS(), 300, "hook carries the chosen rate");
        assertEq(hook.PROTOCOL_FEE_BPS(), expected.protocolBps);
        assertEq(hook.HOLDER_FEE_BPS(), expected.holderBps);
        assertEq(hook.BURN_FEE_BPS(), expected.burnBps);
    }

    function test_CreateV4_LoopRewards() public {
        (bytes32 salt, address predicted) = _mine("Snek", "SNEK", address(0));

        uint256 protoBefore = protocolWallet.balance;
        vm.deal(launcher, 1 ether);
        vm.prank(launcher);
        (address token, uint256 positionId) =
            pad.createTokenV4{value: CREATION_FEE}("Snek", "SNEK", "ipfs://x", salt, false, FEE_BPS);

        assertEq(token, predicted, "hook landed at the mined address");
        assertEq(uint160(token) & Hooks.ALL_HOOK_MASK, FLAGS, "address encodes the hook flags");
        assertTrue(positionId > 0);

        CoilHook hook = CoilHook(payable(token));
        assertEq(hook.name(), "Snek");
        assertEq(hook.symbol(), "SNEK");
        assertEq(hook.totalSupply(), SUPPLY);
        assertTrue(hook.seeded(), "pool seeded");
        assertEq(hook.owner(), address(0), "ownership renounced");
        assertEq(hook.feeRecipient(), protocolWallet);
        assertEq(hook.platformTreasury(), treasury);
        assertEq(hook.creator(), address(0), "Loop Rewards -> no creator");

        // Market recorded, creation fee paid to the protocol wallet.
        assertEq(pad.marketsCount(), 1);
        assertEq(pad.marketIndexByToken(token), 1);
        assertEq(protocolWallet.balance - protoBefore, CREATION_FEE, "creation fee to protocol");
    }

    function test_CreateV4_CreatorRewards() public {
        // Creator Rewards → creator == the launching wallet, baked into the mined address.
        (bytes32 salt, address predicted) = _mine("Coily", "COILY", launcher);

        vm.deal(launcher, 1 ether);
        vm.prank(launcher);
        (address token,) = pad.createTokenV4{value: CREATION_FEE}("Coily", "COILY", "ipfs://y", salt, true, FEE_BPS);

        assertEq(token, predicted);
        CoilHook hook = CoilHook(payable(token));
        assertEq(hook.creator(), launcher, "creator = launcher");
        assertTrue(hook.isExcluded(launcher), "creator excluded from dividends");

        CoilLaunchpad.Market memory m = _market(0);
        assertTrue(m.creatorRewards);
        assertEq(m.creator, launcher);
    }

    function test_CreateV4_RefundsExcess() public {
        (bytes32 salt,) = _mine("Ref", "REF", address(0));
        vm.deal(launcher, 1 ether);
        uint256 before = launcher.balance;
        vm.prank(launcher);
        pad.createTokenV4{value: 0.5 ether}("Ref", "REF", "ipfs://z", salt, false, FEE_BPS);
        // Spent exactly the creation fee; the rest refunded.
        assertEq(before - launcher.balance, CREATION_FEE, "only the creation fee was spent");
    }

    function test_CreateV4_InsufficientFee_Reverts() public {
        (bytes32 salt,) = _mine("Low", "LOW", address(0));
        vm.deal(launcher, 1 ether);
        vm.prank(launcher);
        vm.expectRevert(CoilLaunchpad.InsufficientCreationFee.selector);
        pad.createTokenV4{value: CREATION_FEE - 1}("Low", "LOW", "ipfs://q", salt, false, FEE_BPS);
    }

    function test_CreateV4_WrongSalt_Reverts() public {
        // A salt that does not land on a flag-valid address → the hook's own permission check
        // reverts, so the whole launch reverts (fails safely).
        vm.deal(launcher, 1 ether);
        vm.prank(launcher);
        vm.expectRevert();
        pad.createTokenV4{value: CREATION_FEE}("Bad", "BAD", "ipfs://b", bytes32(uint256(1)), false, FEE_BPS);
    }

    function _market(uint256 i) internal view returns (CoilLaunchpad.Market memory m) {
        (
            address token,
            address creator,
            bool creatorRewards,
            string memory name,
            string memory symbol,
            string memory metadataURI,
            uint256 createdAt
        ) = pad.markets(i);
        m = CoilLaunchpad.Market(token, creator, creatorRewards, name, symbol, metadataURI, createdAt);
    }

    receive() external payable {}
}
