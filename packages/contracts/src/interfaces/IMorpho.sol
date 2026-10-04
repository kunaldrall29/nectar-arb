// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Morpho Blue market identity. `id` is `keccak256(abi.encode(marketParams))`.
struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    address irm;
    uint256 lltv;
}

interface IMorphoLiquidateCallback {
    /// @dev Upstream Morpho calls this after transferring collateral and before pulling loan tokens.
    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external;
}

interface IMorpho {
    function liquidate(
        MarketParams memory marketParams,
        address borrower,
        uint256 seizedAssets,
        uint256 repaidShares,
        bytes calldata data
    ) external returns (uint256 seizedAssetsOut, uint256 repaidAssetsOut);
}

interface IOracle {
    /// @dev Morpho oracle price, scaled by 1e36. One application of the feed scale lives here.
    function price() external view returns (uint256);
}
