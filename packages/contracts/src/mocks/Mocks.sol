// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {INectarOracle, ISequencerUptime} from "../interfaces/INectar.sol";
import {IOracle} from "../interfaces/IMorpho.sol";

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
    }

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        _move(from, to, amount);
        return true;
    }

    function _move(address from, address to, uint256 amount) internal {
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// @dev Morpho reads `price()` in 1e36. Nectar reads `latest()` and does not scale it again.
contract MockOracle is IOracle, INectarOracle {
    int256 public answer;
    uint256 public updatedAt;
    uint256 public scale;
    bool public sessionOpen;
    bool public corporateAction;

    function set(int256 answer_, uint256 updatedAt_, uint256 scale_, bool sessionOpen_, bool corporateAction_) external {
        answer = answer_;
        updatedAt = updatedAt_;
        scale = scale_;
        sessionOpen = sessionOpen_;
        corporateAction = corporateAction_;
    }

    function price() external view returns (uint256) {
        require(answer > 0, "PRICE");
        return uint256(answer) * 1e18;
    }

    function latest() external view returns (int256, uint256, uint256, bool, bool) {
        return (answer, updatedAt, scale, sessionOpen, corporateAction);
    }
}

contract MockRouter {
    uint256 public outAmount;

    function setOut(uint256 outAmount_) external {
        outAmount = outAmount_;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, address receiver) external returns (uint256) {
        require(MockERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn), "IN");
        require(MockERC20(tokenOut).transfer(receiver, outAmount), "OUT");
        return outAmount;
    }
}

contract MockSequencer is ISequencerUptime {
    int256 public answer;
    uint256 public startedAt;

    function set(int256 answer_, uint256 startedAt_) external {
        answer = answer_;
        startedAt = startedAt_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, startedAt, startedAt, 1);
    }
}

contract ERC1271Wallet {
    address public owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4) {
        (address signer, ECDSA.RecoverError err,) = ECDSA.tryRecover(hash, signature);
        if (err == ECDSA.RecoverError.NoError && signer == owner) return 0x1626ba7e;
        return 0xffffffff;
    }
}

contract FeeOnTransferToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount - 1;
        return true;
    }
}
