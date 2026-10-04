// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TestToken
/// @notice TESTNET ONLY. Mintable ERC20 standing in for USDC / USDG debt tokens and tokenized-stock collateral.
/// Anyone may call `faucet` for a capped amount per call so demo users can self-serve.
contract TestToken is ERC20, Ownable {
    uint8 private immutable _decimals;
    uint256 public immutable faucetAmount;

    error FaucetCooldown(uint256 availableAt);

    uint256 public constant FAUCET_COOLDOWN = 60;
    mapping(address => uint256) public lastFaucet;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 faucetAmount_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        _decimals = decimals_;
        faucetAmount = faucetAmount_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function faucet() external {
        uint256 next = lastFaucet[msg.sender] + FAUCET_COOLDOWN;
        if (lastFaucet[msg.sender] != 0 && block.timestamp < next) revert FaucetCooldown(next);
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
    }
}
