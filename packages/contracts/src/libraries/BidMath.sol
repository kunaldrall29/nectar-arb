// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Indicative PropAMM bid. Rounding is toward the pool (floor).
library BidMath {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant PRICE_SCALE = 1e18;

    function quote(
        uint256 collateralAmount,
        uint256 price,
        uint256 inventoryAfter,
        uint256 inventoryCap,
        uint256 baseSpreadBps,
        uint256 volatilityBufferBps,
        uint256 sessionBufferBps,
        uint256 maxSkewBps
    ) internal pure returns (uint256 debtOut, uint256 haircutBps, bool ok) {
        if (collateralAmount == 0 || price == 0 || inventoryCap == 0 || inventoryAfter > inventoryCap) {
            return (0, 0, false);
        }
        uint256 skew = Math.mulDiv(inventoryAfter, maxSkewBps, inventoryCap);
        haircutBps = baseSpreadBps + volatilityBufferBps + sessionBufferBps + skew;
        if (haircutBps >= BPS) return (0, haircutBps, false);
        uint256 referenceValueDebt = Math.mulDiv(collateralAmount, price, PRICE_SCALE);
        debtOut = Math.mulDiv(referenceValueDebt, BPS - haircutBps, BPS);
        ok = debtOut != 0;
    }
}
