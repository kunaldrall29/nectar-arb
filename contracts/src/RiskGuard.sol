// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IRiskGuard} from "./interfaces/IRiskGuard.sol";

contract RiskGuard is IRiskGuard, Ownable {
    mapping(bytes32 => bool) private _paused;
    mapping(address => uint256) private _price;
    mapping(address => uint256) private _updatedAt;
    uint256 public maxPriceAge = 1 hours;
    address public guardian;

    error Unauthorized();
    error PriceUnavailable();
    error ScopePausedError();

    modifier onlyGuardianOrOwner() {
        if (msg.sender != owner() && msg.sender != guardian) revert Unauthorized();
        _;
    }

    constructor(address initialOwner, address guardian_) Ownable(initialOwner) {
        guardian = guardian_;
    }

    function setGuardian(address guardian_) external onlyOwner {
        guardian = guardian_;
    }

    function setMaxPriceAge(uint256 age) external onlyOwner {
        maxPriceAge = age;
    }

    function pauseScope(bytes32 scope, bool paused_) external onlyGuardianOrOwner {
        _paused[scope] = paused_;
        emit ScopePaused(scope, paused_);
    }

    function isPaused(bytes32 scope) public view returns (bool) {
        return _paused[scope] || _paused[bytes32("GLOBAL")];
    }

    function setPrice(address token, uint256 price) external onlyOwner {
        _price[token] = price;
        _updatedAt[token] = block.timestamp;
        emit PriceUpdated(token, price, block.timestamp);
    }

    function getPrice(address token) public view returns (uint256 price, uint256 updatedAt, bool valid) {
        price = _price[token];
        updatedAt = _updatedAt[token];
        valid = price > 0 && block.timestamp <= updatedAt + maxPriceAge;
    }

    function assertExecutable(bytes32 marketKey, address debtToken, address collateralToken) external view {
        if (isPaused(bytes32("GLOBAL")) || isPaused(marketKey) || isPaused(bytes32("EXEC"))) {
            revert ScopePausedError();
        }
        (, , bool debtOk) = getPrice(debtToken);
        (, , bool collOk) = getPrice(collateralToken);
        if (!debtOk || !collOk) revert PriceUnavailable();
    }
}