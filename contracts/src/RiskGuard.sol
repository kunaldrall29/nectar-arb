// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {PRICE_UNAVAILABLE, SEQUENCER_UNAVAILABLE} from "./Errors.sol";

interface INectarOracle {
    function latest() external view returns (int256 price, uint256 updatedAt, bool feedPaused, bytes32 feedId);
}

interface INectarSequencer {
    function status() external view returns (bool up, uint256 startedAt);
}

/// @notice Refuses execution on stale, paused, or invalid prices and unsafe sequencer state.
contract RiskGuard {
    function check(address oracle, address sequencer, uint256 maxStaleness, uint256 grace) external view {
        if (oracle == address(0)) revert PRICE_UNAVAILABLE();
        (int256 price, uint256 updatedAt, bool feedPaused,) = INectarOracle(oracle).latest();
        if (feedPaused || price <= 0) revert PRICE_UNAVAILABLE();
        if (updatedAt > block.timestamp) revert PRICE_UNAVAILABLE();
        if (block.timestamp - updatedAt > maxStaleness) revert PRICE_UNAVAILABLE();

        if (sequencer != address(0)) {
            (bool up, uint256 startedAt) = INectarSequencer(sequencer).status();
            if (!up) revert SEQUENCER_UNAVAILABLE();
            if (block.timestamp < startedAt + grace) revert SEQUENCER_UNAVAILABLE();
        }
    }
}
