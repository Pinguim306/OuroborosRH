// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "solady/src/auth/Ownable.sol";
import {ReentrancyGuard} from "solady/src/utils/ReentrancyGuard.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {CoilHook} from "./CoilHook.sol";

/// @title CoilLaunchpad
/// @notice The v4 launch factory for Coil — the successor to the Ouroboros v3 `createTokenV3`
///   mode. One transaction spins up a full market: a `CoilHook` (which IS the ERC-20, the LP
///   owner and the native per-swap fee router) deployed at a mined CREATE2 address, with its
///   entire supply seeded as one-sided liquidity into a fresh v4 pool. The launch is immutable
///   the instant it confirms — the hook renounces ownership inside `seed()`, and the liquidity is
///   locked by construction (no FeeLocker: the hook owns the position and never withdraws it).
///
///   Why v4 beats the v3 flow it replaces:
///     - no FeeLocker + no manual `collect()` harvest: fees come out on every swap, automatically;
///     - no `postGradTaxBps` fee-on-transfer: the fee is taken inside the swap (works with every
///       router/aggregator);
///     - the protocol's cut streams straight to `feeRecipient` — profit on volume, forever.
///
///   The hook address must encode the BEFORE_SWAP + BEFORE_SWAP_RETURNS_DELTA flags, so the salt
///   is mined off-chain (HookMiner) for the exact init code and passed to `createTokenV4`. A wrong
///   salt makes the hook constructor's own permission check revert, so a bad launch fails safely.
contract CoilLaunchpad is Ownable, ReentrancyGuard {
    /// @notice Bumped when the create signature changes; the frontend reads it to pick the ABI.
    uint256 public constant LAUNCHPAD_VERSION = 4;

    /// @notice The range a creator may pick their per-swap fee from.
    /// @dev `MAX_FEE_BPS` mirrors `MAX_FEE_BPS` (a contract's constant isn't
    ///   reachable through its type). The hook stays the authority: its constructor reverts on
    ///   anything above its own ceiling, and that happens before the launch spends anything, so a
    ///   drift here fails safe rather than shipping a token above the cap.
    uint256 public constant MIN_FEE_BPS = 100; // 1%
    uint256 public constant MAX_FEE_BPS = 500; // 5%

    /// @dev Basis-point denominator, matching CoilHook.
    uint256 private constant BPS_DENOM = 10_000;

    /*                            CONFIG                            */

    /// @notice Shared v4 infrastructure every launch wires into.
    IPoolManager public immutable poolManager;
    address public immutable posm;
    address public immutable permit2;

    /// @notice Protocol wallet (receives the protocol fee cut + the creation fee) and the COIL
    ///   buy&burn treasury (receives the burn cut). Updatable by the owner for future launches.
    address public feeRecipient;
    address public platformTreasury;

    /// @notice Fixed native fee charged on every launch.
    uint256 public creationFee;

    /// @notice Total supply minted per launch and seeded one-sided into the pool.
    uint256 public tokenSupply;

    /**
     * @notice How a creator-chosen fee is split. The creator picks the TOTAL rate at launch
     *   (`MIN_FEE_BPS`..`MAX_FEE_BPS`); this curve decides who gets what, and the
     *   creator cannot touch it.
     *
     * The protocol's share SLIDES DOWN as the chosen rate goes up — a big share of a small fee, a
     * smaller share of a large one. That is deliberate: it keeps the platform economics viable on
     * cheap tokens without letting the protocol's absolute take run away on expensive ones, and it
     * leaves the creator with a rapidly growing slice as they raise the rate, which is the whole
     * incentive to configure one at all.
     *
     * Linear between the two anchors, e.g. 45% of a 1% fee sliding to 25% of a 5% fee.
     *
     * CAUTION when tuning: the protocol's ABSOLUTE take is `total * share(total)`, a downward
     * parabola. Drop the max-end share too far and that take peaks mid-range and then falls — a
     * creator raising their rate would start EARNING THE PROTOCOL LESS. Keeping the max-end share
     * at or above 5/9 of the min-end one (25% against 45%) puts the peak at the ceiling instead,
     * so revenue rises across the whole range. The 20%/45% pair, for instance, peaks at 4.1% and
     * pays less at 5% than at 4%. Not enforced on-chain — it is a business choice, not a safety
     * property — but it is the difference between the curve rewarding a higher rate and punishing it.
     */
    struct FeeCurve {
        /// @dev Protocol share (bps of the fee) at `MIN_FEE_BPS`. Must be >= the max-end share.
        uint256 protocolShareAtMinBps;
        /// @dev Protocol share (bps of the fee) at `MAX_FEE_BPS`.
        uint256 protocolShareAtMaxBps;
        /// @dev Burn share, as bps of WHAT IS LEFT after the protocol cut. The remainder after
        ///   this is the holder/creator slice. Set to 0 on chains with no $COIL to buy and burn.
        uint256 burnShareOfRemainderBps;
    }

    FeeCurve public feeCurve;

    /// @notice One-sided launch range + pre-computed pricing. Launch price is the price at
    ///   `tickUpper` (all supply is token1), so the pool opens with token-only liquidity — buyers
    ///   move price up the range. `launchSqrtPriceX96` and `launchLiquidity` are computed off-chain
    ///   for the fixed (`tokenSupply`, range) — they are constant across launches, so keeping them
    ///   as config (like Ouroboros's V3Params) avoids pulling TickMath/LiquidityAmounts on-chain.
    int24 public tickLower;
    int24 public tickUpper;
    uint160 public launchSqrtPriceX96;
    uint128 public launchLiquidity;

    /*                            MARKETS                           */

    struct Market {
        address token; // the CoilHook (token + pool + fee router)
        address creator;
        bool creatorRewards; // true = holder slice pays the creator; false = Loop (all holders)
        string name;
        string symbol;
        string metadataURI;
        uint256 createdAt;
    }

    Market[] public markets;
    mapping(address => uint256) public marketIndexByToken; // token => index+1 (0 = none)

    /*                            EVENTS                            */

    event TokenLaunchedV4(
        uint256 indexed id,
        address indexed creator,
        address indexed token,
        uint256 positionId,
        bool creatorRewards,
        uint256 totalFeeBps
    );
    event FeeRecipientUpdated(address feeRecipient);
    event TreasuryUpdated(address platformTreasury);
    event CreationFeeUpdated(uint256 creationFee);
    event TokenSupplyUpdated(uint256 tokenSupply);
    event FeeCurveUpdated(FeeCurve feeCurve);
    event RangeUpdated(int24 tickLower, int24 tickUpper);

    /*                            ERRORS                           */

    error InsufficientCreationFee();
    error InvalidFeeCurve();
    error InvalidTotalFee();
    error NativeTransferFailed();
    error ZeroAddress();

    /// @dev One-sided launch range + its off-chain-computed pricing (constant for the fixed
    ///   supply/range). Grouped so the constructor stays within the legacy stack limit.
    struct LaunchConfig {
        int24 tickLower;
        int24 tickUpper;
        uint160 sqrtPriceX96;
        uint128 liquidity;
    }

    constructor(
        address initialOwner,
        IPoolManager _poolManager,
        address _posm,
        address _permit2,
        address _feeRecipient,
        address _platformTreasury,
        uint256 _creationFee,
        uint256 _tokenSupply,
        FeeCurve memory _feeCurve,
        LaunchConfig memory _launch
    ) {
        if (
            _posm == address(0) || _permit2 == address(0) || _feeRecipient == address(0)
                || _platformTreasury == address(0)
        ) revert ZeroAddress();
        _initializeOwner(initialOwner);
        poolManager = _poolManager;
        posm = _posm;
        permit2 = _permit2;
        feeRecipient = _feeRecipient;
        platformTreasury = _platformTreasury;
        creationFee = _creationFee;
        tokenSupply = _tokenSupply;
        _setFeeCurve(_feeCurve);
        tickLower = _launch.tickLower;
        tickUpper = _launch.tickUpper;
        launchSqrtPriceX96 = _launch.sqrtPriceX96;
        launchLiquidity = _launch.liquidity;
    }

    /*                            ADMIN                            */

    function setFeeRecipient(address v) external onlyOwner {
        if (v == address(0)) revert ZeroAddress();
        feeRecipient = v;
        emit FeeRecipientUpdated(v);
    }

    function setPlatformTreasury(address v) external onlyOwner {
        if (v == address(0)) revert ZeroAddress();
        platformTreasury = v;
        emit TreasuryUpdated(v);
    }

    function setCreationFee(uint256 v) external onlyOwner {
        creationFee = v;
        emit CreationFeeUpdated(v);
    }

    function setTokenSupply(uint256 v) external onlyOwner {
        tokenSupply = v;
        emit TokenSupplyUpdated(v);
    }

    function setFeeCurve(FeeCurve calldata v) external onlyOwner {
        _setFeeCurve(v);
    }

    function _setFeeCurve(FeeCurve memory v) internal {
        // Monotonicity is a property of the curve, not of the caller's good intentions: without
        // this the share could RISE with the rate, inverting the incentive the curve exists for.
        if (v.protocolShareAtMinBps < v.protocolShareAtMaxBps) revert InvalidFeeCurve();
        if (v.protocolShareAtMinBps > BPS_DENOM || v.burnShareOfRemainderBps > BPS_DENOM) {
            revert InvalidFeeCurve();
        }
        // The holder/creator slice must never round to nothing at the cheap end, or a 1% token
        // silently pays its creator zero.
        if (v.protocolShareAtMinBps == BPS_DENOM && v.burnShareOfRemainderBps == BPS_DENOM) {
            revert InvalidFeeCurve();
        }
        feeCurve = v;
        emit FeeCurveUpdated(v);
    }

    /// @notice The exact waterfall a launch at `totalFeeBps` would carry. Public so the frontend
    ///   can show the creator their real split before they sign, and so the salt can be mined
    ///   against the same constructor arguments the launch will use.
    function resolveFees(uint256 totalFeeBps) public view returns (CoilHook.FeeConfig memory) {
        if (totalFeeBps < MIN_FEE_BPS || totalFeeBps > MAX_FEE_BPS) {
            revert InvalidTotalFee();
        }
        FeeCurve memory c = feeCurve;

        // Linear slide between the anchors. Subtraction is safe: `_setFeeCurve` enforces min >= max.
        uint256 span = MAX_FEE_BPS - MIN_FEE_BPS;
        uint256 shareBps = c.protocolShareAtMinBps
            - (c.protocolShareAtMinBps - c.protocolShareAtMaxBps) * (totalFeeBps - MIN_FEE_BPS) / span;

        uint256 protocolBps = totalFeeBps * shareBps / BPS_DENOM;
        uint256 remainder = totalFeeBps - protocolBps;
        uint256 burnBps = remainder * c.burnShareOfRemainderBps / BPS_DENOM;
        // Holder slice takes the rounding dust so the three always sum to exactly `totalFeeBps` —
        // the hook derives each payout as a proportion of the total, so a gap would be lost value.
        uint256 holderBps = remainder - burnBps;

        return CoilHook.FeeConfig({protocolBps: protocolBps, holderBps: holderBps, burnBps: burnBps});
    }

    function setLaunchConfig(LaunchConfig calldata v) external onlyOwner {
        tickLower = v.tickLower;
        tickUpper = v.tickUpper;
        launchSqrtPriceX96 = v.sqrtPriceX96;
        launchLiquidity = v.liquidity;
        emit RangeUpdated(v.tickLower, v.tickUpper);
    }

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }

    /// @notice Return a page of markets, newest first — convenient for the frontend.
    function getMarkets(uint256 offset, uint256 limit) external view returns (Market[] memory page) {
        uint256 n = markets.length;
        if (offset >= n) return new Market[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        page = new Market[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = markets[n - 1 - i];
        }
    }

    /*                            LAUNCH                           */

    /// @notice Compute the exact CoilHook init code hash for a launch, so the frontend can mine
    ///   the CREATE2 salt (via HookMiner) that lands the hook on a BEFORE_SWAP-flagged address.
    ///   `creator` must be the launching wallet (msg.sender) when `creatorRewards` is true, else 0.
    function hookInitCodeHash(
        string calldata name,
        string calldata symbol,
        address creator,
        uint256 totalFeeBps
    ) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(type(CoilHook).creationCode, _ctorArgs(name, symbol, creator, totalFeeBps))
        );
    }

    function _ctorArgs(string calldata name, string calldata symbol, address creator, uint256 totalFeeBps)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(
            poolManager,
            address(this), // owner — the launchpad calls seed() then the hook renounces
            posm,
            permit2,
            feeRecipient,
            platformTreasury,
            creator,
            tokenSupply,
            name,
            symbol,
            resolveFees(totalFeeBps)
        );
    }

    /// @notice Launch a token straight into a v4 pool with the native per-swap fee. `salt` is the
    ///   CREATE2 salt mined off-chain (see `hookInitCodeHash`) so the hook lands on a valid hook
    ///   address. `creatorRewards`: false = Loop Rewards (holder slice → all holders); true =
    ///   Creator Rewards (that slice → the creator's wallet). Requires `creationFee`; excess is
    ///   refunded.
    function createTokenV4(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        bytes32 salt,
        bool creatorRewards,
        uint256 totalFeeBps
    ) external payable nonReentrant returns (address token, uint256 positionId) {
        if (msg.value < creationFee) revert InsufficientCreationFee();
        // Reverts on an out-of-range rate before anything is deployed or spent.
        CoilHook.FeeConfig memory resolved = resolveFees(totalFeeBps);

        address creator = creatorRewards ? msg.sender : address(0);

        // 1. Deploy the hook at the mined address. The hook mints its whole supply to itself and
        //    (via BaseHook) validates that this address encodes the required flags — a wrong salt
        //    reverts here, so the launch fails safely with nothing spent but gas.
        CoilHook hook = _deployHook(name, symbol, creator, salt, resolved);
        token = address(hook);

        // 2. Seed: initialize the pool and deposit the entire supply as one-sided liquidity, then
        //    the hook renounces ownership (done inside seed()). Liquidity is locked forever.
        positionId = _seed(hook);

        // 3. Record the market (checks-effects-interactions: before any value transfer).
        _recordMarket(token, creatorRewards, name, symbol, metadataURI);

        // 4. Creation fee to the protocol wallet, refund the rest.
        if (creationFee > 0) _sendNative(feeRecipient, creationFee);
        uint256 refund = msg.value - creationFee;
        if (refund > 0) _sendNative(msg.sender, refund);

        emit TokenLaunchedV4(markets.length - 1, msg.sender, token, positionId, creatorRewards, totalFeeBps);
    }

    /// @dev Deploy the hook via CREATE2 with the mined salt. Isolated in its own frame so the
    ///   11-argument constructor call doesn't blow the legacy pipeline's stack.
    function _deployHook(
        string calldata name,
        string calldata symbol,
        address creator,
        bytes32 salt,
        CoilHook.FeeConfig memory resolved
    ) internal returns (CoilHook hook) {
        hook = new CoilHook{salt: salt}(
            poolManager, address(this), posm, permit2, feeRecipient, platformTreasury, creator,
            tokenSupply, name, symbol, resolved
        );
    }

    /// @dev Seed the pool with the pre-configured one-sided range + pricing. Launch price is the
    ///   price at `tickUpper`, so the whole supply is provided as token1 only.
    function _seed(CoilHook hook) internal returns (uint256 positionId) {
        positionId = hook.seed(launchSqrtPriceX96, tickLower, tickUpper, launchLiquidity);
    }

    function _recordMarket(
        address token,
        bool creatorRewards,
        string calldata name,
        string calldata symbol,
        string calldata metadataURI
    ) internal {
        markets.push(
            Market({
                token: token,
                creator: msg.sender,
                creatorRewards: creatorRewards,
                name: name,
                symbol: symbol,
                metadataURI: metadataURI,
                createdAt: block.timestamp
            })
        );
        marketIndexByToken[token] = markets.length; // index+1
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
