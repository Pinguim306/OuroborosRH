// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "@uniswap/v4-core/src/PoolManager.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
// PositionManager itself is deliberately NOT imported — it is pinned to 500 optimizer runs (the only
// setting it fits EIP-170 at), and a pinned file may only be imported by files pinned the same way.
// It is reached through its artifact instead, built by src/vendor/PositionManagerArtifact.sol, and
// deployed here exactly as the deploy script does it. Only the interface is safe to import.
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";

import {CoilHook} from "../../src/CoilHook.sol";
import {CoilLaunchpad} from "../../src/CoilLaunchpad.sol";

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @dev The slice of Permit2's `IAllowanceTransfer` that a PositionManager settlement actually uses:
///   the owner approves a spender for a token, the spender pulls with `transferFrom`.
///
///   A stand-in is needed because the real Permit2 pins `pragma solidity =0.8.17` and cannot compile
///   inside this 0.8.26 project — which is also why the existing fork tests only ever meet it on a
///   real chain. It does not weaken what this test checks: the real Permit2 IS deployed on Arc at the
///   canonical address with the expected code (verified on-chain), so Arc's uncertainty was never
///   Permit2 — it was the missing PositionManager. What must be faithful here is the allowance
///   bookkeeping the hook's constructor sets up and POSM then relies on, and that is what this is.
contract StandInPermit2 {
    mapping(address => mapping(address => mapping(address => uint160))) public allowanceOf;

    function approve(address token, address spender, uint160 amount, uint48) external {
        allowanceOf[msg.sender][token][spender] = amount;
    }

    function transferFrom(address from, address to, uint160 amount, address token) external {
        uint160 allowed = allowanceOf[from][token][msg.sender];
        require(allowed >= amount, "permit2: insufficient allowance");
        // The real Permit2 leaves an infinite allowance untouched; anything else decrements.
        if (allowed != type(uint160).max) allowanceOf[from][token][msg.sender] = allowed - amount;
        require(IERC20Minimal(token).transferFrom(from, to, amount), "permit2: transfer failed");
    }
}


