// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Test stand-in for Arc's native-USDC ERC20 facade (0x3600…0000). The real
///         facade is a system contract: a 6-decimal ERC20 view over NATIVE balances,
///         whose transfers move native without executing recipient code — behavior
///         plain EVM bytecode cannot have, so a vanilla fork cannot run it.
///
///         This mock keeps ordinary storage balances (what pools and routers read)
///         and additionally PUSHES the mirrored native amount (×1e12, 6 → 18
///         decimals) from its own pre-funded balance on every credit, best-effort —
///         emulating the real chain crediting the recipient's native balance. Fund it
///         with `vm.deal(address(facade), lots)` in setUp. Contracts without a
///         receive() (the pool) simply miss the push and keep using the storage
///         ledger; contracts that harvest native (the locker) get exactly what the
///         real chain would give them.
///
///         Deliberately constructor-less state (metadata via constants): tests
///         `vm.etch` this code onto the canonical facade address, where the original
///         deployment's storage does not follow.
contract MockUSDCFacade {
    uint256 private constant FACADE_TO_NATIVE = 1e12;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function name() external pure returns (string memory) {
        return "USDC";
    }

    function symbol() external pure returns (string memory) {
        return "USDC";
    }

    function decimals() external pure returns (uint8) {
        return 6;
    }

    /// @notice Test-only seeding (the real facade's balances exist by having native).
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        _pushNative(to, amount);
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
        }
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "balance");
        unchecked {
            balanceOf[from] -= amount;
        }
        balanceOf[to] += amount;
        _pushNative(to, amount);
        emit Transfer(from, to, amount);
    }

    /// @dev Mirror the credit into native, like the real chain does. Best-effort: a
    ///      recipient with no receive() (the pool) just doesn't take native — it only
    ///      ever reads the storage ledger anyway.
    function _pushNative(address to, uint256 amount) internal {
        uint256 wei_ = amount * FACADE_TO_NATIVE;
        if (address(this).balance >= wei_) {
            (bool ok,) = to.call{value: wei_}("");
            ok; // ignored on purpose
        }
    }

    receive() external payable {}
}
