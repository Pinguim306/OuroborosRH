// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OuroToken} from "src/OuroToken.sol";
import {BondingCurve} from "src/BondingCurve.sol";
import {FeeLocker} from "src/FeeLocker.sol";
import {Ownable} from "src/utils/Ownable.sol";
import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";
import {
    INonfungiblePositionManager,
    IUniswapV3Factory,
    IUniswapV3Pool,
    ISwapRouter02
} from "src/interfaces/IUniswapV3.sol";

/// @title Launchpad
/// @notice Factory that spins up a full Ouroboros market in one transaction:
///         the dividend token and its bonding curve, wired so trading fees flow
///         Trade → protocol / liquidity / holders automatically.
///
///         `feeRecipient` collects the per-trade platform fee (`devFeeBps`) and a
///         fixed creation fee charged on every launch.
contract Launchpad is Ownable, ReentrancyGuard {
    struct CurveParams {
        uint256 totalSupply; // full token supply, all sold via the curve
        uint256 virtualNative; // virtual native seed for the starting price
        uint256 devFeeBps; // per-trade fee to the developer (e.g. 50 = 0.5%)
        uint256 liqFeeBps; // per-trade fee that becomes permanent liquidity
        uint256 holderFeeBps; // per-trade fee streamed to holders
        uint256 graduationTarget; // real native raised that graduates the curve
        uint256 maxBuyBps; // anti-whale: max tokens per buy as bps of supply (0 = off)
        uint256 postGradTaxBps; // fee-on-transfer taken on DEX trades after graduation (e.g. 100 = 1%)
    }

    CurveParams public params;

    /// @notice Developer address that receives the creation fee and per-trade dev fee.
    address public feeRecipient;
    /// @notice Fixed fee (in native coin) charged on every token launch. Set this to
    ///         roughly the desired USD amount for the current native price; adjustable.
    uint256 public creationFee;

    /// @notice Uniswap-V2-style router each curve migrates liquidity to at graduation.
    address public router;

    // --------------------------------------------------------------------- //
    //  Instant-V3 launch mode                                               //
    // --------------------------------------------------------------------- //

    /// @notice Pool pricing for instant-V3 launches. The initial sqrt price and the
    ///         single-sided tick range depend on whether the launched token sorts as
    ///         token0 or token1 against WETH, so both variants are configured. Values
    ///         are computed off-chain by the deploy script.
    struct V3Params {
        uint24 feeTier; // e.g. 10000 = 1% — the protocol's take on every swap
        uint160 sqrtPriceX96Token0; // initial price when the token is token0
        uint160 sqrtPriceX96Token1; // initial price when the token is token1
        int24 tickLower0; // single-sided range when token is token0
        int24 tickUpper0;
        int24 tickLower1; // single-sided range when token is token1
        int24 tickUpper1;
    }

    V3Params public v3Params;

    INonfungiblePositionManager public positionManager;
    IUniswapV3Factory public v3Factory;
    address public weth;
    ISwapRouter02 public swapRouter;
    /// @notice Permanent vault holding every V3 position NFT (fees harvestable, principal locked).
    FeeLocker public feeLocker;

    /// @notice True for tokens launched straight into a V3 pool (their Market.curve
    ///         field holds the pool address instead of a bonding curve).
    mapping(address => bool) public isV3Token;

    struct Market {
        address token;
        address curve;
        address creator;
        string name;
        string symbol;
        string metadataURI;
        uint256 createdAt;
    }

    Market[] public markets;
    mapping(address => uint256) public marketIndexByToken; // token => index+1 (0 = none)

    event TokenLaunched(
        uint256 indexed id, address indexed creator, address token, address curve, string name, string symbol
    );
    event TokenLaunchedV3(address indexed token, address indexed pool, uint256 indexed positionId);
    event ParamsUpdated(CurveParams params);
    event V3ConfigUpdated(address positionManager, address swapRouter, V3Params params);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event CreationFeeUpdated(uint256 creationFee);
    event RouterUpdated(address indexed router);

    error InsufficientCreationFee();
    error NativeTransferFailed();
    error V3NotConfigured();
    error LockerMismatch();

    constructor(
        address initialOwner,
        address _feeRecipient,
        address _router,
        uint256 _creationFee,
        CurveParams memory _params
    ) Ownable(initialOwner) {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = _feeRecipient;
        router = _router;
        creationFee = _creationFee;
        params = _params;
    }

    // --------------------------------------------------------------------- //
    //  Admin                                                                //
    // --------------------------------------------------------------------- //

    function setParams(CurveParams calldata _params) external onlyOwner {
        params = _params;
        emit ParamsUpdated(_params);
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

    /// @notice Update the DEX router used by future launches' graduation.
    function setRouter(address _router) external onlyOwner {
        router = _router;
        emit RouterUpdated(_router);
    }

    /// @notice Configure the instant-V3 launch mode. The FeeLocker is deployed
    ///         separately (by the deploy script) and passed in — embedding its
    ///         creation code here pushed the Launchpad past the EIP-170 size limit.
    ///         On the first call the position manager and locker are wired and become
    ///         immutable (positions live in the locker); later calls may only update
    ///         the swap router and pool pricing params.
    function setV3Config(
        address _positionManager,
        address _swapRouter,
        address _feeLocker,
        V3Params calldata _v3Params
    ) external onlyOwner {
        if (address(feeLocker) == address(0)) {
            positionManager = INonfungiblePositionManager(_positionManager);
            weth = positionManager.WETH9();
            v3Factory = IUniswapV3Factory(positionManager.factory());
            FeeLocker locker = FeeLocker(payable(_feeLocker));
            // The locker must have been constructed pointing back at this launchpad,
            // or register() would revert on every V3 launch.
            if (locker.launchpad() != address(this)) revert LockerMismatch();
            feeLocker = locker;
        }
        swapRouter = ISwapRouter02(_swapRouter);
        v3Params = _v3Params;
        emit V3ConfigUpdated(address(positionManager), _swapRouter, _v3Params);
    }

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }

    // --------------------------------------------------------------------- //
    //  Launch                                                               //
    // --------------------------------------------------------------------- //

    /// @notice Launch a new dividend token + bonding curve. Requires `creationFee`
    ///         in native coin. The creator may optionally include a `devBuy` — native
    ///         spent buying their own token on the fresh curve in the same transaction,
    ///         before anyone else can trade. `msg.value` must cover `creationFee +
    ///         devBuy`; any excess is refunded. The dev buy is subject to the same
    ///         anti-whale cap (`maxBuyBps`) as every other buyer, so it reverts if it
    ///         would exceed that share of supply.
    function createToken(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 devBuy
    ) external payable nonReentrant returns (address token, address curve) {
        if (msg.value < creationFee + devBuy) revert InsufficientCreationFee();
        CurveParams memory p = params;

        // 1. Mint the full supply to this factory (temporary, excluded holder).
        //    Authority stays with the factory so it can exclude the curve below.
        OuroToken t = new OuroToken(
            name, symbol, p.totalSupply, address(this), address(this), metadataURI, p.postGradTaxBps, feeRecipient
        );

        // 2. Deploy the bonding curve wired to the token, fee recipient, and router.
        BondingCurve c = new BondingCurve(
            address(t),
            feeRecipient,
            router,
            p.virtualNative,
            p.totalSupply,
            p.devFeeBps,
            p.liqFeeBps,
            p.holderFeeBps,
            p.graduationTarget,
            p.maxBuyBps
        );

        // 3. Exclude the curve from dividends and from the trade tax (so the curve's
        //    own transfers — including migrating liquidity at graduation — are never
        //    taxed), then hand it the supply to sell.
        t.setExcludedFromDividends(address(c), true);
        t.setTaxExempt(address(c), true);
        require(t.transfer(address(c), p.totalSupply), "supply transfer failed");

        // 4. Hand dividend authority to the curve (trustless code, not a human). The
        //    curve only uses it once — to exclude the DEX pair at graduation — then
        //    renounces. No human can ever exclude a holder and freeze rewards. (M2)
        t.transferAuthority(address(c));

        // 5. Record the market BEFORE any external value transfer (checks-effects-
        //    interactions), then forward the creation fee, run the optional dev buy,
        //    and refund the remainder. (L2 fix.)
        token = address(t);
        curve = address(c);
        _recordMarket(token, curve, name, symbol, metadataURI);
        _settle(c, devBuy);
    }

    /// @notice Launch a token straight into a Uniswap V3 pool — no bonding curve. The
    ///         pool exists and is tradable the second this transaction confirms, with
    ///         full DexScreener history from the first trade. The entire supply is
    ///         minted as single-sided liquidity into the pool at the configured
    ///         starting price; the position NFT is locked forever in the FeeLocker,
    ///         whose 1%-tier swap fees are harvestable (protocol + holders) while the
    ///         principal cannot be withdrawn.
    ///
    ///         V3 pools revert on fee-on-transfer tokens, so V3-mode tokens carry no
    ///         transfer tax — the protocol's take is the pool fee tier itself. The 2%
    ///         anti-whale cap does not apply in this mode (V3 has no such hook), and
    ///         `devBuy` executes as the pool's very first swap, in this transaction.
    function createTokenV3(
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        uint256 devBuy
    ) external payable nonReentrant returns (address token, address pool) {
        if (msg.value < creationFee + devBuy) revert InsufficientCreationFee();
        V3Params memory v = v3Params;
        if (v.feeTier == 0 || address(feeLocker) == address(0)) revert V3NotConfigured();

        // 1. Mint the full supply to this factory. No transfer tax (V3-incompatible):
        //    tradeTaxBps = 0. Dividend machinery stays: holders claim the ETH the
        //    FeeLocker streams in from pool fees.
        OuroToken t = new OuroToken(
            name, symbol, params.totalSupply, address(this), address(this), metadataURI, 0, feeRecipient
        );
        token = address(t);

        // 2. Create + initialize the pool, then mint the whole supply as single-sided
        //    liquidity to the FeeLocker. Pool and locker are excluded from dividends
        //    before they ever hold tokens.
        pool = _createV3Pool(t, v);
        uint256 positionId = _mintV3Position(t, v);

        // 3. Freeze the dividend config forever, record, and emit.
        t.renounceAuthority();
        _recordMarket(token, pool, name, symbol, metadataURI);
        isV3Token[token] = true;
        emit TokenLaunchedV3(token, pool, positionId);

        // 4. Creation fee, optional dev buy (the pool's first swap), refund.
        _settleV3(token, v.feeTier, devBuy);
    }

    /// @dev Resolve (or create) and initialize the token/WETH pool at the configured
    ///      starting price, and exclude it from dividends. If a griefer pre-created
    ///      AND pre-initialized the pool at a hostile price, the subsequent mint can
    ///      revert — the launch fails harmlessly (nothing has left the caller's wallet
    ///      beyond gas) and a retry deploys a token at a fresh address.
    function _createV3Pool(OuroToken t, V3Params memory v) internal returns (address pool) {
        bool tokenIs0 = address(t) < weth;
        pool = v3Factory.getPool(address(t), weth, v.feeTier);
        if (pool == address(0)) pool = v3Factory.createPool(address(t), weth, v.feeTier);
        try IUniswapV3Pool(pool).initialize(tokenIs0 ? v.sqrtPriceX96Token0 : v.sqrtPriceX96Token1) {}
            catch {} // already initialized (pre-existing pool) — mint below validates price
        t.setExcludedFromDividends(pool, true);
        t.setExcludedFromDividends(address(feeLocker), true);
    }

    /// @dev Mint the full supply as a single-sided position (all tokens, no ETH)
    ///      directly to the FeeLocker, then register it and burn any rounding dust.
    function _mintV3Position(OuroToken t, V3Params memory v) internal returns (uint256 positionId) {
        bool tokenIs0 = address(t) < weth;
        uint256 supply = t.balanceOf(address(this));
        t.approve(address(positionManager), supply);

        (positionId,,,) = positionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: tokenIs0 ? address(t) : weth,
                token1: tokenIs0 ? weth : address(t),
                fee: v.feeTier,
                tickLower: tokenIs0 ? v.tickLower0 : v.tickLower1,
                tickUpper: tokenIs0 ? v.tickUpper0 : v.tickUpper1,
                amount0Desired: tokenIs0 ? supply : 0,
                amount1Desired: tokenIs0 ? 0 : supply,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(feeLocker),
                deadline: block.timestamp
            })
        );
        t.approve(address(positionManager), 0);
        feeLocker.register(positionId, address(t), tokenIs0);

        // Rounding dust the mint didn't take is burned (excluded first, so it can
        // never dilute holder rewards).
        uint256 dust = t.balanceOf(address(this));
        if (dust > 0) {
            t.setExcludedFromDividends(0x000000000000000000000000000000000000dEaD, true);
            require(t.transfer(0x000000000000000000000000000000000000dEaD, dust), "dust transfer failed");
        }
    }

    /// @dev Pay the creation fee, run the optional dev buy through the swap router
    ///      (the pool's first-ever swap, so it cannot be front-run), refund the rest.
    function _settleV3(address token, uint24 feeTier, uint256 devBuy) internal {
        if (creationFee > 0) _sendNative(feeRecipient, creationFee);
        if (devBuy > 0) {
            swapRouter.exactInputSingle{value: devBuy}(
                ISwapRouter02.ExactInputSingleParams({
                    tokenIn: weth,
                    tokenOut: token,
                    fee: feeTier,
                    recipient: msg.sender,
                    amountIn: devBuy,
                    amountOutMinimum: 0,
                    sqrtPriceLimitX96: 0
                })
            );
        }
        uint256 refund = msg.value - creationFee - devBuy;
        if (refund > 0) _sendNative(msg.sender, refund);
    }

    /// @dev Split out of createToken to keep its stack shallow (the combined locals
    ///      were hitting solc's "stack too deep" on the legacy pipeline).
    function _recordMarket(
        address token,
        address curve,
        string calldata name,
        string calldata symbol,
        string calldata metadataURI
    ) internal {
        uint256 id = markets.length;
        markets.push(
            Market({
                token: token,
                curve: curve,
                creator: msg.sender,
                name: name,
                symbol: symbol,
                metadataURI: metadataURI,
                createdAt: block.timestamp
            })
        );
        marketIndexByToken[token] = id + 1;
        emit TokenLaunched(id, msg.sender, token, curve, name, symbol);
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

    /// @dev Pay the creation fee, execute the optional dev buy on the new curve for
    ///      the creator, then refund whatever native is left. Split out of createToken
    ///      to keep its stack shallow.
    function _settle(BondingCurve c, uint256 devBuy) internal {
        if (creationFee > 0) _sendNative(feeRecipient, creationFee);
        // Dev buy delivers tokens straight to the creator; minTokensOut is 0 because
        // no one can front-run a buy that runs inside the launch transaction.
        if (devBuy > 0) c.buyFor{value: devBuy}(msg.sender, 0);
        uint256 refund = msg.value - creationFee - devBuy;
        if (refund > 0) _sendNative(msg.sender, refund);
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
