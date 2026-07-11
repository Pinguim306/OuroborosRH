// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {OuroToken} from "src/OuroToken.sol";
import {BondingCurve} from "src/BondingCurve.sol";
import {Ownable} from "src/utils/Ownable.sol";
import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";

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
    }

    CurveParams public params;

    /// @notice Developer address that receives the creation fee and per-trade dev fee.
    address public feeRecipient;
    /// @notice Fixed fee (in native coin) charged on every token launch. Set this to
    ///         roughly the desired USD amount for the current native price; adjustable.
    uint256 public creationFee;

    /// @notice Uniswap-V2-style router each curve migrates liquidity to at graduation.
    address public router;

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
    event ParamsUpdated(CurveParams params);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event CreationFeeUpdated(uint256 creationFee);
    event RouterUpdated(address indexed router);

    error InsufficientCreationFee();
    error NativeTransferFailed();

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

    function marketsCount() external view returns (uint256) {
        return markets.length;
    }

    // --------------------------------------------------------------------- //
    //  Launch                                                               //
    // --------------------------------------------------------------------- //

    /// @notice Launch a new dividend token + bonding curve. Requires `creationFee`
    ///         in native coin (excess is refunded).
    function createToken(string calldata name, string calldata symbol, string calldata metadataURI)
        external
        payable
        nonReentrant
        returns (address token, address curve)
    {
        if (msg.value < creationFee) revert InsufficientCreationFee();
        CurveParams memory p = params;

        // 1. Mint the full supply to this factory (temporary, excluded holder).
        //    Authority stays with the factory so it can exclude the curve below.
        OuroToken t = new OuroToken(name, symbol, p.totalSupply, address(this), address(this), metadataURI);

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
            p.graduationTarget
        );

        // 3. Exclude the curve from dividends, then hand it the supply to sell.
        t.setExcludedFromDividends(address(c), true);
        require(t.transfer(address(c), p.totalSupply), "supply transfer failed");

        // 4. Hand dividend authority to the curve (trustless code, not a human). The
        //    curve only uses it once — to exclude the DEX pair at graduation — then
        //    renounces. No human can ever exclude a holder and freeze rewards. (M2)
        t.transferAuthority(address(c));

        // 5. Record the market BEFORE any external value transfer (checks-effects-
        //    interactions), then forward the creation fee. (L2 fix.)
        uint256 id = markets.length;
        markets.push(
            Market({
                token: address(t),
                curve: address(c),
                creator: msg.sender,
                name: name,
                symbol: symbol,
                metadataURI: metadataURI,
                createdAt: block.timestamp
            })
        );
        marketIndexByToken[address(t)] = id + 1;
        emit TokenLaunched(id, msg.sender, address(t), address(c), name, symbol);

        _payCreationFee();
        return (address(t), address(c));
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

    function _payCreationFee() internal {
        if (creationFee > 0) _sendNative(feeRecipient, creationFee);
        uint256 refund = msg.value - creationFee;
        if (refund > 0) _sendNative(msg.sender, refund);
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
