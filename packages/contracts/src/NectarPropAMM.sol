// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BadParameter, FeeOnTransfer, InsufficientCash, NoBid, Unauthorized, ZeroAddress, ZeroAmount} from "./Errors.sol";
import {INectarExecutor} from "./interfaces/INectar.sol";
import {BidMath} from "./libraries/BidMath.sol";
import {RiskGuard} from "./RiskGuard.sol";

/// @notice Maker-owned collateral inventory. There is no public LP token.
///         `previewBid` is indicative. `buyCollateral` runs only for the authenticated executor job.
///         The pricing updater can change haircut parameters and cannot withdraw.
contract NectarPropAMM is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable maker;
    address public immutable executor;
    address public immutable buyer;
    IERC20 public immutable debt;
    IERC20 public immutable collateral;
    RiskGuard public immutable risk;
    address public immutable oracle;
    bytes32 public immutable policyId;
    address public pricingUpdater;

    uint256 public baseSpreadBps;
    uint256 public volatilityBufferBps;
    uint256 public sessionBufferBps;
    uint256 public maxSkewBps;
    uint256 public inventoryCap;
    uint256 public collateralInventory;
    uint256 public debtBalance;

    event BidParams(uint256 baseSpreadBps, uint256 volatilityBufferBps, uint256 sessionBufferBps, uint256 maxSkewBps);
    event DebtDeposited(address indexed from, uint256 amount);
    event CollateralBought(address indexed buyer, uint256 collateralAmount, uint256 debtOut, uint256 haircutBps);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);

    constructor(
        address maker_,
        address executor_,
        address buyer_,
        address debt_,
        address collateral_,
        address risk_,
        address oracle_,
        bytes32 policyId_,
        address pricingUpdater_,
        uint256 baseSpreadBps_,
        uint256 volatilityBufferBps_,
        uint256 sessionBufferBps_,
        uint256 maxSkewBps_,
        uint256 inventoryCap_
    ) {
        if (
            maker_ == address(0) || executor_ == address(0) || buyer_ == address(0) || debt_ == address(0)
                || collateral_ == address(0) || risk_ == address(0) || oracle_ == address(0) || pricingUpdater_ == address(0)
        ) revert ZeroAddress();
        if (inventoryCap_ == 0 || policyId_ == bytes32(0)) revert BadParameter();
        maker = maker_;
        executor = executor_;
        buyer = buyer_;
        debt = IERC20(debt_);
        collateral = IERC20(collateral_);
        risk = RiskGuard(risk_);
        oracle = oracle_;
        policyId = policyId_;
        pricingUpdater = pricingUpdater_;
        baseSpreadBps = baseSpreadBps_;
        volatilityBufferBps = volatilityBufferBps_;
        sessionBufferBps = sessionBufferBps_;
        maxSkewBps = maxSkewBps_;
        inventoryCap = inventoryCap_;
    }

    function setPricing(uint256 base_, uint256 vol_, uint256 session_, uint256 skew_, uint256 cap_) external {
        if (msg.sender != pricingUpdater && msg.sender != maker) revert Unauthorized();
        if (cap_ == 0) revert BadParameter();
        baseSpreadBps = base_;
        volatilityBufferBps = vol_;
        sessionBufferBps = session_;
        maxSkewBps = skew_;
        inventoryCap = cap_;
        emit BidParams(base_, vol_, session_, skew_);
    }

    function depositDebt(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBal = debt.balanceOf(address(this));
        debt.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = debt.balanceOf(address(this)) - beforeBal;
        if (received != amount) revert FeeOnTransfer();
        debtBalance += received;
        emit DebtDeposited(msg.sender, received);
    }

    function previewBid(uint256 collateralAmount) public view returns (uint256 debtOut, bool ok) {
        (bool fresh, uint256 price) = risk.tryVerify(policyId, oracle);
        if (!fresh) return (0, false);
        (debtOut,, ok) = BidMath.quote(
            collateralAmount,
            price,
            collateralInventory + collateralAmount,
            inventoryCap,
            baseSpreadBps,
            volatilityBufferBps,
            sessionBufferBps,
            maxSkewBps
        );
        if (!ok || debtOut > debtBalance) return (0, false);
    }

    function buyCollateral(uint256 collateralAmount, uint256 minDebtOut) external nonReentrant returns (uint256 debtOut) {
        if (msg.sender != buyer) revert Unauthorized();
        if (!INectarExecutor(executor).jobActive()) revert Unauthorized();
        INectarExecutor.JobView memory job = INectarExecutor(executor).activeJob();
        if (job.route != 2 || job.pool != address(this)) revert Unauthorized();
        uint256 haircut;
        bool ok;
        (bool fresh, uint256 price) = risk.tryVerify(policyId, oracle);
        if (!fresh) revert NoBid();
        (debtOut, haircut, ok) = BidMath.quote(
            collateralAmount,
            price,
            collateralInventory + collateralAmount,
            inventoryCap,
            baseSpreadBps,
            volatilityBufferBps,
            sessionBufferBps,
            maxSkewBps
        );
        if (!ok || debtOut < minDebtOut || debtOut > debtBalance) revert NoBid();
        uint256 beforeCol = collateral.balanceOf(address(this));
        collateral.safeTransferFrom(msg.sender, address(this), collateralAmount);
        if (collateral.balanceOf(address(this)) - beforeCol != collateralAmount) revert FeeOnTransfer();
        collateralInventory += collateralAmount;
        debtBalance -= debtOut;
        debt.safeTransfer(msg.sender, debtOut);
        emit CollateralBought(msg.sender, collateralAmount, debtOut, haircut);
    }

    function withdrawDebt(address to, uint256 amount) external nonReentrant {
        if (msg.sender != maker) revert Unauthorized();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > debtBalance) revert InsufficientCash();
        debtBalance -= amount;
        debt.safeTransfer(to, amount);
        emit Withdrawn(address(debt), to, amount);
    }

    function withdrawCollateral(address to, uint256 amount) external nonReentrant {
        if (msg.sender != maker) revert Unauthorized();
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0 || amount > collateralInventory) revert InsufficientCash();
        collateralInventory -= amount;
        collateral.safeTransfer(to, amount);
        emit Withdrawn(address(collateral), to, amount);
    }
}
