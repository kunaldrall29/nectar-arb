// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IMorphoLiquidateCallback, IOracle, MarketParams} from "../interfaces/IMorpho.sol";

/// @title Nectar Sandbox Morpho
/// @notice Pinned liquidation callback order from upstream Morpho Blue `liquidate`:
///         transfer collateral to the liquidator, then `onMorphoLiquidate(repaidAssets, data)` when
///         `data` is non-empty, then pull loan tokens. That order is what lets a liquidator sell
///         collateral inside the callback without a flash loan.
///         This contract is not an official Morpho deployment. Share price is 1:1 (no interest index,
///         no virtual shares) so a lab can demand an exact repay. `officialMorphoDeployment()` is false.
contract NectarSandboxMorpho is Ownable {
    using SafeERC20 for IERC20;

    uint256 public constant ORACLE_PRICE_SCALE = 1e36;
    uint256 public constant WAD = 1e18;
    uint256 public constant LIQUIDATION_CURSOR = 0.3e18;
    uint256 public constant MAX_LIQUIDATION_INCENTIVE_FACTOR = 1.15e18;
    string public constant LABEL = "Nectar Sandbox Morpho";

    struct Position {
        uint128 collateral;
        uint128 borrowAssets;
    }

    struct Market {
        uint128 totalSupplyAssets;
        uint128 totalBorrowAssets;
        uint128 lastUpdate;
    }

    mapping(address => bool) public isIrmEnabled;
    mapping(uint256 => bool) public isLltvEnabled;
    mapping(bytes32 => Market) public market;
    mapping(bytes32 => MarketParams) public idToMarketParams;
    mapping(bytes32 => mapping(address => Position)) public position;

    event CreateMarket(bytes32 indexed id);
    event SandboxPositionOpened(bytes32 indexed id, address indexed borrower, uint256 collateral, uint256 borrowAssets);
    event Liquidate(
        bytes32 indexed id, address indexed liquidator, address indexed borrower, uint256 repaidAssets, uint256 seizedAssets
    );

    constructor(address owner_) Ownable(owner_) {}

    function officialMorphoDeployment() external pure returns (bool) {
        return false;
    }

    function enableIrm(address irm) external onlyOwner {
        isIrmEnabled[irm] = true;
    }

    function enableLltv(uint256 lltv) external onlyOwner {
        require(lltv < WAD && lltv != 0, "LLTV");
        isLltvEnabled[lltv] = true;
    }

    function idOf(MarketParams memory marketParams) public pure returns (bytes32) {
        return keccak256(abi.encode(marketParams));
    }

    function createMarket(MarketParams memory marketParams) external {
        require(isIrmEnabled[marketParams.irm], "IRM");
        require(isLltvEnabled[marketParams.lltv], "LLTV");
        bytes32 id = idOf(marketParams);
        require(market[id].lastUpdate == 0, "EXISTS");
        market[id].lastUpdate = uint128(block.timestamp);
        idToMarketParams[id] = marketParams;
        emit CreateMarket(id);
    }

    function supply(MarketParams memory marketParams, uint256 assets) external {
        bytes32 id = idOf(marketParams);
        require(market[id].lastUpdate != 0, "MARKET");
        IERC20(marketParams.loanToken).safeTransferFrom(msg.sender, address(this), assets);
        market[id].totalSupplyAssets += uint128(assets);
    }

    function supplyCollateral(MarketParams memory marketParams, uint256 assets, address onBehalf) external {
        bytes32 id = idOf(marketParams);
        require(market[id].lastUpdate != 0, "MARKET");
        require(onBehalf != address(0) && assets != 0, "ARGS");
        position[id][onBehalf].collateral += uint128(assets);
        IERC20(marketParams.collateralToken).safeTransferFrom(msg.sender, address(this), assets);
    }

    function borrow(MarketParams memory marketParams, uint256 assets, address onBehalf, address receiver) external {
        bytes32 id = idOf(marketParams);
        require(msg.sender == onBehalf && receiver != address(0) && assets != 0, "ARGS");
        position[id][onBehalf].borrowAssets += uint128(assets);
        market[id].totalBorrowAssets += uint128(assets);
        require(market[id].totalBorrowAssets <= market[id].totalSupplyAssets, "LIQUIDITY");
        uint256 price = IOracle(marketParams.oracle).price();
        require(_healthy(position[id][onBehalf].collateral, position[id][onBehalf].borrowAssets, price, marketParams.lltv), "HEALTH");
        IERC20(marketParams.loanToken).safeTransfer(receiver, assets);
    }

    /// @notice Lab helper. Opens debt without sending loan tokens to the borrower. Not a Morpho function.
    function openSandboxPosition(MarketParams memory marketParams, address borrower, uint256 collateralAssets, uint256 borrowAssets)
        external
        onlyOwner
    {
        bytes32 id = idOf(marketParams);
        require(market[id].lastUpdate != 0, "MARKET");
        require(borrower != address(0) && collateralAssets != 0 && borrowAssets != 0, "ARGS");
        IERC20(marketParams.collateralToken).safeTransferFrom(msg.sender, address(this), collateralAssets);
        position[id][borrower].collateral += uint128(collateralAssets);
        position[id][borrower].borrowAssets += uint128(borrowAssets);
        market[id].totalBorrowAssets += uint128(borrowAssets);
        require(market[id].totalBorrowAssets <= market[id].totalSupplyAssets, "LIQUIDITY");
        emit SandboxPositionOpened(id, borrower, collateralAssets, borrowAssets);
    }

    function previewLiquidate(MarketParams memory marketParams, address borrower, uint256 repaidShares)
        external
        view
        returns (uint256 seizedAssets, uint256 repaidAssets, bool unhealthy)
    {
        bytes32 id = idOf(marketParams);
        uint256 price = IOracle(marketParams.oracle).price();
        Position memory pos = position[id][borrower];
        unhealthy = !_healthy(pos.collateral, pos.borrowAssets, price, marketParams.lltv);
        (seizedAssets, repaidAssets) = _amounts(marketParams, price, 0, repaidShares);
    }

    function liquidate(
        MarketParams memory marketParams,
        address borrower,
        uint256 seizedAssets,
        uint256 repaidShares,
        bytes calldata data
    ) external returns (uint256, uint256) {
        bytes32 id = idOf(marketParams);
        require(market[id].lastUpdate != 0, "MARKET_NOT_CREATED");
        require((seizedAssets > 0 && repaidShares == 0) || (seizedAssets == 0 && repaidShares > 0), "INCONSISTENT_INPUT");
        uint256 price = IOracle(marketParams.oracle).price();
        require(price != 0, "ZERO_PRICE");
        Position memory pos = position[id][borrower];
        require(!_healthy(pos.collateral, pos.borrowAssets, price, marketParams.lltv), "HEALTHY_POSITION");

        uint256 repaidAssets;
        (seizedAssets, repaidAssets) = _amounts(marketParams, price, seizedAssets, repaidShares);
        require(repaidAssets != 0 && seizedAssets != 0, "ZERO");
        require(pos.borrowAssets >= repaidAssets && pos.collateral >= seizedAssets, "POSITION");

        position[id][borrower].borrowAssets = uint128(pos.borrowAssets - repaidAssets);
        position[id][borrower].collateral = uint128(pos.collateral - seizedAssets);
        market[id].totalBorrowAssets = uint128(uint256(market[id].totalBorrowAssets) - repaidAssets);

        emit Liquidate(id, msg.sender, borrower, repaidAssets, seizedAssets);

        IERC20(marketParams.collateralToken).safeTransfer(msg.sender, seizedAssets);
        if (data.length > 0) IMorphoLiquidateCallback(msg.sender).onMorphoLiquidate(repaidAssets, data);
        IERC20(marketParams.loanToken).safeTransferFrom(msg.sender, address(this), repaidAssets);
        return (seizedAssets, repaidAssets);
    }

    function _amounts(MarketParams memory marketParams, uint256 price, uint256 seizedAssets, uint256 repaidShares)
        internal
        pure
        returns (uint256 seized, uint256 repaid)
    {
        uint256 incentive = _incentive(marketParams.lltv);
        if (seizedAssets > 0) {
            uint256 quoted = Math.mulDiv(seizedAssets, price, ORACLE_PRICE_SCALE, Math.Rounding.Ceil);
            repaid = Math.mulDiv(quoted, WAD, incentive, Math.Rounding.Ceil);
            seized = seizedAssets;
        } else {
            repaid = repaidShares;
            uint256 incentiveAssets = Math.mulDiv(repaid, incentive, WAD);
            seized = Math.mulDiv(incentiveAssets, ORACLE_PRICE_SCALE, price);
        }
    }

    function _incentive(uint256 lltv) internal pure returns (uint256) {
        uint256 cursorLoss = Math.mulDiv(LIQUIDATION_CURSOR, WAD - lltv, WAD);
        uint256 factor = Math.mulDiv(WAD, WAD, WAD - cursorLoss);
        if (factor > MAX_LIQUIDATION_INCENTIVE_FACTOR) return MAX_LIQUIDATION_INCENTIVE_FACTOR;
        return factor;
    }

    function _healthy(uint256 collateral, uint256 borrowAssets, uint256 price, uint256 lltv) internal pure returns (bool) {
        if (borrowAssets == 0) return true;
        uint256 value = Math.mulDiv(collateral, price, ORACLE_PRICE_SCALE);
        return Math.mulDiv(value, lltv, WAD) >= borrowAssets;
    }
}
