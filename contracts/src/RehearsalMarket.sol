// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MockERC20} from "./MockERC20.sol";
import {
    BadParameter,
    CollateralMismatch,
    FeeOnTransfer,
    Ineligible,
    InsufficientCash,
    MaxDebtExceeded,
    PriceStale,
    PriceUnavailable,
    Unauthorized,
    Unhealthy,
    ZeroAddress,
    ZeroAmount
} from "./Errors.sol";

/// @title Nectar testnet rehearsal market
/// @notice A simplified single-market lending fixture inspired by Morpho-style liquidation.
///         It is not Morpho, not production, and has no interest index. Health changes only
///         when the rehearsal oracle updates the mock price. Positions may be opened by the
///         oracle via `openRehearsalPosition` so a demo does not depend on a live underwater loan.
contract RehearsalMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant ADAPTER_VERSION = 1;
    uint256 public constant MAX_QUOTE_LIFETIME = 120;

    MockERC20 public immutable debtToken;
    MockERC20 public immutable collateralToken;
    address public immutable oracle;
    uint256 public immutable lltvBps;
    uint256 public immutable bonusBps;
    uint256 public immutable maxPriceAge;
    bytes32 public immutable marketKey;
    bytes32 public immutable policyHash;
    string public label;

    uint256 public price;
    uint64 public priceUpdatedAt;
    uint256 public totalSupplyAssets;
    uint256 public totalBorrowAssets;

    struct Position {
        uint256 collateral;
        uint256 borrowAssets;
    }

    mapping(address => Position) public positions;
    mapping(address => uint256) public supplyOf;
    mapping(address => bool) private seen;
    address[] public borrowerList;

    event Supplied(address indexed supplier, uint256 amount);
    event RehearsalPositionOpened(address indexed borrower, uint256 collateral, uint256 debt);
    event PriceUpdated(uint256 price, uint64 updatedAt);
    event Liquidated(
        address indexed borrower,
        address indexed liquidator,
        uint256 repayAssets,
        uint256 seizeAssets,
        uint256 price
    );

    constructor(
        address debtToken_,
        address collateralToken_,
        address oracle_,
        uint256 lltvBps_,
        uint256 bonusBps_,
        uint256 initialPrice_,
        uint256 maxPriceAge_,
        string memory label_
    ) {
        if (debtToken_ == address(0) || collateralToken_ == address(0) || oracle_ == address(0)) revert ZeroAddress();
        if (lltvBps_ == 0 || lltvBps_ >= 10_000) revert ZeroAmount();
        if (bonusBps_ > 2_000) revert ZeroAmount();
        if (initialPrice_ == 0 || maxPriceAge_ == 0) revert ZeroAmount();
        debtToken = MockERC20(debtToken_);
        collateralToken = MockERC20(collateralToken_);
        oracle = oracle_;
        lltvBps = lltvBps_;
        bonusBps = bonusBps_;
        maxPriceAge = maxPriceAge_;
        label = label_;
        price = initialPrice_;
        priceUpdatedAt = uint64(block.timestamp);
        marketKey = keccak256(abi.encode(block.chainid, address(this), keccak256("nectar-rehearsal-v1")));
        policyHash = keccak256(
            abi.encode(
                ADAPTER_VERSION,
                lltvBps_,
                bonusBps_,
                maxPriceAge_,
                MAX_QUOTE_LIFETIME,
                debtToken_,
                collateralToken_
            )
        );
        emit PriceUpdated(initialPrice_, priceUpdatedAt);
    }

    function priceStatus() public view returns (uint8) {
        if (price == 0 || priceUpdatedAt == 0) return 1;
        if (block.timestamp > uint256(priceUpdatedAt) + maxPriceAge) return 2;
        return 0;
    }

    function setPrice(uint256 newPrice) external {
        if (msg.sender != oracle) revert Unauthorized();
        if (newPrice == 0) revert PriceUnavailable();
        price = newPrice;
        priceUpdatedAt = uint64(block.timestamp);
        emit PriceUpdated(newPrice, priceUpdatedAt);
    }

    /// @notice Rehearsal-only switch so unavailable and stale prices are distinct states.
    function markPriceUnavailable() external {
        if (msg.sender != oracle) revert Unauthorized();
        price = 0;
        priceUpdatedAt = 0;
        emit PriceUpdated(0, 0);
    }

    function collateralValueOf(address borrower) public view returns (uint256) {
        return positions[borrower].collateral * price / 1e18;
    }

    function maxBorrow(address borrower) public view returns (uint256) {
        return collateralValueOf(borrower) * lltvBps / 10_000;
    }

    function debtOf(address borrower) external view returns (uint256) {
        return positions[borrower].borrowAssets;
    }

    function collateralOf(address borrower) external view returns (uint256) {
        return positions[borrower].collateral;
    }

    function isLiquidatable(address borrower) public view returns (bool) {
        if (priceStatus() != 0) return false;
        uint256 owed = positions[borrower].borrowAssets;
        if (owed == 0) return false;
        return owed > maxBorrow(borrower);
    }

    /// @notice Collateral base units seized for a full bonus on `repayAssets` at the current price.
    function seizureFor(uint256 repayAssets) public view returns (uint256) {
        if (price == 0) revert PriceUnavailable();
        uint256 seizeValue = repayAssets * (10_000 + bonusBps) / 10_000;
        return seizeValue * 1e18 / price;
    }

    function borrowerCount() external view returns (uint256) {
        return borrowerList.length;
    }

    function supply(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _pull(debtToken, msg.sender, amount);
        supplyOf[msg.sender] += amount;
        totalSupplyAssets += amount;
        emit Supplied(msg.sender, amount);
    }

    function supplyCollateral(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        _pull(collateralToken, msg.sender, amount);
        _touch(msg.sender);
        positions[msg.sender].collateral += amount;
    }

    function borrow(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (debtToken.balanceOf(address(this)) < amount) revert InsufficientCash();
        _touch(msg.sender);
        Position storage p = positions[msg.sender];
        p.borrowAssets += amount;
        totalBorrowAssets += amount;
        if (priceStatus() != 0 || p.borrowAssets > maxBorrow(msg.sender)) revert Unhealthy();
        IERC20(address(debtToken)).safeTransfer(msg.sender, amount);
    }

    /// @notice Oracle-funded fixture. Collateral and debt liquidity come from the oracle's balances
    ///         and the market's supplied cash. The borrower does not sign because this is not a
    ///         production lending market.
    function openRehearsalPosition(address borrower, uint256 collateralAmount, uint256 borrowAmount)
        external
        nonReentrant
    {
        if (msg.sender != oracle) revert Unauthorized();
        if (borrower == address(0)) revert ZeroAddress();
        if (collateralAmount == 0 || borrowAmount == 0) revert ZeroAmount();
        if (positions[borrower].borrowAssets != 0 || positions[borrower].collateral != 0) revert BadParameter();
        if (debtToken.balanceOf(address(this)) < borrowAmount) revert InsufficientCash();
        _pull(collateralToken, msg.sender, collateralAmount);
        _touch(borrower);
        Position storage p = positions[borrower];
        p.collateral = collateralAmount;
        p.borrowAssets = borrowAmount;
        totalBorrowAssets += borrowAmount;
        if (priceStatus() != 0 || p.borrowAssets > maxBorrow(borrower)) revert Unhealthy();
        IERC20(address(debtToken)).safeTransfer(borrower, borrowAmount);
        emit RehearsalPositionOpened(borrower, collateralAmount, borrowAmount);
    }

    function liquidate(address borrower, uint256 repayAssets, uint256 seizeAssets)
        external
        nonReentrant
        returns (uint256)
    {
        uint8 ps = priceStatus();
        if (ps == 1) revert PriceUnavailable();
        if (ps == 2) revert PriceStale();
        if (repayAssets == 0 || seizeAssets == 0) revert ZeroAmount();
        Position storage p = positions[borrower];
        if (p.borrowAssets == 0 || p.borrowAssets <= maxBorrow(borrower)) revert Ineligible();
        if (repayAssets > p.borrowAssets) revert MaxDebtExceeded();
        uint256 expected = seizureFor(repayAssets);
        if (seizeAssets != expected || p.collateral < seizeAssets) revert CollateralMismatch();

        p.borrowAssets -= repayAssets;
        p.collateral -= seizeAssets;
        totalBorrowAssets -= repayAssets;

        uint256 beforeDebt = debtToken.balanceOf(address(this));
        IERC20(address(debtToken)).safeTransferFrom(msg.sender, address(this), repayAssets);
        if (debtToken.balanceOf(address(this)) - beforeDebt != repayAssets) revert FeeOnTransfer();
        IERC20(address(collateralToken)).safeTransfer(msg.sender, seizeAssets);

        emit Liquidated(borrower, msg.sender, repayAssets, seizeAssets, price);
        return seizeAssets;
    }

    function _touch(address borrower) internal {
        if (!seen[borrower]) {
            seen[borrower] = true;
            borrowerList.push(borrower);
        }
    }

    function _pull(MockERC20 token, address from, uint256 amount) internal {
        uint256 beforeBal = token.balanceOf(address(this));
        IERC20(address(token)).safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - beforeBal != amount) revert FeeOnTransfer();
    }
}
