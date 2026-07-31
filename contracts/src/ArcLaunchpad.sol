// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OuroToken} from "src/OuroToken.sol";
import {ArcPoolLocker} from "src/ArcPoolLocker.sol";
import {Ownable} from "src/utils/Ownable.sol";
import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";
import {IERC20} from "src/interfaces/IERC20.sol";
import {IUniswapV3Factory} from "src/interfaces/IUniswapV3.sol";
import {IUniswapV3PoolDirect, IUniswapV3SwapCallback} from "src/interfaces/IUniswapV3Direct.sol";

/// @title ArcLaunchpad
/// @notice Instant-V3 launches on Arc: every token launches straight into a Uniswap
///         V3 pool on the DEX factory that Arc's trading terminals already index and
///         route, so a launched token is tradable on those venues from its first
///         block — the whole point of this deployment. The pool's 1% fee tier IS the
///         protocol's take: all liquidity is ours (locked in the ArcPoolLocker), so
///         every swap's fee — from our own site or any external router — accrues to
///         the locked position and is harvested and split protocol/creator-or-holders.
///
///         Differences from the Robinhood Launchpad's V3 mode, all deliberate:
///           - no bonding-curve mode, no position-manager NFT, no periphery router —
///             the only third-party dependency is the factory and its (immutable)
///             pools; positions are held at pool level by the locker, and the dev buy
///             runs as a direct pool swap;
///           - the quote currency is Arc's native-USDC ERC20 facade (6 decimals),
///             which plays WETH's role but needs no wrapping: facade balances ARE
///             native balances. All USDC amounts here (creation fee, dev buy) are in
///             the facade's 6-decimal units, pulled via `transferFrom` — the exact
///             pattern external trading terminals already use on Arc — so the caller
///             approves this launchpad on the facade instead of attaching msg.value.
contract ArcLaunchpad is Ownable, ReentrancyGuard, IUniswapV3SwapCallback {
    /// @notice Bumped when the create functions' ABI changes; the frontend reads this
    ///         to pick the launch flow. 5 = Arc instant-V3 (this contract).
    uint256 public constant LAUNCHPAD_VERSION = 5;

    /// @dev Uniswap V3 sqrt price bounds; swaps use them (∓1) as "no limit".
    uint160 private constant MIN_SQRT_RATIO = 4295128739;
    uint160 private constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    /// @notice Pool pricing for launches. Initial sqrt price, single-sided range and
    ///         position size depend on whether the launched token sorts as token0 or
    ///         token1 against USDC, so both variants are configured. Values are
    ///         computed off-chain (PrintArcV3Config) for the fixed supply and range.
    struct V3Params {
        uint24 feeTier; // e.g. 10000 = 1% — the protocol's take on every swap
        uint160 sqrtPriceX96Token0; // initial price when the token is token0
        uint160 sqrtPriceX96Token1; // initial price when the token is token1
        int24 tickLower0; // single-sided range when token is token0
        int24 tickUpper0;
        int24 tickLower1; // single-sided range when token is token1
        int24 tickUpper1;
        uint128 liquidity0; // position size when token is token0
        uint128 liquidity1; // position size when token is token1
    }

    IUniswapV3Factory public immutable v3Factory;
    /// @notice The canonical native-USDC ERC20 facade every pool pairs against.
    address public immutable usdc;

    /// @notice WETH-role getter, for frontend parity: the site's V3 readers orient
    ///         every pool by `launchpad.weth()`, and on Arc that role — the quote
    ///         currency all pools pair against — is played by the USDC facade.
    function weth() external view returns (address) {
        return usdc;
    }

    V3Params public v3Params;
    /// @notice Permanent vault holding every launch's pool-level position.
    ArcPoolLocker public feeLocker;

    /// @notice Full supply minted to every launched token, all of it into the pool.
    uint256 public tokenSupply;
    /// @notice Fee charged per launch, in the facade's 6-decimal USDC units.
    uint256 public creationFee;
    /// @notice Receives the creation fee and the protocol share of harvested fees.
    address public feeRecipient;

    /// @notice True for every token launched here (parity with the Robinhood
    ///         launchpad's getter — the frontend shares the read path).
    mapping(address => bool) public isV3Token;
    /// @notice True for tokens launched in Creator Rewards mode: the harvest share
    ///         that Loop Rewards streams to holders is paid to the creator instead.
    mapping(address => bool) public isCreatorFeeToken;

    struct Market {
        address token;
        address curve; // the V3 pool (field name kept for frontend parity)
        address creator;
        string name;
        string symbol;
        string metadataURI;
        uint256 createdAt;
    }

    Market[] public markets;
    mapping(address => uint256) public marketIndexByToken; // token => index+1 (0 = none)

    /// @dev The pool a dev-buy swap is in flight for, and who pays it.
    address private pendingPool;
    address private pendingPayer;

    event TokenLaunchedV3(address indexed token, address indexed pool, address indexed creator);
    event V3ConfigUpdated(address feeLocker, V3Params params);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event CreationFeeUpdated(uint256 creationFee);
    event TokenSupplyUpdated(uint256 tokenSupply);

    error V3NotConfigured();
    error LockerMismatch();
    error PoolPriceMismatch();
    error UnexpectedCallback();

    constructor(
        address initialOwner,
        address _v3Factory,
        address _usdc,
        address _feeRecipient,
        uint256 _creationFee,
        uint256 _tokenSupply
    ) Ownable(initialOwner) {
        if (_v3Factory == address(0) || _usdc == address(0) || _feeRecipient == address(0)) {
            revert ZeroAddress();
        }
        v3Factory = IUniswapV3Factory(_v3Factory);
        usdc = _usdc;
        feeRecipient = _feeRecipient;
        creationFee = _creationFee;
        tokenSupply = _tokenSupply;
    }

    // --------------------------------------------------------------------- //
    //  Admin                                                                //
    // --------------------------------------------------------------------- //

    /// @notice Wire the locker (first call only — positions live there forever) and
    ///         set the pool pricing params. Later calls may only update the params.
    function setV3Config(address _feeLocker, V3Params calldata _v3Params) external onlyOwner {
        if (address(feeLocker) == address(0)) {
            ArcPoolLocker locker = ArcPoolLocker(payable(_feeLocker));
            // The locker must point back at this launchpad, or mintLocked reverts on
            // every launch (and its callback pulls tokens from the wrong place).
            if (locker.launchpad() != address(this)) revert LockerMismatch();
            feeLocker = locker;
        }
        v3Params = _v3Params;
        emit V3ConfigUpdated(address(feeLocker), _v3Params);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = _feeRecipient;
        emit FeeRecipientUpdated(_feeRecipient);
    }

    function setCreationFee(uint256 _creationFee) external onlyOwner {
        creationFee = _creationFee;
        emit CreationFeeUpdated(_creationFee);
    }

    function setTokenSupply(uint256 _tokenSupply) external onlyOwner {
        tokenSupply = _tokenSupply;
        emit TokenSupplyUpdated(_tokenSupply);
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

    // --------------------------------------------------------------------- //
    //  Launch                                                               //
    // --------------------------------------------------------------------- //

    /// @notice Launch a token straight into a V3 pool, tradable by anyone (our site,
    ///         external terminals) the second this transaction confirms.
    ///
    ///         Caller must have approved this launchpad on the USDC facade for
    ///         `creationFee + devBuy` (6-decimal units). `devBuy` executes as the
    ///         pool's very first swap, inside this transaction — it cannot be
    ///         front-run. `creatorFees` picks the rewards mode, fixed forever at
    ///         launch: false = Loop Rewards (the locker's holder share of harvested
    ///         pool fees streams to all holders); true = Creator Rewards (it pays the
    ///         creator's wallet instead).
    function createTokenV3(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 devBuy,
        bool creatorFees
    ) external nonReentrant returns (address token, address pool) {
        V3Params memory v = v3Params;
        if (v.feeTier == 0 || address(feeLocker) == address(0)) revert V3NotConfigured();

        // 1. Creation fee, straight to the protocol (checks the approval up front so
        //    a missing allowance fails before any deployment gas is spent).
        if (creationFee > 0) {
            require(IERC20(usdc).transferFrom(msg.sender, feeRecipient, creationFee), "fee pull failed");
        }

        // 2. Mint the full supply to this launchpad. No transfer tax (V3 pools revert
        //    on fee-on-transfer): the protocol's take is the pool fee tier itself.
        //    Dividend machinery stays: in Loop Rewards mode holders claim the USDC
        //    the locker streams in from harvested pool fees.
        OuroToken t = new OuroToken(
            name, symbol, tokenSupply, address(this), address(this), metadataURI, 0, feeRecipient
        );
        token = address(t);

        // 3. Create + initialize the pool at the configured launch price, then mint
        //    the whole supply as the locker's single-sided, permanently locked
        //    position. Pool and locker are excluded from dividends before they ever
        //    hold tokens; rounding dust the mint didn't take is burned.
        bool tokenIs0 = token < usdc;
        pool = _createPool(t, v, tokenIs0);
        t.approve(address(feeLocker), tokenSupply);
        feeLocker.mintLocked(
            pool,
            token,
            tokenIs0,
            tokenIs0 ? v.tickLower0 : v.tickLower1,
            tokenIs0 ? v.tickUpper0 : v.tickUpper1,
            tokenIs0 ? v.liquidity0 : v.liquidity1,
            creatorFees ? msg.sender : address(0)
        );
        t.approve(address(feeLocker), 0);
        uint256 dust = t.balanceOf(address(this));
        if (dust > 0) {
            t.setExcludedFromDividends(0x000000000000000000000000000000000000dEaD, true);
            require(t.transfer(0x000000000000000000000000000000000000dEaD, dust), "dust transfer failed");
        }

        // 4. Freeze the dividend config forever, record, and emit (before the dev
        //    buy's external interaction — checks-effects-interactions).
        t.renounceAuthority();
        _recordMarket(token, pool, name, symbol, metadataURI);
        isV3Token[token] = true;
        if (creatorFees) isCreatorFeeToken[token] = true;
        emit TokenLaunchedV3(token, pool, msg.sender);

        // 5. Optional dev buy: the pool's first-ever swap, paid by the creator from
        //    the same facade approval, tokens straight to their wallet.
        if (devBuy > 0) _devBuy(pool, tokenIs0, devBuy);
    }

    /// @dev Resolve (or create) the token/USDC pool and pin it to the launch price.
    ///      A griefer can pre-create and pre-initialize the pool at a hostile price
    ///      (pool addresses are predictable); requiring slot0 to match the configured
    ///      launch price exactly makes that a wasted effort — the launch reverts
    ///      harmlessly and a retry deploys a token at a fresh address, hence a fresh
    ///      pool the griefer has not seen.
    function _createPool(OuroToken t, V3Params memory v, bool tokenIs0) internal returns (address pool) {
        uint160 wantPrice = tokenIs0 ? v.sqrtPriceX96Token0 : v.sqrtPriceX96Token1;
        pool = v3Factory.getPool(address(t), usdc, v.feeTier);
        if (pool == address(0)) pool = v3Factory.createPool(address(t), usdc, v.feeTier);
        try IUniswapV3PoolDirect(pool).initialize(wantPrice) {}
            catch {} // already initialized — the price check below decides
        (uint160 gotPrice,,,,,,) = IUniswapV3PoolDirect(pool).slot0();
        if (gotPrice != wantPrice) revert PoolPriceMismatch();
        t.setExcludedFromDividends(pool, true);
        t.setExcludedFromDividends(address(feeLocker), true);
    }

    /// @dev Exact-in USDC → token swap directly on the pool; the callback below pays
    ///      the pool from the creator's facade approval.
    function _devBuy(address pool, bool tokenIs0, uint256 devBuy) internal {
        pendingPool = pool;
        pendingPayer = msg.sender;
        // Buying the token means USDC in: zeroForOne exactly when USDC is token0.
        bool zeroForOne = !tokenIs0;
        IUniswapV3PoolDirect(pool).swap(
            msg.sender,
            zeroForOne,
            int256(devBuy),
            zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1,
            ""
        );
        pendingPool = address(0);
        pendingPayer = address(0);
    }

    /// @inheritdoc IUniswapV3SwapCallback
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        if (msg.sender != pendingPool || pendingPool == address(0)) revert UnexpectedCallback();
        // The positive delta is what the pool is owed — always the USDC leg here.
        int256 owed = amount0Delta > 0 ? amount0Delta : amount1Delta;
        require(IERC20(usdc).transferFrom(pendingPayer, msg.sender, uint256(owed)), "swap pay failed");
    }

    function _recordMarket(
        address token,
        address pool,
        string calldata name,
        string calldata symbol,
        string calldata metadataURI
    ) internal {
        uint256 id = markets.length;
        markets.push(
            Market({
                token: token,
                curve: pool,
                creator: msg.sender,
                name: name,
                symbol: symbol,
                metadataURI: metadataURI,
                createdAt: block.timestamp
            })
        );
        marketIndexByToken[token] = id + 1;
    }
}
