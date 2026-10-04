// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Compares a funded quote, a PropAMM bid, and an external sale.
///         `required` is the debt that must be repaid (the 10000 figure in the synthetic test).
library RouteLib {
    struct Offer {
        uint256 debtOut;
        bool live;
    }

    function allocationWorks(uint256 cashOut, uint256 repay, uint256 keeper, uint256 protocol, uint256 minSurplus)
        internal
        pure
        returns (bool)
    {
        if (keeper > cashOut) return false;
        uint256 fees = keeper + protocol;
        if (fees < keeper || fees > cashOut) return false;
        if (cashOut - fees < repay) return false;
        return cashOut - fees - repay >= minSurplus;
    }

    /// @return route 1 quote, 2 propAMM, 3 external, 0 none. Highest debt proceeds wins.
    function select(uint256 required, Offer memory quote, Offer memory prop, Offer memory ext)
        internal
        pure
        returns (uint8 route, uint256 best)
    {
        if (quote.live && quote.debtOut >= required && quote.debtOut > best) {
            best = quote.debtOut;
            route = 1;
        }
        if (prop.live && prop.debtOut >= required && prop.debtOut > best) {
            best = prop.debtOut;
            route = 2;
        }
        if (ext.live && ext.debtOut >= required && ext.debtOut > best) {
            best = ext.debtOut;
            route = 3;
        }
    }
}
