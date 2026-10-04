// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IOracle} from "../interfaces/IOracle.sol";

/// @title MockOracle
/// @notice TESTNET ONLY (PRD PX05: mock prices must be labeled). Morpho-style price: the value of 1 base unit of
/// collateral expressed in base units of the loan token, scaled by 1e36. Also exposes `updatedAt` and `paused`
/// so the RiskGuard checks in the executor can be exercised.
/// When `openStress` is true any account may move the price within [minPrice, maxPrice]; this powers the
/// clearly labeled "testnet stress scenario" control in the app.
contract MockOracle is IOracle, Ownable {
    uint256 public override price;
    uint256 public override updatedAt;
    bool public override paused;
    bool public openStress;
    uint256 public immutable referencePrice;
    uint256 public immutable minPrice;
    uint256 public immutable maxPrice;
    string public description;

    event PriceUpdated(uint256 price, uint256 updatedAt, address indexed by);
    event PausedSet(bool paused);
    event OpenStressSet(bool open);

    error NotAllowed();
    error OutOfBounds();

    constructor(string memory description_, uint256 initialPrice, bool openStress_, address owner_) Ownable(owner_) {
        description = description_;
        referencePrice = initialPrice;
        minPrice = initialPrice / 10;
        maxPrice = initialPrice * 10;
        openStress = openStress_;
        _set(initialPrice);
    }

    function setPrice(uint256 newPrice) external {
        if (msg.sender != owner()) {
            if (!openStress) revert NotAllowed();
            if (newPrice < minPrice || newPrice > maxPrice) revert OutOfBounds();
        }
        _set(newPrice);
    }

    /// @notice Re-publish the current price with a fresh timestamp (testnet heartbeat).
    function poke() external {
        if (msg.sender != owner() && !openStress) revert NotAllowed();
        _set(price);
    }

    /// @notice Owner can write an arbitrary observation, including stale or future timestamps, for test fixtures.
    function setObservation(uint256 newPrice, uint256 timestamp) external onlyOwner {
        price = newPrice;
        updatedAt = timestamp;
        emit PriceUpdated(newPrice, timestamp, msg.sender);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    function setOpenStress(bool open) external onlyOwner {
        openStress = open;
        emit OpenStressSet(open);
    }

    function _set(uint256 newPrice) internal {
        price = newPrice;
        updatedAt = block.timestamp;
        emit PriceUpdated(newPrice, block.timestamp, msg.sender);
    }
}
