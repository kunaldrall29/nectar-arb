// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

interface IPriceOracle {
    function getPrice(address asset) external view returns (uint256 price, uint256 timestamp, bool isValid);
}

/// @title RiskGuard — price validity checks (PX01).
contract RiskGuard is Ownable {
    IPriceOracle public oracle;

    mapping(bytes32 => bool) public scopePaused;

    event ScopePaused(bytes32 indexed scope, bool paused);

    constructor(address oracle_) Ownable(msg.sender) {
        oracle = IPriceOracle(oracle_);
    }

    function setOracle(address oracle_) external onlyOwner {
        oracle = IPriceOracle(oracle_);
    }

    function pauseScope(bytes32 scope, bool paused) external onlyOwner {
        scopePaused[scope] = paused;
        emit ScopePaused(scope, paused);
    }

    function assertPriceValid(bytes32 marketKey, address collateralToken) external view {
        require(!scopePaused[marketKey], "SCOPE_PAUSED");
        (uint256 price,, bool ok) = oracle.getPrice(collateralToken);
        require(ok && price > 0, "PRICE_UNAVAILABLE");
    }
}