/// @notice Can Coil launch on a chain that has the v4 PoolManager but no PositionManager, if we
///   deploy Uniswap's PositionManager there ourselves?
///
/// This is the Arc question, made runnable. Arc (5042) has the PoolManager, StateView and Quoter at
/// Robinhood Chain's addresses with byte-identical code, and no PositionManager or UniversalRouter —
/// the two whose constructors take a WETH9 that Arc, with native USDC gas, does not have. Since
/// `CoilHook.seed()` mints the permanently-locked launch position through the POSM, no POSM means no
/// launches.
///
/// So this test stands the whole thing up locally the way `DeployPositionManager.s.sol` would on Arc:
/// real v4-core PoolManager, real vendored Permit2, and Uniswap's own PositionManager deployed with
/// **`weth9 = address(0)`** — the load-bearing detail. The claim being tested is that a zero WETH9 is
/// harmless because it reaches PositionManager only via `NativeWrapper`, which only the
/// `WRAP`/`UNWRAP` actions touch, and `seed()` uses `MINT_POSITION` + `SETTLE_PAIR`. A claim like
/// that is worth nothing unasserted, so: launch a token end to end, then trade it.
///
/// Lives under test/e2e because it pulls v4-core's Pool.sol, but it forks nothing — it runs
/// anywhere. It needs the v4local profile (see foundry.toml) and a prior build, because the
/// PositionManager comes from an artifact rather than an import:
///
///     FOUNDRY_PROFILE=v4local forge build
///     FOUNDRY_PROFILE=v4local forge test --match-contract ArcSelfHostedPosmTest -vv
contract ArcSelfHostedPosmTest is Test {
    /// Same args the deploy script uses.
    uint256 constant UNSUBSCRIBE_GAS_LIMIT = 300_000;
    /// The whole point: Arc has no WETH9. And no descriptor is deployed, so `tokenURI` reverts —
    /// both are zero in the real deploy, so both are zero here.
    address constant WETH9 = address(0);
    address constant TOKEN_DESCRIPTOR = address(0);

    /// Permit2 is at the same address on every chain, Arc included (verified on-chain).
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // BEFORE_SWAP | BEFORE_SWAP_RETURNS_DELTA
    uint160 constant HOOK_FLAGS = uint160(Hooks.BEFORE_SWAP_FLAG | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG);

    int24 constant TICK_LOWER = -6000;
    int24 constant TICK_UPPER = 0;
    uint256 constant SUPPLY = 1_000_000_000 ether;
    uint256 constant CREATION_FEE = 1e18; // 1 USDC on Arc — native, 18 decimals

    PoolManager pm;
    address posm;
    CoilLaunchpad pad;
    PoolSwapTest swapRouter;

    address protocolWallet = makeAddr("protocolWallet");
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address trader = makeAddr("trader");

    function setUp() public {
        pm = new PoolManager(address(this));

        // Permit2 lives at its canonical address so the hook's constructor approval is a real call
        // to a real place (see StandInPermit2 for why it isn't the upstream contract).
        vm.etch(PERMIT2, address(new StandInPermit2()).code);

        posm = _deployPosm(address(pm));

        // Arc's curve: no $COIL on the chain, so nothing to buy and burn — the burn share is 0 and
        // the whole remainder after the protocol cut goes to the creator/holders.
        CoilLaunchpad.FeeCurve memory curve = CoilLaunchpad.FeeCurve({
            protocolShareAtMinBps: 4500,
            protocolShareAtMaxBps: 2500,
            burnShareOfRemainderBps: 0
        });

        uint160 sqrtUpper = TickMath.getSqrtPriceAtTick(TICK_UPPER);
        uint160 sqrtLower = TickMath.getSqrtPriceAtTick(TICK_LOWER);
        CoilLaunchpad.LaunchConfig memory launch = CoilLaunchpad.LaunchConfig({
            tickLower: TICK_LOWER,
            tickUpper: TICK_UPPER,
            sqrtPriceX96: sqrtUpper,
            liquidity: LiquidityAmounts.getLiquidityForAmount1(sqrtLower, sqrtUpper, SUPPLY)
        });

        pad = new CoilLaunchpad(
            address(this), IPoolManager(address(pm)), posm, PERMIT2, protocolWallet, treasury,
            CREATION_FEE, SUPPLY, curve, launch
        );

        swapRouter = new PoolSwapTest(IPoolManager(address(pm)));
    }

    /// @dev Mirrors `DeployPositionManager.s.sol` exactly, down to the zero WETH9 and descriptor and
    ///   the same artifact — so whatever this test proves is a property of the contract that will
    ///   actually be deployed, not of a differently-compiled twin.
    function _deployPosm(address poolManager) internal returns (address manager) {
        // By artifact PATH, not "PositionManager.sol:PositionManager". The name form resolves
        // against the artifacts of the test's own compilation units, and the per-file optimizer
        // restriction puts PositionManager in a separate unit — the name lookup comes back empty
        // even though the file is on disk. The path is stable because this test only runs under
        // the v4local profile, whose `out` is pinned in foundry.toml.
        bytes memory creationCode = vm.getCode("out-v4local/PositionManager.sol/PositionManager.json");
        require(creationCode.length > 0, "PositionManager artifact missing - run `forge build` first");
        manager = _create(
            creationCode,
            abi.encode(poolManager, PERMIT2, UNSUBSCRIBE_GAS_LIMIT, TOKEN_DESCRIPTOR, WETH9)
        );
        // The deploy script asserts this too. A PositionManager over the limit cannot exist on-chain,
        // so a test that mints through one would be testing a fiction.
        require(manager.code.length <= 24_576, "PositionManager exceeds EIP-170");
    }

    /// @dev Plain CREATE, matching the deploy script. It moved off CREATE2 because a broadcast
    ///   CREATE2 goes through the canonical deterministic-deployer proxy, which Arc does not have —
    ///   see the note in DeployPositionManager.s.sol.
    function _create(bytes memory creationCode, bytes memory args) internal returns (address addr) {
        bytes memory initcode = abi.encodePacked(creationCode, args);
        assembly {
            addr := create(0, add(initcode, 0x20), mload(initcode))
        }
        require(addr != address(0), "CREATE failed");
    }

    /// The deploy script's own post-condition, and the thing the launchpad preflight checks for.
    function test_SelfDeployedPosmIsBoundToOurPoolManager() public view {
        (bool ok, bytes memory ret) = posm.staticcall(abi.encodeWithSignature("poolManager()"));
        assertTrue(ok, "POSM must answer poolManager()");
        assertEq(abi.decode(ret, (address)), address(pm), "POSM bound to the wrong PoolManager");
    }

    /// A zero WETH9 must not stop a launch — `seed()` never wraps.
    function test_LaunchSucceedsAgainstSelfDeployedPosmWithZeroWeth9() public {
        (address token, uint256 positionId) = _launch(200); // 2%

        assertTrue(token != address(0), "no token");
        assertEq(uint160(token) & Hooks.ALL_HOOK_MASK, HOOK_FLAGS, "mined address lost its hook flags");
        assertGt(positionId, 0, "POSM minted no position");

        CoilHook hook = CoilHook(payable(token));
        // Liquidity is locked by construction: the hook owns the position and renounced ownership.
        assertEq(hook.owner(), address(0), "hook did not renounce");
        assertEq(hook.hookPositionTokenId(), positionId, "position id mismatch");
        // The NFT is held by the hook itself, forever.
        (bool ok, bytes memory ret) =
            posm.staticcall(abi.encodeWithSignature("ownerOf(uint256)", positionId));
        assertTrue(ok, "ownerOf failed");
        assertEq(abi.decode(ret, (address)), token, "position NFT not held by the hook");
        // Whole supply went into the pool, none left with the hook or the creator.
        assertEq(hook.balanceOf(creator), 0, "creator holds supply");
        assertEq(hook.totalSupply(), SUPPLY, "supply mismatch");
    }

    /// @notice The skim needs the PoolManager to already HOLD native, and that is not obvious.
    ///
    /// `beforeSwap` calls `poolManager.take(native, hook, fee)`, which physically sends the coin —
    /// but the trader's input is only settled at the END of the unlock, so at skim time the
    /// singleton must cover the transfer out of what it already holds. That is a flash: the router's
    /// later `settle` more than repays it. On a live chain it is invisible because the singleton is
    /// funded by every other pool in it — Robinhood Chain's holds ~2,163 ETH, Arc's ~14,795 USDC
    /// (both read on-chain), so a 2% skim on a normal trade is nothing.
    ///
    /// It only bites on an EMPTY singleton, which is exactly what a freshly deployed one is. Worth a
    /// test rather than a comment, because "the first ever trade on a brand-new chain's PoolManager
    /// reverts" is the kind of thing you want to have already thought about.
    function test_SkimRequiresNativeAlreadyInTheSingleton() public {
        (address token,) = _launch(200);

        PoolKey memory key = _key(token);
        SwapParams memory params = SwapParams({
            zeroForOne: true,
            amountSpecified: -0.1 ether,
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        PoolSwapTest.TestSettings memory settings =
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false});

        assertEq(address(pm).balance, 0, "fixture: singleton starts empty");
        vm.expectRevert(); // Hooks.HookCallFailed wrapping CurrencyLibrary.NativeTransferFailed
        swapRouter.swap{value: 0.1 ether}(key, params, settings, "");

        // Enough to cover a skim, i.e. what any real singleton has.
        vm.deal(address(pm), 1 ether);
        swapRouter.swap{value: 0.1 ether}(key, params, settings, "");
        assertGt(CoilHook(payable(token)).balanceOf(address(this)), 0, "buy should now go through");
    }

    /// And the fee engine has to actually run on the resulting pool, or the launch is cosmetic.
    function test_SwapOnTheLaunchedPoolSkimsTheFee() public {
        (address token,) = _launch(200);
        CoilHook hook = CoilHook(payable(token));

        // Stand in for the native the singleton holds on any live chain — see the test above.
        vm.deal(address(pm), 10 ether);

        uint256 protocolBefore = protocolWallet.balance;
        uint256 buy = 1 ether;
        vm.deal(trader, buy);

        // Build the key before the prank — its view calls would otherwise consume it. Buying the
        // token spends currency0 (native), so zeroForOne and the limit goes DOWN toward MIN.
        PoolKey memory key = _key(token);
        SwapParams memory params = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(buy),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });
        vm.prank(trader);
        swapRouter.swap{value: buy}(
            key, params, PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}), ""
        );

        // 2% total; on Arc's curve that is 0.8% protocol + 1.2% to the creator, 0 burn.
        CoilHook.FeeConfig memory fees = pad.resolveFees(200);
        assertEq(fees.protocolBps + fees.holderBps + fees.burnBps, 200, "split must sum to the rate");
        assertEq(fees.burnBps, 0, "Arc has no $COIL to burn");

        // The hook takes the whole fee into itself during the swap and books it per bucket; the
        // protocol's share leaves on `sweepProtocol()`. Assert the accrual first — that is what the
        // swap actually produced — then that sweeping delivers exactly it.
        uint256 expected = buy * fees.protocolBps / 10_000;
        assertEq(hook.protocolAccruedETH(), expected, "swap did not accrue the protocol's cut");

        hook.sweepProtocol();
        assertEq(protocolWallet.balance - protocolBefore, expected, "sweep did not pay the protocol");
        assertEq(hook.protocolAccruedETH(), 0, "sweep left an accrual behind");
        assertGt(hook.balanceOf(trader), 0, "trader got no tokens");
    }

    /// The creator's chosen rate must survive the whole path — mining, deploy, and the live pool.
    function test_CreatorChosenRateReachesTheDeployedHook() public {
        (address token,) = _launch(500); // 5%
        CoilHook.FeeConfig memory fees = pad.resolveFees(500);
        CoilHook hook = CoilHook(payable(token));
        assertEq(hook.PROTOCOL_FEE_BPS(), fees.protocolBps, "protocol bps");
        assertEq(hook.HOLDER_FEE_BPS(), fees.holderBps, "holder bps");
        assertEq(hook.BURN_FEE_BPS(), fees.burnBps, "burn bps");
    }

    /// @dev Mine the salt the way the frontend does — off the launchpad's own init code hash, with
    ///   the rate included, then launch with Creator Rewards (the only mode Arc offers).
    function _launch(uint256 totalFeeBps) internal returns (address token, uint256 positionId) {
        bytes memory ctorArgs = abi.encode(
            IPoolManager(address(pm)), address(pad), posm, PERMIT2, protocolWallet, treasury,
            creator, SUPPLY, "Snake Oil", "SSSS", pad.resolveFees(totalFeeBps)
        );
        bytes32 expected = pad.hookInitCodeHash("Snake Oil", "SSSS", creator, totalFeeBps);
        assertEq(
            keccak256(abi.encodePacked(vm.getCode("CoilHook.sol:CoilHook"), ctorArgs)),
            expected,
            "launchpad's init code hash disagrees with locally rebuilt ctor args"
        );

        bytes32 salt = _mineSalt(address(pad), expected);

        vm.deal(creator, CREATION_FEE);
        vm.prank(creator);
        (token, positionId) =
            pad.createTokenV4{value: CREATION_FEE}("Snake Oil", "SSSS", "ipfs://x", salt, true, totalFeeBps);
    }

    /// @dev The same CREATE2 search the browser runs, so this test exercises the real flow rather
    ///   than a shortcut: keccak(0xff ++ deployer ++ salt ++ initCodeHash) until the flags match.
    function _mineSalt(address deployer, bytes32 initCodeHash) internal pure returns (bytes32) {
        for (uint256 i = 0; i < 200_000; i++) {
            bytes32 salt = bytes32(i);
            address addr = address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, initCodeHash))))
            );
            if (uint160(addr) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) return salt;
        }
        revert("no salt found");
    }

    /// @dev Read the fee and tick spacing off the hook rather than restating them: a literal here
    ///   that drifts from `CoilHook`'s constants produces a different pool id, and the failure is
    ///   `PoolNotInitialized` — which reads as "the launch didn't work" rather than "the test is
    ///   asking about the wrong pool".
    function _key(address token) internal view returns (PoolKey memory) {
        CoilHook hook = CoilHook(payable(token));
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: hook.POOL_FEE(),
            tickSpacing: hook.TICK_SPACING(),
            hooks: IHooks(token)
        });
    }
}
