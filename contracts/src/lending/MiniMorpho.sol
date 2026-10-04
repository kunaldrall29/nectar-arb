// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IOracle} from "../interfaces/IOracle.sol";
import {MarketParams, Market, Position, IMorphoLiquidateCallback} from "./IMiniMorpho.sol";

/// @title MiniMorpho
/// @notice TESTNET ONLY. A locally deployed, minimal Morpho-Blue-style isolated lending market used as the
/// liquidation venue for the Nectar prototype (PRD PX05: locally deployed lending contracts must be labeled).
/// It mirrors Morpho Blue's liquidation semantics that matter to Nectar:
///  - a position is liquidatable when borrowed > collateral * price / 1e36 * lltv
///  - the liquidation incentive factor is min(1.15, 1 / (1 - 0.3 * (1 - lltv)))
///  - repaid = seized * price / 1e36 / LIF (rounded up)
///  - collateral is sent to the liquidator BEFORE repayment is collected, with an optional
///    `onMorphoLiquidate` callback in between, then repayment is pulled with transferFrom
///  - if the borrower has no collateral left, remaining debt is socialized as bad debt (writeoff)
/// Simplifications: no interest accrual, assets are tracked directly instead of shares, no flash loans.
contract MiniMorpho {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant WAD = 1e18;
    uint256 public constant ORACLE_PRICE_SCALE = 1e36;
    uint256 public constant MAX_LIQUIDATION_INCENTIVE_FACTOR = 1.15e18;
    uint256 public constant LIQUIDATION_CURSOR = 0.3e18;

    mapping(bytes32 => MarketParams) public marketParams;
    mapping(bytes32 => Market) public market;
    mapping(bytes32 => mapping(address => Position)) public position;
    mapping(address => mapping(address => bool)) public isAuthorized;

    event CreateMarket(bytes32 indexed id, MarketParams params);
    event Supply(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets);
    event Withdraw(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets);
    event SupplyCollateral(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets);
    event WithdrawCollateral(
        bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets
    );
    event Borrow(bytes32 indexed id, address caller, address indexed onBehalf, address indexed receiver, uint256 assets);
    event Repay(bytes32 indexed id, address indexed caller, address indexed onBehalf, uint256 assets);
    event Liquidate(
        bytes32 indexed id,
        address indexed caller,
        address indexed borrower,
        uint256 repaidAssets,
        uint256 seizedAssets,
        uint256 badDebtAssets
    );
    event SetAuthorization(address indexed owner, address indexed operator, bool authorized);

    error MarketExists();
    error MarketNotCreated();
    error InvalidLltv();
    error Unauthorized();
    error InsufficientCollateral();
    error InsufficientLiquidity();
    error HealthyPosition();
    error ZeroAssets();
    error TooMuchSeized();

    function idOf(MarketParams memory params) public pure returns (bytes32) {
        return keccak256(abi.encode(params));
    }

    function createMarket(MarketParams memory params) external returns (bytes32 id) {
        id = idOf(params);
        if (market[id].createdAt != 0) revert MarketExists();
        if (params.lltv == 0 || params.lltv >= WAD) revert InvalidLltv();
        marketParams[id] = params;
        market[id].createdAt = uint64(block.timestamp);
        emit CreateMarket(id, params);
    }

    function setAuthorization(address operator, bool authorized) external {
        isAuthorized[msg.sender][operator] = authorized;
        emit SetAuthorization(msg.sender, operator, authorized);
    }

    function supply(MarketParams memory params, uint256 assets, address onBehalf) external {
        bytes32 id = _live(params);
        if (assets == 0) revert ZeroAssets();
        position[id][onBehalf].supplyAssets += assets;
        market[id].totalSupplyAssets += uint128(assets);
        IERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), assets);
        emit Supply(id, msg.sender, onBehalf, assets);
    }

    function withdraw(MarketParams memory params, uint256 assets, address onBehalf, address receiver) external {
        bytes32 id = _live(params);
        _auth(onBehalf);
        position[id][onBehalf].supplyAssets -= assets;
        market[id].totalSupplyAssets -= uint128(assets);
        if (market[id].totalBorrowAssets > market[id].totalSupplyAssets) revert InsufficientLiquidity();
        IERC20(params.loanToken).safeTransfer(receiver, assets);
        emit Withdraw(id, msg.sender, onBehalf, receiver, assets);
    }

    function supplyCollateral(MarketParams memory params, uint256 assets, address onBehalf) external {
        bytes32 id = _live(params);
        if (assets == 0) revert ZeroAssets();
        position[id][onBehalf].collateral += assets;
        market[id].totalCollateral += uint128(assets);
        IERC20(params.collateralToken).safeTransferFrom(msg.sender, address(this), assets);
        emit SupplyCollateral(id, msg.sender, onBehalf, assets);
    }

    function withdrawCollateral(MarketParams memory params, uint256 assets, address onBehalf, address receiver)
        external
    {
        bytes32 id = _live(params);
        _auth(onBehalf);
        position[id][onBehalf].collateral -= assets;
        market[id].totalCollateral -= uint128(assets);
        if (!_isHealthy(params, id, onBehalf)) revert InsufficientCollateral();
        IERC20(params.collateralToken).safeTransfer(receiver, assets);
        emit WithdrawCollateral(id, msg.sender, onBehalf, receiver, assets);
    }

    function borrow(MarketParams memory params, uint256 assets, address onBehalf, address receiver) external {
        bytes32 id = _live(params);
        _auth(onBehalf);
        if (assets == 0) revert ZeroAssets();
        position[id][onBehalf].borrowAssets += assets;
        market[id].totalBorrowAssets += uint128(assets);
        if (!_isHealthy(params, id, onBehalf)) revert InsufficientCollateral();
        if (market[id].totalBorrowAssets > market[id].totalSupplyAssets) revert InsufficientLiquidity();
        IERC20(params.loanToken).safeTransfer(receiver, assets);
        emit Borrow(id, msg.sender, onBehalf, receiver, assets);
    }

    function repay(MarketParams memory params, uint256 assets, address onBehalf) external {
        bytes32 id = _live(params);
        position[id][onBehalf].borrowAssets -= assets;
        market[id].totalBorrowAssets -= uint128(assets);
        IERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), assets);
        emit Repay(id, msg.sender, onBehalf, assets);
    }

    /// @notice Morpho-Blue-style liquidation by seized collateral amount.
    function liquidate(MarketParams memory params, address borrower, uint256 seizedAssets, bytes calldata data)
        external
        returns (uint256, uint256)
    {
        bytes32 id = _live(params);
        if (seizedAssets == 0) revert ZeroAssets();
        if (_isHealthy(params, id, borrower)) revert HealthyPosition();

        Position storage p = position[id][borrower];
        if (seizedAssets > p.collateral) revert TooMuchSeized();

        uint256 collateralPrice = IOracle(params.oracle).price();
        uint256 lif = liquidationIncentiveFactor(params.lltv);
        uint256 repaidAssets = seizedAssets.mulDiv(collateralPrice, ORACLE_PRICE_SCALE, Math.Rounding.Ceil).mulDiv(
            WAD, lif, Math.Rounding.Ceil
        );
        if (repaidAssets > p.borrowAssets) repaidAssets = p.borrowAssets;

        p.borrowAssets -= repaidAssets;
        market[id].totalBorrowAssets -= uint128(repaidAssets);
        p.collateral -= seizedAssets;
        market[id].totalCollateral -= uint128(seizedAssets);

        uint256 badDebt;
        if (p.collateral == 0 && p.borrowAssets > 0) {
            badDebt = p.borrowAssets;
            p.borrowAssets = 0;
            market[id].totalBorrowAssets -= uint128(badDebt);
            market[id].totalSupplyAssets -= uint128(badDebt);
            market[id].totalBadDebt += uint128(badDebt);
        }

        emit Liquidate(id, msg.sender, borrower, repaidAssets, seizedAssets, badDebt);

        IERC20(params.collateralToken).safeTransfer(msg.sender, seizedAssets);
        if (data.length > 0) IMorphoLiquidateCallback(msg.sender).onMorphoLiquidate(repaidAssets, data);
        IERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), repaidAssets);

        return (seizedAssets, repaidAssets);
    }

    // ---------------------------------------------------------------- views

    function liquidationIncentiveFactor(uint256 lltv) public pure returns (uint256) {
        uint256 f = WAD.mulDiv(WAD, WAD - LIQUIDATION_CURSOR.mulDiv(WAD - lltv, WAD));
        return f < MAX_LIQUIDATION_INCENTIVE_FACTOR ? f : MAX_LIQUIDATION_INCENTIVE_FACTOR;
    }

    function isHealthy(MarketParams memory params, address borrower) external view returns (bool) {
        return _isHealthy(params, idOf(params), borrower);
    }

    /// @notice Maximum borrowable value (loan units) and current debt; health factor = maxBorrow / debt (WAD).
    function healthFactor(MarketParams memory params, address borrower) external view returns (uint256) {
        bytes32 id = idOf(params);
        Position memory p = position[id][borrower];
        if (p.borrowAssets == 0) return type(uint256).max;
        uint256 maxBorrow = _maxBorrow(params, p.collateral);
        return maxBorrow.mulDiv(WAD, p.borrowAssets);
    }

    function _isHealthy(MarketParams memory params, bytes32 id, address borrower) internal view returns (bool) {
        Position memory p = position[id][borrower];
        if (p.borrowAssets == 0) return true;
        return _maxBorrow(params, p.collateral) >= p.borrowAssets;
    }

    function _maxBorrow(MarketParams memory params, uint256 collateral) internal view returns (uint256) {
        return collateral.mulDiv(IOracle(params.oracle).price(), ORACLE_PRICE_SCALE).mulDiv(params.lltv, WAD);
    }

    function _live(MarketParams memory params) internal view returns (bytes32 id) {
        id = idOf(params);
        if (market[id].createdAt == 0) revert MarketNotCreated();
    }

    function _auth(address onBehalf) internal view {
        if (msg.sender != onBehalf && !isAuthorized[onBehalf][msg.sender]) revert Unauthorized();
    }
}
