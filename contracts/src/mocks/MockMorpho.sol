// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {INectarOracle} from "../RiskGuard.sol";
import {INSUFFICIENT_PROCEEDS, POSITION_CHANGED, PRICE_UNAVAILABLE} from "../Errors.sol";

interface IMorphoLiquidateCallback {
    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external;
}

/// @notice MOCK Morpho Blue — labeled testnet/rehearsal market. Not a production lending deployment.
contract MockMorpho {
    struct MarketParams {
        address loanToken;
        address collateralToken;
        address oracle;
        uint256 lltv;
    }

    struct Position {
        uint256 collateral;
        uint256 borrow;
    }

    mapping(bytes32 => MarketParams) public marketParams;
    mapping(bytes32 => mapping(address => Position)) public positions;

    event MarketCreated(bytes32 indexed marketId, address loanToken, address collateralToken);
    event PositionSeeded(bytes32 indexed marketId, address indexed borrower, uint256 collateral, uint256 debt);
    event Liquidated(
        bytes32 indexed marketId, address indexed borrower, address indexed liquidator, uint256 seized, uint256 repaid
    );

    function createMarket(address loanToken, address collateralToken, address oracle, uint256 lltv)
        external
        returns (bytes32 marketId)
    {
        marketId = keccak256(abi.encode(loanToken, collateralToken, oracle, lltv, address(this)));
        marketParams[marketId] =
            MarketParams({loanToken: loanToken, collateralToken: collateralToken, oracle: oracle, lltv: lltv});
        emit MarketCreated(marketId, loanToken, collateralToken);
    }

    function seedPosition(bytes32 marketId, address borrower, uint256 collateral, uint256 debt) external {
        MarketParams memory m = marketParams[marketId];
        require(m.loanToken != address(0), "MARKET");
        IERC20Minimal(m.collateralToken).transferFrom(msg.sender, address(this), collateral);
        positions[marketId][borrower] = Position({collateral: collateral, borrow: debt});
        // Debt is minted into the borrower as borrowed spend — for rehearsal the loan tokens
        // stay in this contract until a liquidator repays, matching a simplified Morpho book.
        emit PositionSeeded(marketId, borrower, collateral, debt);
    }

    function increaseDebt(bytes32 marketId, address borrower, uint256 add) external {
        positions[marketId][borrower].borrow += add;
    }

    function repayAsBorrower(bytes32 marketId, address borrower, uint256 amount) external {
        Position storage p = positions[marketId][borrower];
        if (amount > p.borrow) amount = p.borrow;
        IERC20Minimal(marketParams[marketId].loanToken).transferFrom(msg.sender, address(this), amount);
        p.borrow -= amount;
    }

    function isUnhealthy(bytes32 marketId, address borrower) public view returns (bool) {
        Position memory p = positions[marketId][borrower];
        if (p.borrow == 0) return false;
        MarketParams memory m = marketParams[marketId];
        (int256 price,, bool paused,) = INectarOracle(m.oracle).latest();
        if (paused || price <= 0) return false;
        uint256 colValue = (p.collateral * uint256(price)) / 1e18;
        uint256 maxBorrow = (colValue * m.lltv) / 1e18;
        return p.borrow > maxBorrow;
    }

    function previewRepay(bytes32 marketId, address borrower, uint256 seizedAssets) public view returns (uint256) {
        Position memory p = positions[marketId][borrower];
        if (p.collateral == 0) return 0;
        if (seizedAssets > p.collateral) seizedAssets = p.collateral;
        if (seizedAssets == p.collateral) return p.borrow;
        return (p.borrow * seizedAssets) / p.collateral;
    }

    /// @dev Collateral is delivered to the liquidator first, then the authenticated callback
    ///      must approve exact repayment, then this contract collects.
    function liquidate(bytes32 marketId, address borrower, uint256 seizedAssets, bytes calldata data)
        external
        returns (uint256 repaid)
    {
        Position storage p = positions[marketId][borrower];
        MarketParams memory m = marketParams[marketId];
        if (p.collateral == 0 || p.borrow == 0) revert POSITION_CHANGED();
        if (!isUnhealthy(marketId, borrower)) revert POSITION_CHANGED();
        if (seizedAssets == 0 || seizedAssets > p.collateral) revert POSITION_CHANGED();

        (int256 price,, bool paused,) = INectarOracle(m.oracle).latest();
        if (paused || price <= 0) revert PRICE_UNAVAILABLE();

        repaid = previewRepay(marketId, borrower, seizedAssets);

        p.collateral -= seizedAssets;
        p.borrow -= repaid;

        IERC20Minimal(m.collateralToken).transfer(msg.sender, seizedAssets);

        if (data.length > 0) {
            IMorphoLiquidateCallback(msg.sender).onMorphoLiquidate(repaid, data);
        }

        bool ok = IERC20Minimal(m.loanToken).transferFrom(msg.sender, address(this), repaid);
        if (!ok) revert INSUFFICIENT_PROCEEDS();

        emit Liquidated(marketId, borrower, msg.sender, seizedAssets, repaid);
    }
}
