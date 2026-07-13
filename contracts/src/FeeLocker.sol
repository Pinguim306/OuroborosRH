// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";
import {IERC20} from "src/interfaces/IERC20.sol";
import {INonfungiblePositionManager, IWETH9} from "src/interfaces/IUniswapV3.sol";

interface ILaunchpadFees {
    function feeRecipient() external view returns (address);
}

interface IDividendToken {
    function distributeRewards() external payable;
}

/// @title FeeLocker
/// @notice Permanent vault for the Uniswap V3 position NFTs of instant-V3 launches.
///
///         The locker's only value-moving function is `collect`, which harvests the
///         pool's accrued swap fees (the 1% fee tier) and splits them:
///           - the WETH side is unwrapped and split between the protocol
///             (`launchpad.feeRecipient()`, read live) and the token's holders
///             (streamed through `distributeRewards`, claimable with no staking);
///           - the token side goes to the protocol.
///
///         There is no function to withdraw, transfer, or decrease the position
///         itself — the principal liquidity is locked forever, making the market
///         un-ruggable while its fees stay harvestable. `collect` is permissionless:
///         anyone may crank it at any time.
contract FeeLocker is ReentrancyGuard {
    uint256 private constant BPS = 10_000;

    INonfungiblePositionManager public immutable positionManager;
    address public immutable weth;
    address public immutable launchpad;
    /// @notice Share of the ETH-side fees streamed to the token's holders (bps).
    uint256 public immutable holderShareBps;

    struct Position {
        address token;
        bool tokenIs0; // whether the launched token is token0 of the pair
        // Where the holder-share of collected ETH fees goes. address(0) = Loop
        // Rewards (streamed to all holders); else Creator Rewards (paid directly).
        address rewardsRecipient;
    }

    mapping(uint256 => Position) public positions; // tokenId => position info

    event PositionLocked(uint256 indexed tokenId, address indexed token);
    event FeesCollected(
        uint256 indexed tokenId, address indexed token, uint256 ethToHolders, uint256 ethToProtocol, uint256 tokenSide
    );

    error NotLaunchpad();
    error UnknownPosition();
    error HolderShareTooHigh();
    error NativeTransferFailed();

    constructor(address _positionManager, address _launchpad, address _weth, uint256 _holderShareBps) {
        if (_holderShareBps > BPS) revert HolderShareTooHigh();
        positionManager = INonfungiblePositionManager(_positionManager);
        launchpad = _launchpad;
        weth = _weth;
        holderShareBps = _holderShareBps;
    }

    /// @notice Record a freshly minted position NFT. Only the launchpad may register,
    ///         in the same transaction that mints the position to this locker.
    ///         `rewardsRecipient` = address(0) streams the holder share to all holders
    ///         (Loop Rewards); any other address receives it directly (Creator Rewards).
    function register(uint256 tokenId, address token, bool tokenIs0, address rewardsRecipient) external {
        if (msg.sender != launchpad) revert NotLaunchpad();
        positions[tokenId] = Position({token: token, tokenIs0: tokenIs0, rewardsRecipient: rewardsRecipient});
        emit PositionLocked(tokenId, token);
    }

    /// @notice Harvest the accrued swap fees of a locked position. Callable by anyone.
    function collect(uint256 tokenId) external nonReentrant returns (uint256 ethSide, uint256 tokenSide) {
        Position memory p = positions[tokenId];
        if (p.token == address(0)) revert UnknownPosition();

        (uint256 amount0, uint256 amount1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        (tokenSide, ethSide) = p.tokenIs0 ? (amount0, amount1) : (amount1, amount0);

        address protocol = ILaunchpadFees(launchpad).feeRecipient();

        // ETH side: unwrap, route the holder share (to all holders in Loop Rewards
        // mode, or straight to the creator in Creator Rewards mode), rest to protocol.
        if (ethSide > 0) {
            IWETH9(weth).withdraw(ethSide);
            uint256 toHolders = (ethSide * holderShareBps) / BPS;
            if (toHolders > 0) {
                if (p.rewardsRecipient == address(0)) {
                    IDividendToken(p.token).distributeRewards{value: toHolders}();
                } else {
                    _sendNative(p.rewardsRecipient, toHolders);
                }
            }
            uint256 toProtocol = ethSide - toHolders;
            if (toProtocol > 0) _sendNative(protocol, toProtocol);
            emit FeesCollected(tokenId, p.token, toHolders, toProtocol, tokenSide);
        } else {
            emit FeesCollected(tokenId, p.token, 0, 0, tokenSide);
        }

        // Token side: to the protocol (V3 can't stream raw tokens as dividends).
        if (tokenSide > 0) {
            require(IERC20(p.token).transfer(protocol, tokenSide), "token transfer failed");
        }
    }

    /// @dev Accept the position NFT mint and WETH unwrapping.
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    receive() external payable {}

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
