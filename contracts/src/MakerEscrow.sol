// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title MakerEscrow
/// @notice Segregated maker cash accounts keyed by (maker, token) on this chain (LQ01).
///         Only the bound QuoteRegistry can reserve, release or consume cash; nobody else can move
///         a maker's funds. There is no admin withdrawal path (SEC07).
contract MakerEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable deployer;
    address public quoteRegistry;

    mapping(address => mapping(address => uint256)) public cash;
    mapping(address => mapping(address => uint256)) public reserved;
    mapping(address => uint256) public totalLiabilities;

    event CashDeposited(address indexed maker, address indexed token, uint256 amount, address indexed from);
    event CashWithdrawn(address indexed maker, address indexed token, uint256 amount, address indexed recipient);
    event CashReserved(address indexed maker, address indexed token, uint256 amount, bytes32 indexed quoteId);
    event CashReleased(address indexed maker, address indexed token, uint256 amount, bytes32 indexed quoteId);
    event CashConsumed(
        address indexed maker, address indexed token, uint256 amount, bytes32 indexed quoteId, address to
    );

    error NotQuoteRegistry();
    error AlreadyBound();
    error ZeroAmount();
    error UnexpectedReceivedAmount(uint256 expected, uint256 received);
    error ReservedFunds(uint256 available, uint256 requested);
    error InsufficientAvailableCash(uint256 available, uint256 requested);

    constructor() {
        deployer = msg.sender;
    }

    modifier onlyRegistry() {
        if (msg.sender != quoteRegistry) revert NotQuoteRegistry();
        _;
    }

    /// @notice One-time binding to the QuoteRegistry; cannot be changed afterwards.
    function bindRegistry(address registry) external {
        if (msg.sender != deployer || quoteRegistry != address(0)) revert AlreadyBound();
        quoteRegistry = registry;
    }

    function available(address maker, address token) public view returns (uint256) {
        return cash[maker][token] - reserved[maker][token];
    }

    function deposit(address token, uint256 amount, address beneficiary) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - beforeBal;
        if (received != amount) revert UnexpectedReceivedAmount(amount, received);
        cash[beneficiary][token] += amount;
        totalLiabilities[token] += amount;
        emit CashDeposited(beneficiary, token, amount, msg.sender);
    }

    /// @notice Withdraw unreserved cash. Remains available during a Nectar pause (PRD section 16).
    function withdraw(address token, uint256 amount, address recipient) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 avail = available(msg.sender, token);
        if (amount > avail) revert ReservedFunds(avail, amount);
        cash[msg.sender][token] -= amount;
        totalLiabilities[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        emit CashWithdrawn(msg.sender, token, amount, recipient);
    }

    function reserve(address maker, address token, uint256 amount, bytes32 quoteId) external onlyRegistry {
        uint256 avail = available(maker, token);
        if (amount > avail) revert InsufficientAvailableCash(avail, amount);
        reserved[maker][token] += amount;
        emit CashReserved(maker, token, amount, quoteId);
    }

    function release(address maker, address token, uint256 amount, bytes32 quoteId) external onlyRegistry {
        reserved[maker][token] -= amount;
        emit CashReleased(maker, token, amount, quoteId);
    }

    function consume(address maker, address token, uint256 amount, bytes32 quoteId, address to)
        external
        onlyRegistry
        nonReentrant
    {
        reserved[maker][token] -= amount;
        cash[maker][token] -= amount;
        totalLiabilities[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit CashConsumed(maker, token, amount, quoteId, to);
    }
}
