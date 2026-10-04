// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

struct MarketParams {
    address loanToken;
    address collateralToken;
    address oracle;
    uint256 lltv; // WAD, e.g. 0.77e18
}

struct Market {
    uint128 totalSupplyAssets;
    uint128 totalBorrowAssets;
    uint128 totalCollateral;
    uint128 totalBadDebt;
    uint64 createdAt;
}

struct Position {
    uint256 supplyAssets;
    uint256 borrowAssets;
    uint256 collateral;
}

interface IMorphoLiquidateCallback {
    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external;
}
