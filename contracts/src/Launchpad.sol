// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OuroToken} from "src/OuroToken.sol";
import {BondingCurve} from "src/BondingCurve.sol";
import {HolderRewards} from "src/HolderRewards.sol";
import {Ownable} from "src/utils/Ownable.sol";

/// @title Launchpad
/// @notice Factory that spins up a full Ouroboros market in one transaction:
///         the token, its bonding curve, and its holder-rewards vault — all wired
///         together so trading fees flow Trade → Liquidity → Rewards automatically.
contract Launchpad is Ownable {
    struct CurveParams {
        uint256 totalSupply; // full token supply, all sold via the curve
        uint256 virtualNative; // virtual native seed for the starting price
        uint256 feeBps; // trade fee in basis points (100 = 1%)
        uint256 liqShareBps; // share of the fee that becomes permanent liquidity
        uint256 graduationTarget; // real native raised that graduates the curve
    }

    CurveParams public params;

    struct Market {
        address token;
        address curve;
        address rewards;
        address creator;
        string name;
        string symbol;
        string metadataURI;
        uint256 createdAt;
    }

    Market[] public markets;
    mapping(address => uint256) public marketIndexByToken; // token => index+1 (0 = none)

    event TokenLaunched(
        uint256 indexed id,
        address indexed creator,
        address token,
        address curve,
        address rewards,
        string name,
        string symbol
    );
    event ParamsUpdated(CurveParams params);

    constructor(address initialOwner, CurveParams memory _params) Ownable(initialOwner) {
        params = _params;
    }

    function setParams(CurveParams calldata _params) external onlyOwner {
        params = _params;
        emit ParamsUpdated(_params);
    }

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }

    /// @notice Launch a new token + curve + rewards vault.
    function createToken(string calldata name, string calldata symbol, string calldata metadataURI)
        external
        returns (address token, address curve, address rewards)
    {
        CurveParams memory p = params;

        // 1. Mint the full supply to this factory (temporary holder).
        OuroToken t = new OuroToken(name, symbol, p.totalSupply, address(this), metadataURI);

        // 2. Deploy the rewards vault for this token.
        HolderRewards r = new HolderRewards(address(t));

        // 3. Deploy the bonding curve wired to token + rewards.
        BondingCurve c = new BondingCurve(
            address(t),
            payable(address(r)),
            p.virtualNative,
            p.totalSupply,
            p.feeBps,
            p.liqShareBps,
            p.graduationTarget
        );

        // 4. Hand the entire supply to the curve to sell.
        require(t.transfer(address(c), p.totalSupply), "supply transfer failed");

        uint256 id = markets.length;
        markets.push(
            Market({
                token: address(t),
                curve: address(c),
                rewards: address(r),
                creator: msg.sender,
                name: name,
                symbol: symbol,
                metadataURI: metadataURI,
                createdAt: block.timestamp
            })
        );
        marketIndexByToken[address(t)] = id + 1;

        emit TokenLaunched(id, msg.sender, address(t), address(c), address(r), name, symbol);
        return (address(t), address(c), address(r));
    }

    /// @notice Return a page of markets, newest first — convenient for the frontend.
    function getMarkets(uint256 offset, uint256 limit) external view returns (Market[] memory page) {
        uint256 n = markets.length;
        if (offset >= n) return new Market[](0);
        uint256 end = offset + limit;
        if (end > n) end = n;
        page = new Market[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = markets[n - 1 - i]; // newest first
        }
    }
}
