// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal subset of the Morpho Blue market interface that the Nectar adapter path relies on.
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    uint256 lltv;
}

interface IMorphoLike {
    function liquidate(
        MarketParams calldata marketParams,
        address borrower,
        uint256 seizedAssets,
        uint256 repaidShares,
        bytes calldata data
    ) external returns (uint256 seizedAssetsOut, uint256 repaidAssets);

    function position(bytes32 id, address borrower)
        external
        view
        returns (uint256 collateral, uint256 borrowAssets);

    function isHealthy(MarketParams calldata marketParams, address borrower) external view returns (bool);

    function previewLiquidation(MarketParams calldata marketParams, uint256 seizedAssets)
        external
        view
        returns (uint256 repaidAssets);
}

interface IMorphoLiquidateCallback {
    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external;
}

/// @notice Morpho-compatible oracle: price of 1 collateral base unit in loan base units, scaled by 1e36.
interface IOracle {
    function price() external view returns (uint256);
}

/// @notice Freshness-aware view used by Nectar's RiskGuard checks (PX01).
interface INectarPriceSource {
    function latestObservation() external view returns (uint256 price, uint256 updatedAt, bool paused);
}

/// @notice Chainlink-style L2 sequencer uptime feed (answer 0 = up, 1 = down).
interface ISequencerUptimeFeed {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
