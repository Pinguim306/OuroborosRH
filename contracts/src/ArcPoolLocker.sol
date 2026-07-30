// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";
import {IERC20} from "src/interfaces/IERC20.sol";
import {IUniswapV3PoolDirect, IUniswapV3MintCallback} from "src/interfaces/IUniswapV3Direct.sol";

interface ILaunchpadFees {
    function feeRecipient() external view returns (address);
}

interface IDividendToken {
    function distributeRewards() external payable;
}

/// @title ArcPoolLocker
/// @notice Permanent vault for the Arc launchpad's V3 liquidity, held at the POOL
///         level (owner/tickLower/tickUpper) rather than as a position-manager NFT —
///         on Arc we deliberately depend on nothing but the factory and pool
///         themselves.
///
///         Same guarantees as the Robinhood FeeLocker: the only value-moving function
///         is `collect`, which harvests the pool's accrued 1%-tier swap fees and
///         splits them — the USDC side between the token's holders-or-creator
///         (`holderShareBps`) and the protocol, the token side to the protocol.
///         There is no function that burns principal liquidity (the only `burn` call
///         is the 0-amount poke that updates fee accounting), so the market's
///         liquidity is locked forever while its fees stay harvestable. `collect` is
///         permissionless: anyone may crank it at any time.
///
///         USDC on Arc is the native coin, mirrored 1:1 by the canonical 6-decimal
///         ERC20 facade the pools pair against. When the pool pays this locker
///         through the facade, the chain credits the locker's NATIVE balance (the
///         facade has no code path into the recipient), so payouts leave as plain
///         native sends — scaled 6 → 18 decimals — and Loop Rewards stream through
///         the token's payable `distributeRewards`, exactly like on Robinhood.
contract ArcPoolLocker is ReentrancyGuard, IUniswapV3MintCallback {
    uint256 private constant BPS = 10_000;
    /// @dev Native (gas) USDC has 18 decimals; the facade the pools hold has 6.
    uint256 private constant FACADE_TO_NATIVE = 1e12;

    address public immutable launchpad;
    /// @notice The canonical native-USDC ERC20 facade (the pools' quote currency).
    address public immutable usdc;
    /// @notice Share of the USDC-side fees streamed to the token's holders (bps).
    uint256 public immutable holderShareBps;

    struct Position {
        address pool;
        int24 tickLower;
        int24 tickUpper;
        bool tokenIs0; // whether the launched token is token0 of the pair
        // Where the holder-share of collected USDC fees goes. address(0) = Loop
        // Rewards (streamed to all holders); else Creator Rewards (paid directly).
        address rewardsRecipient;
    }

    mapping(address => Position) public positions; // token => its locked position

    /// @dev The pool a mint is in flight for; only it may invoke the mint callback.
    address private pendingPool;

    event PositionLocked(address indexed token, address indexed pool);
    event FeesCollected(
        address indexed token, uint256 usdcToHolders, uint256 usdcToProtocol, uint256 tokenSide
    );

    error NotLaunchpad();
    error UnknownPosition();
    error UnexpectedCallback();
    error HostilePoolPrice();
    error HolderShareTooHigh();
    error ZeroAddress();
    error NativeTransferFailed();

    constructor(address _launchpad, address _usdc, uint256 _holderShareBps) {
        if (_launchpad == address(0) || _usdc == address(0)) revert ZeroAddress();
        if (_holderShareBps > BPS) revert HolderShareTooHigh();
        launchpad = _launchpad;
        usdc = _usdc;
        holderShareBps = _holderShareBps;
    }

    /// @notice Mint the launch position into `pool` and lock it here forever. Only the
    ///         launchpad may call, in the launch transaction; the token side is pulled
    ///         from the launchpad's balance (approved to this locker) inside the
    ///         pool's mint callback.
    function mintLocked(
        address pool,
        address token,
        bool tokenIs0,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        address rewardsRecipient
    ) external returns (uint256 amount0, uint256 amount1) {
        if (msg.sender != launchpad) revert NotLaunchpad();
        positions[token] = Position({
            pool: pool,
            tickLower: tickLower,
            tickUpper: tickUpper,
            tokenIs0: tokenIs0,
            rewardsRecipient: rewardsRecipient
        });

        pendingPool = pool;
        (amount0, amount1) =
            IUniswapV3PoolDirect(pool).mint(address(this), tickLower, tickUpper, liquidity, abi.encode(token));
        pendingPool = address(0);
        emit PositionLocked(token, pool);
    }

    /// @inheritdoc IUniswapV3MintCallback
    /// @dev The launch position is single-sided by construction: only the token leg
    ///      may be owed. A nonzero USDC leg means the pool's price is not the launch
    ///      price (a griefer pre-initialized it) — revert, failing the launch
    ///      harmlessly before anything of value has moved.
    function uniswapV3MintCallback(uint256 amount0Owed, uint256 amount1Owed, bytes calldata data) external {
        if (msg.sender != pendingPool || pendingPool == address(0)) revert UnexpectedCallback();
        address token = abi.decode(data, (address));
        Position memory p = positions[token];
        (uint256 tokenOwed, uint256 usdcOwed) =
            p.tokenIs0 ? (amount0Owed, amount1Owed) : (amount1Owed, amount0Owed);
        if (usdcOwed != 0) revert HostilePoolPrice();
        if (tokenOwed > 0) {
            require(IERC20(token).transferFrom(launchpad, msg.sender, tokenOwed), "token pay failed");
        }
    }

    /// @notice Harvest the accrued swap fees of a token's locked position. Callable by
    ///         anyone. The 0-amount burn is the standard poke that rolls the fee
    ///         growth into the position before collecting; no principal moves.
    function collect(address token) external nonReentrant returns (uint256 usdcSide, uint256 tokenSide) {
        Position memory p = positions[token];
        if (p.pool == address(0)) revert UnknownPosition();

        IUniswapV3PoolDirect(p.pool).burn(p.tickLower, p.tickUpper, 0);
        (uint128 amount0, uint128 amount1) = IUniswapV3PoolDirect(p.pool).collect(
            address(this), p.tickLower, p.tickUpper, type(uint128).max, type(uint128).max
        );
        (tokenSide, usdcSide) = p.tokenIs0 ? (amount0, amount1) : (amount1, amount0);

        address protocol = ILaunchpadFees(launchpad).feeRecipient();

        // USDC side arrived as native (the facade mirrors the native balance). Route
        // the holder share — to all holders in Loop Rewards mode, straight to the
        // creator in Creator Rewards mode — and the rest to the protocol.
        if (usdcSide > 0) {
            uint256 toHolders = (usdcSide * holderShareBps) / BPS;
            uint256 toProtocol = usdcSide - toHolders;
            if (toHolders > 0) {
                if (p.rewardsRecipient == address(0)) {
                    IDividendToken(token).distributeRewards{value: toHolders * FACADE_TO_NATIVE}();
                } else {
                    _sendNative(p.rewardsRecipient, toHolders * FACADE_TO_NATIVE);
                }
            }
            if (toProtocol > 0) _sendNative(protocol, toProtocol * FACADE_TO_NATIVE);
            emit FeesCollected(token, toHolders, toProtocol, tokenSide);
        } else {
            emit FeesCollected(token, 0, 0, tokenSide);
        }

        // Token side: to the protocol (raw tokens can't stream as dividends).
        if (tokenSide > 0) {
            require(IERC20(token).transfer(protocol, tokenSide), "token transfer failed");
        }
    }

    /// @dev Native arrives here from facade credits (which never call code) in
    ///      production, and from the facade mock's explicit pushes in tests.
    receive() external payable {}

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
