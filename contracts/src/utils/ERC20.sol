// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "src/interfaces/IERC20.sol";

/// @notice Minimal, gas-lean ERC20 implementation (self-contained, no external deps).
///         All balance movement funnels through the virtual `_update` hook so
///         subclasses (e.g. the dividend token) can react to every transfer/mint/burn.
abstract contract ERC20 is IERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    error InsufficientBalance();
    error InsufficientAllowance();
    error TransferToZero();
    error TransferFromZero();

    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            allowance[from][msg.sender] = allowed - amount;
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal virtual {
        if (from == address(0)) revert TransferFromZero();
        if (to == address(0)) revert TransferToZero();
        _update(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        if (to == address(0)) revert TransferToZero();
        _update(address(0), to, amount);
    }

    /// @dev Single choke point for supply/balance changes. `from == 0` mints,
    ///      `to == 0` burns. Subclasses override to add behaviour, calling super first.
    function _update(address from, address to, uint256 amount) internal virtual {
        if (from == address(0)) {
            totalSupply += amount;
        } else {
            uint256 fromBal = balanceOf[from];
            if (fromBal < amount) revert InsufficientBalance();
            unchecked {
                balanceOf[from] = fromBal - amount;
            }
        }
        if (to == address(0)) {
            unchecked {
                totalSupply -= amount;
            }
        } else {
            unchecked {
                balanceOf[to] += amount;
            }
        }
        emit Transfer(from, to, amount);
    }
}
