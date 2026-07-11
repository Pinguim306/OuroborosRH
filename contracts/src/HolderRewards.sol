// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "src/interfaces/IERC20.sol";
import {ReentrancyGuard} from "src/utils/ReentrancyGuard.sol";

/// @title HolderRewards
/// @notice The "Rewards → Holders" leg of the Ouroboros loop. Holders stake a
///         token here and earn a share of the trading fees streamed in by the
///         bonding curve (paid in the chain's native coin).
///
///         Distribution uses a Synthetix-style `rewardPerToken` accumulator, which
///         is inherently **amount × time** weighted: your share of each fee inflow
///         is proportional to your stake, and staying staked across more inflows
///         earns more. On top of that, a **loyalty multiplier** ramps your effective
///         weight from 1.0× to `MAX_MULTIPLIER` over `RAMP` of continuous staking —
///         the explicit "how long you hold" boost. Withdrawing resets the ramp.
contract HolderRewards is ReentrancyGuard {
    uint256 private constant WAD = 1e18;

    /// @notice Base multiplier (1.0×).
    uint256 public constant BASE_MULTIPLIER = 1e18;
    /// @notice Maximum loyalty multiplier (3.0×).
    uint256 public constant MAX_MULTIPLIER = 3e18;
    /// @notice Time to ramp from BASE to MAX at continuous stake.
    uint256 public constant RAMP = 90 days;

    /// @notice Token that holders stake to earn.
    IERC20 public immutable stakingToken;

    /// @notice Accumulated native reward per boosted-unit, scaled by WAD.
    uint256 public rewardPerTokenStored;
    /// @notice Sum of every staker's boosted balance.
    uint256 public totalBoosted;
    /// @notice Sum of every staker's raw staked balance.
    uint256 public totalStaked;
    /// @notice Rewards received while nobody was staked; flushed on next stake/notify.
    uint256 public pendingRewards;

    struct Account {
        uint256 balance; // raw staked amount
        uint256 boosted; // balance * multiplier / WAD, checkpointed
        uint256 rewardPerTokenPaid;
        uint256 rewards; // accrued native, claimable (wei)
        uint256 stakeStart; // timestamp loyalty ramp started (reset on withdraw)
    }

    mapping(address => Account) public accounts;

    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardPaid(address indexed user, uint256 amount);
    event RewardAdded(uint256 amount);

    error ZeroAmount();
    error InsufficientStake();
    error NativeTransferFailed();

    constructor(address _stakingToken) {
        stakingToken = IERC20(_stakingToken);
    }

    // --------------------------------------------------------------------- //
    //  Views                                                                //
    // --------------------------------------------------------------------- //

    /// @notice Current loyalty multiplier for `user` (WAD-scaled), 1.0×–3.0×.
    function loyaltyMultiplier(address user) public view returns (uint256) {
        Account storage a = accounts[user];
        // balance == 0 is the sole "not staked" sentinel; whenever balance > 0,
        // stakeStart holds the (block-time) start of the current loyalty streak.
        if (a.balance == 0) return BASE_MULTIPLIER;
        uint256 elapsed = block.timestamp - a.stakeStart;
        if (elapsed >= RAMP) return MAX_MULTIPLIER;
        return BASE_MULTIPLIER + (elapsed * (MAX_MULTIPLIER - BASE_MULTIPLIER)) / RAMP;
    }

    /// @notice `rewardPerTokenStored` including any pending (undistributed) rewards.
    function rewardPerToken() public view returns (uint256) {
        uint256 rpt = rewardPerTokenStored;
        if (totalBoosted > 0 && pendingRewards > 0) {
            rpt += (pendingRewards * WAD) / totalBoosted;
        }
        return rpt;
    }

    /// @notice Native rewards currently claimable by `user`.
    function earned(address user) public view returns (uint256) {
        Account storage a = accounts[user];
        return a.rewards + (a.boosted * (rewardPerToken() - a.rewardPerTokenPaid)) / WAD;
    }

    function balanceOf(address user) external view returns (uint256) {
        return accounts[user].balance;
    }

    // --------------------------------------------------------------------- //
    //  Mutations                                                            //
    // --------------------------------------------------------------------- //

    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Account storage a = accounts[msg.sender];
        _settle(msg.sender);

        if (a.stakeStart == 0) a.stakeStart = block.timestamp;
        a.balance += amount;
        totalStaked += amount;
        _reapplyBoost(msg.sender);
        _flushPending();

        require(stakingToken.transferFrom(msg.sender, address(this), amount), "transferFrom failed");
        emit Staked(msg.sender, amount);
    }

    function withdraw(uint256 amount) public nonReentrant {
        if (amount == 0) revert ZeroAmount();
        Account storage a = accounts[msg.sender];
        if (a.balance < amount) revert InsufficientStake();
        _settle(msg.sender);

        a.balance -= amount;
        totalStaked -= amount;
        // Withdrawing breaks the loyalty streak: reset the ramp.
        a.stakeStart = a.balance == 0 ? 0 : block.timestamp;
        _reapplyBoost(msg.sender);

        require(stakingToken.transfer(msg.sender, amount), "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    function claim() public nonReentrant {
        Account storage a = accounts[msg.sender];
        _settle(msg.sender);
        // Claiming is an interaction, so refresh the loyalty boost too.
        _reapplyBoost(msg.sender);
        uint256 reward = a.rewards;
        if (reward > 0) {
            a.rewards = 0;
            _sendNative(msg.sender, reward);
            emit RewardPaid(msg.sender, reward);
        }
    }

    /// @notice Refresh a holder's checkpointed loyalty boost. Because the boost is
    ///         checkpointed (Curve-gauge style), a passive staker calls this to make
    ///         their grown multiplier count toward future rewards. Callable by anyone.
    function poke(address user) public nonReentrant {
        _settle(user);
        _reapplyBoost(user);
    }

    /// @notice Withdraw everything and claim in one call.
    function exit() external {
        withdraw(accounts[msg.sender].balance);
        claim();
    }

    /// @notice Explicitly fund the reward pool with native coin (also see `receive`).
    function fund() external payable {
        _notifyReward(msg.value);
    }

    /// @dev The bonding curve streams the reward share here as a plain native transfer.
    receive() external payable {
        _notifyReward(msg.value);
    }

    // --------------------------------------------------------------------- //
    //  Internals                                                            //
    // --------------------------------------------------------------------- //

    /// @dev Credit rewards accrued on the checkpointed boosted balance. Must run
    ///      BEFORE any balance/stakeStart change so the old boost applies to the past.
    function _settle(address user) internal {
        Account storage a = accounts[user];
        a.rewards += (a.boosted * (rewardPerToken() - a.rewardPerTokenPaid)) / WAD;
        // Fold any pending rewards into the accumulator before recording the paid mark.
        _flushPending();
        a.rewardPerTokenPaid = rewardPerTokenStored;
    }

    /// @dev Recompute the checkpointed boosted balance from the current raw balance
    ///      and loyalty multiplier, keeping `totalBoosted` in sync.
    function _reapplyBoost(address user) internal {
        Account storage a = accounts[user];
        uint256 newBoosted = (a.balance * loyaltyMultiplier(user)) / WAD;
        totalBoosted = totalBoosted - a.boosted + newBoosted;
        a.boosted = newBoosted;
    }

    function _notifyReward(uint256 amount) internal {
        if (amount == 0) return;
        if (totalBoosted == 0) {
            pendingRewards += amount;
        } else {
            rewardPerTokenStored += (amount * WAD) / totalBoosted;
        }
        emit RewardAdded(amount);
    }

    function _flushPending() internal {
        if (pendingRewards > 0 && totalBoosted > 0) {
            uint256 p = pendingRewards;
            pendingRewards = 0;
            rewardPerTokenStored += (p * WAD) / totalBoosted;
        }
    }

    function _sendNative(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
