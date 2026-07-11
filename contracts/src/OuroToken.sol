// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "src/utils/ERC20.sol";

/// @title OuroToken
/// @notice A fixed-supply ERC20 launched by the Ouroboros launchpad. The full
///         supply is minted once, to the bonding curve, at construction. There is
///         no owner and no mint function after deployment — the supply is immutable.
contract OuroToken is ERC20 {
    /// @dev Off-chain metadata pointer (image / description live off-chain; the URI
    ///      is emitted at launch and stored by indexers, kept here for convenience).
    string public metadataURI;

    constructor(string memory _name, string memory _symbol, uint256 _supply, address _to, string memory _metadataURI)
        ERC20(_name, _symbol)
    {
        metadataURI = _metadataURI;
        _mint(_to, _supply);
    }
}
