// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MarketParams, IMorphoLike, IMorphoLiquidateCallback, IOracle} from "../interfaces/IMorphoLike.sol";

/// @title MockLendingMarket (TESTNET MOCK, Morpho-Blue-like)
/// @notice Locally deployed, minimal isolated lending market reproducing Morpho Blue's liquidation ordering:
///         collateral is sent to the liquidator, the optional callback runs, then repayment is pulled.
///         Debt is tracked in assets (no interest, no shares). Not the production Morpho deployment.
contract MockLendingMarket is IMorphoLike {
    using SafeERC20 for IERC20;
    using Math for uint256;

    bool public constant IS_MOCK = true;
    uint256 internal constant WAD = 1e18;
    uint256 internal constant ORACLE_PRICE_SCALE = 1e36;
    uint256 internal constant MAX_LIF = 1.15e18;
    uint256 internal constant LIF_CURSOR = 0.3e18;

    struct Market {
        uint256 totalSupply;
        uint256 totalBorrow;
        bool created;
    }

    struct Position {
        uint256 collateral;
        uint256 borrowAssets;
    }

    mapping(bytes32 => Market) public market;
    mapping(bytes32 => MarketParams) public idToParams;
    mapping(bytes32 => mapping(address => Position)) internal _positions;
    mapping(bytes32 => mapping(address => uint256)) public supplied;

    event CreateMarket(bytes32 indexed id, address loanToken, address collateralToken, address oracle, uint256 lltv);
    event Supply(bytes32 indexed id, address indexed onBehalf, uint256 assets);
    event SupplyCollateral(bytes32 indexed id, address indexed onBehalf, uint256 assets);
    event Borrow(bytes32 indexed id, address indexed onBehalf, address receiver, uint256 assets);
    event Repay(bytes32 indexed id, address indexed onBehalf, uint256 assets);
    event Liquidate(
        bytes32 indexed id,
        address indexed caller,
        address indexed borrower,
        uint256 repaidAssets,
        uint256 seizedAssets,
        uint256 badDebtAssets
    );

    error MarketNotCreated();
    error MarketExists();
    error HealthyPosition();
    error UnhealthyPosition();
    error InsufficientLiquidity();
    error InsufficientCollateral();
    error ZeroAmount();

    function marketId(MarketParams memory p) public pure returns (bytes32) {
        return keccak256(abi.encode(p));
    }

    function createMarket(MarketParams calldata p) external returns (bytes32 id) {
        id = marketId(p);
        if (market[id].created) revert MarketExists();
        market[id].created = true;
        idToParams[id] = p;
        emit CreateMarket(id, p.loanToken, p.collateralToken, p.oracle, p.lltv);
    }

    function supply(MarketParams calldata p, uint256 assets, address onBehalf) external {
        bytes32 id = _id(p);
        if (assets == 0) revert ZeroAmount();
        market[id].totalSupply += assets;
        supplied[id][onBehalf] += assets;
        IERC20(p.loanToken).safeTransferFrom(msg.sender, address(this), assets);
        emit Supply(id, onBehalf, assets);
    }

    function supplyCollateral(MarketParams calldata p, uint256 assets, address onBehalf) external {
        bytes32 id = _id(p);
        if (assets == 0) revert ZeroAmount();
        _positions[id][onBehalf].collateral += assets;
        IERC20(p.collateralToken).safeTransferFrom(msg.sender, address(this), assets);
        emit SupplyCollateral(id, onBehalf, assets);
    }

    function borrow(MarketParams calldata p, uint256 assets, address receiver) external {
        bytes32 id = _id(p);
        if (assets == 0) revert ZeroAmount();
        Market storage m = market[id];
        if (m.totalSupply - m.totalBorrow < assets) revert InsufficientLiquidity();
        _positions[id][msg.sender].borrowAssets += assets;
        m.totalBorrow += assets;
        if (!_isHealthy(p, id, msg.sender)) revert UnhealthyPosition();
        IERC20(p.loanToken).safeTransfer(receiver, assets);
        emit Borrow(id, msg.sender, receiver, assets);
    }

    function repay(MarketParams calldata p, uint256 assets, address onBehalf) external {
        bytes32 id = _id(p);
        Position storage pos = _positions[id][onBehalf];
        uint256 amount = assets > pos.borrowAssets ? pos.borrowAssets : assets;
        pos.borrowAssets -= amount;
        market[id].totalBorrow -= amount;
        IERC20(p.loanToken).safeTransferFrom(msg.sender, address(this), amount);
        emit Repay(id, onBehalf, amount);
    }

    /// @inheritdoc IMorphoLike
    function liquidate(
        MarketParams calldata p,
        address borrower,
        uint256 seizedAssets,
        uint256, /* repaidShares: unsupported in mock, seizedAssets mode only */
        bytes calldata data
    ) external returns (uint256, uint256 repaidAssets) {
        bytes32 id = _id(p);
        if (seizedAssets == 0) revert ZeroAmount();
        if (_isHealthy(p, id, borrower)) revert HealthyPosition();

        Position storage pos = _positions[id][borrower];
        if (seizedAssets > pos.collateral) revert InsufficientCollateral();

        repaidAssets = previewLiquidation(p, seizedAssets);
        uint256 repayApplied = repaidAssets > pos.borrowAssets ? pos.borrowAssets : repaidAssets;
        pos.borrowAssets -= repayApplied;
        pos.collateral -= seizedAssets;
        market[id].totalBorrow -= repayApplied;

        uint256 badDebt;
        if (pos.collateral == 0 && pos.borrowAssets > 0) {
            badDebt = pos.borrowAssets;
            pos.borrowAssets = 0;
            market[id].totalBorrow -= badDebt;
            market[id].totalSupply -= badDebt;
        }

        emit Liquidate(id, msg.sender, borrower, repaidAssets, seizedAssets, badDebt);

        IERC20(p.collateralToken).safeTransfer(msg.sender, seizedAssets);
        if (data.length > 0) IMorphoLiquidateCallback(msg.sender).onMorphoLiquidate(repaidAssets, data);
        IERC20(p.loanToken).safeTransferFrom(msg.sender, address(this), repaidAssets);

        return (seizedAssets, repaidAssets);
    }

    function previewLiquidation(MarketParams calldata p, uint256 seizedAssets) public view returns (uint256) {
        uint256 collateralPrice = IOracle(p.oracle).price();
        uint256 lif = liquidationIncentiveFactor(p.lltv);
        uint256 seizedValue = seizedAssets.mulDiv(collateralPrice, ORACLE_PRICE_SCALE, Math.Rounding.Ceil);
        return seizedValue.mulDiv(WAD, lif, Math.Rounding.Ceil);
    }

    function liquidationIncentiveFactor(uint256 lltv) public pure returns (uint256) {
        uint256 denom = WAD - LIF_CURSOR.mulDiv(WAD - lltv, WAD);
        uint256 lif = WAD.mulDiv(WAD, denom);
        return lif < MAX_LIF ? lif : MAX_LIF;
    }

    function position(bytes32 id, address borrower) external view returns (uint256, uint256) {
        Position memory pos = _positions[id][borrower];
        return (pos.collateral, pos.borrowAssets);
    }

    function isHealthy(MarketParams calldata p, address borrower) external view returns (bool) {
        return _isHealthy(p, marketId(p), borrower);
    }

    /// @notice Max borrow in loan units for the current oracle price.
    function maxBorrow(MarketParams calldata p, address borrower) external view returns (uint256) {
        bytes32 id = marketId(p);
        uint256 collateralPrice = IOracle(p.oracle).price();
        return _positions[id][borrower].collateral.mulDiv(collateralPrice, ORACLE_PRICE_SCALE).mulDiv(p.lltv, WAD);
    }

    function _isHealthy(MarketParams memory p, bytes32 id, address borrower) internal view returns (bool) {
        Position memory pos = _positions[id][borrower];
        if (pos.borrowAssets == 0) return true;
        uint256 collateralPrice = IOracle(p.oracle).price();
        uint256 limit = pos.collateral.mulDiv(collateralPrice, ORACLE_PRICE_SCALE).mulDiv(p.lltv, WAD);
        return limit >= pos.borrowAssets;
    }

    function _id(MarketParams calldata p) internal view returns (bytes32 id) {
        id = marketId(p);
        if (!market[id].created) revert MarketNotCreated();
    }
}
