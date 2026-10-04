// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IOracle, INectarPriceSource, ISequencerUptimeFeed} from "../interfaces/IMorphoLike.sol";

/// @title MockOracle (TESTNET MOCK PRICE)
/// @notice Operator-set price. The value already includes any stock-token multiplier; consumers must not reapply it.
contract MockOracle is IOracle, INectarPriceSource {
    bool public constant IS_MOCK = true;
    address public immutable operator;
    string public description;

    uint256 internal _price;
    uint256 public updatedAt;
    bool public paused;

    event PriceUpdated(uint256 price, uint256 updatedAt);
    event PausedSet(bool paused);

    error NotOperator();

    constructor(string memory description_, uint256 initialPrice) {
        operator = msg.sender;
        description = description_;
        _price = initialPrice;
        updatedAt = block.timestamp;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert NotOperator();
        _;
    }

    function setPrice(uint256 newPrice) external onlyOperator {
        _price = newPrice;
        updatedAt = block.timestamp;
        emit PriceUpdated(newPrice, block.timestamp);
    }

    /// @notice Test hook to fabricate stale or future-dated observations.
    function setPriceWithTimestamp(uint256 newPrice, uint256 timestamp) external onlyOperator {
        _price = newPrice;
        updatedAt = timestamp;
        emit PriceUpdated(newPrice, timestamp);
    }

    function setPaused(bool p) external onlyOperator {
        paused = p;
        emit PausedSet(p);
    }

    function price() external view returns (uint256) {
        return _price;
    }

    function latestObservation() external view returns (uint256, uint256, bool) {
        return (_price, updatedAt, paused);
    }
}

/// @title MockSequencerUptimeFeed (TESTNET MOCK)
contract MockSequencerUptimeFeed is ISequencerUptimeFeed {
    address public immutable operator;
    int256 public status;
    uint256 public statusSince;

    constructor() {
        operator = msg.sender;
        statusSince = block.timestamp > 7200 ? block.timestamp - 7200 : 0;
    }

    function setStatus(bool down) external {
        require(msg.sender == operator, "only operator");
        status = down ? int256(1) : int256(0);
        statusSince = block.timestamp;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, status, statusSince, statusSince, 1);
    }
}
