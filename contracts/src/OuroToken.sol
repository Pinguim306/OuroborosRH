// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "src/utils/ERC20.sol";
import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";

/// @title OuroToken
/// @notice A fixed-supply ERC20 that also pays dividends. Holders earn a share of
///         the trading fees streamed in by the bonding curve (in the chain's native
///         coin) **just by holding — no staking**. Rewards accrue continuously and
///         proportionally to balance; a holder connects their wallet and calls
///         `claim()` whenever they like.
///
///         Accounting uses the well-known dividend-paying-token accumulator
///         (magnified reward-per-share + per-account corrections applied on every
///         transfer), so a holder's entitlement stays correct as balances move and
///         is implicitly weighted by how long they hold (they accrue across every
///         inflow they're present for). Certain addresses (the bonding curve, the
///         token itself, later a DEX pair) are excluded from dividends.
contract OuroToken is ERC20, ReentrancyGuard {
    uint256 internal constant MAGNITUDE = 2 ** 128;

    string public metadataURI;

    /// @notice Address allowed to manage dividend exclusions (set to the launchpad
    ///         owner after launch; can be renounced to lock the config).
    address public authority;

    uint256 public magnifiedRewardPerShare;
    /// @notice Total balance held by non-excluded accounts (the dividend base).
    uint256 public dividendSupply;
    /// @notice Native received while `dividendSupply == 0`; flushed once holders exist.
    uint256 public pendingRewards;
    uint256 public totalRewardsDistributed;

    mapping(address => int256) internal magnifiedCorrections;
    mapping(address => uint256) public withdrawnRewards;
    mapping(address => bool) public isExcludedFromDividends;

    event RewardsDistributed(uint256 amount);
    event RewardClaimed(address indexed account, uint256 amount);
    event ExclusionSet(address indexed account, bool excluded);
    event AuthorityTransferred(address indexed from, address indexed to);

    error NotAuthority();
    error NothingToClaim();
    error NativeTransferFailed();
    error AlreadySet();

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _supply,
        address _to,
        address _authority,
        string memory _metadataURI
    ) ERC20(_name, _symbol) {
        metadataURI = _metadataURI;
        authority = _authority;
        emit AuthorityTransferred(address(0), _authority);

        _mint(_to, _supply);
        // The initial holder (the launchpad factory) and the token itself never
        // earn dividends; the curve is excluded right after it is deployed.
        _setExcluded(_to, true);
        _setExcluded(address(this), true);
    }

    modifier onlyAuthority() {
        if (msg.sender != authority) revert NotAuthority();
        _;
    }

    // --------------------------------------------------------------------- //
    //  Dividend views                                                       //
    // --------------------------------------------------------------------- //

    /// @notice Total native rewards ever credited to `account` (claimed + unclaimed).
    function accumulativeRewardOf(address account) public view returns (uint256) {
        if (isExcludedFromDividends[account]) return 0;
        int256 acc = int256(magnifiedRewardPerShare * balanceOf[account]) + magnifiedCorrections[account];
        if (acc < 0) return 0;
        return uint256(acc) / MAGNITUDE;
    }

    /// @notice Native rewards `account` can claim right now.
    function claimableRewardOf(address account) public view returns (uint256) {
        return accumulativeRewardOf(account) - withdrawnRewards[account];
    }

    // --------------------------------------------------------------------- //
    //  Distribute / claim                                                   //
    // --------------------------------------------------------------------- //

    /// @notice Stream native rewards to holders. Called by the bonding curve; anyone
    ///         may also top up the pool. Also reachable via a plain transfer (`receive`).
    function distributeRewards() public payable {
        _distribute(msg.value);
    }

    receive() external payable {
        _distribute(msg.value);
    }

    /// @notice Withdraw the caller's accrued native rewards.
    function claim() external nonReentrant {
        uint256 amount = claimableRewardOf(msg.sender);
        if (amount == 0) revert NothingToClaim();
        withdrawnRewards[msg.sender] += amount;
        _sendNative(msg.sender, amount);
        emit RewardClaimed(msg.sender, amount);
    }

    // --------------------------------------------------------------------- //
    //  Exclusions / authority                                               //
    // --------------------------------------------------------------------- //

    function setExcludedFromDividends(address account, bool excluded) external onlyAuthority {
        _setExcluded(account, excluded);
    }

    function transferAuthority(address newAuthority) external onlyAuthority {
        emit AuthorityTransferred(authority, newAuthority);
        authority = newAuthority;
    }

    function renounceAuthority() external onlyAuthority {
        emit AuthorityTransferred(authority, address(0));
        authority = address(0);
    }

    // --------------------------------------------------------------------- //
    //  Internals                                                            //
    // --------------------------------------------------------------------- //

    function _distribute(uint256 amount) internal {
        if (amount == 0) return;
        if (dividendSupply > 0) {
            magnifiedRewardPerShare += (amount * MAGNITUDE) / dividendSupply;
            totalRewardsDistributed += amount;
        } else {
            pendingRewards += amount;
        }
        emit RewardsDistributed(amount);
    }

    function _flushPending() internal {
        if (pendingRewards > 0 && dividendSupply > 0) {
            uint256 p = pendingRewards;
            pendingRewards = 0;
            magnifiedRewardPerShare += (p * MAGNITUDE) / dividendSupply;
            totalRewardsDistributed += p;
        }
    }

    function _setExcluded(address account, bool excluded) internal {
        if (isExcludedFromDividends[account] == excluded) revert AlreadySet();
        uint256 bal = balanceOf[account];
        if (excluded) {
            // Remove from the dividend base and forfeit future accrual while excluded.
            if (bal > 0) dividendSupply -= bal;
        } else {
            if (bal > 0) dividendSupply += bal;
            // Start accruing from now, with no retroactive claim on past inflows.
            magnifiedCorrections[account] = -int256(magnifiedRewardPerShare * bal);
        }
        isExcludedFromDividends[account] = excluded;
        emit ExclusionSet(account, excluded);
    }

    /// @dev Dividend accounting on every balance move. Corrections keep each holder's
    ///      accumulative entitlement invariant across transfers; `dividendSupply`
    ///      tracks tokens entering/leaving the non-excluded set.
    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);

        int256 magCorrection = int256(magnifiedRewardPerShare * amount);
        bool fromExcluded = from == address(0) || isExcludedFromDividends[from];
        bool toExcluded = to == address(0) || isExcludedFromDividends[to];

        if (!fromExcluded) magnifiedCorrections[from] += magCorrection;
        if (!toExcluded) magnifiedCorrections[to] -= magCorrection;

        if (fromExcluded && !toExcluded) {
            dividendSupply += amount; // tokens enter the dividend base
            _flushPending();
        } else if (!fromExcluded && toExcluded) {
            dividendSupply -= amount; // tokens leave the dividend base
        }
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
