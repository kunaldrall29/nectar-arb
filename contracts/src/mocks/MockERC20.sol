// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20 (TESTNET MOCK)
/// @notice Freely mintable test token. Not USDG, USDC or a real Robinhood Stock Token.
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;
    bool public constant IS_MOCK = true;
    mapping(address => bool) public frozen;
    address public immutable admin;

    error Frozen(address account);

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
        admin = msg.sender;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Faucet-style mint, intentionally permissionless on testnet.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Simulates an issuer freeze (TOKEN_RESTRICTED fixtures).
    function setFrozen(address account, bool isFrozen) external {
        require(msg.sender == admin, "only admin");
        frozen[account] = isFrozen;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (frozen[from]) revert Frozen(from);
        if (frozen[to]) revert Frozen(to);
        super._update(from, to, value);
    }
}

/// @notice Fee-on-transfer token used to prove LQ07 balance-delta checks.
contract MockFeeOnTransferERC20 is ERC20 {
    constructor() ERC20("Mock Fee Token", "mFEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}
