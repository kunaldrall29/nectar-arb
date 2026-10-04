// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IPause} from "./IPause.sol";
import {
    AlreadySet,
    Expired,
    FeeOnTransfer,
    InsufficientCash,
    NotActive,
    NotExpired,
    ReservedFunds,
    Unauthorized,
    ZeroAddress,
    ZeroAmount
} from "./Errors.sol";

/// @notice Per-maker, per-token cash. Only the quote registry can reserve, release, or consume.
///         Consumption sends the reserved cash to the wired executor. Unreserved withdrawals
///         stay available while reservations or executions are paused.
contract NectarEscrow is ReentrancyGuard, Ownable2Step {
    using SafeERC20 for IERC20;

    struct Account {
        uint256 cash;
        uint256 reserved;
    }

    struct Reservation {
        address maker;
        address token;
        uint256 amount;
        uint64 validUntil;
        bool consumed;
        bool released;
    }

    IPause public immutable pause;
    address public quoteRegistry;
    address public executor;
    bool public wired;

    mapping(address maker => mapping(address token => Account)) public accounts;
    mapping(address token => uint256) public liabilities;
    mapping(uint256 id => Reservation) public reservations;

    event CashDeposited(address indexed maker, address indexed token, uint256 amount, address payer);
    event CashWithdrawn(address indexed maker, address indexed token, uint256 amount, address recipient);
    event CashReserved(uint256 indexed reservationId, address indexed maker, address indexed token, uint256 amount, uint64 validUntil);
    event CashReleased(uint256 indexed reservationId, address indexed maker, address indexed token, uint256 amount);
    event CashConsumed(uint256 indexed reservationId, address indexed maker, address indexed token, uint256 amount);

    constructor(address pause_) Ownable(msg.sender) {
        if (pause_ == address(0)) revert ZeroAddress();
        pause = IPause(pause_);
    }

    function wire(address quoteRegistry_, address executor_) external onlyOwner {
        if (wired) revert AlreadySet();
        if (quoteRegistry_ == address(0) || executor_ == address(0)) revert ZeroAddress();
        quoteRegistry = quoteRegistry_;
        executor = executor_;
        wired = true;
        renounceOwnership();
    }

    function accountOf(address maker, address token) external view returns (uint256 cash, uint256 reserved) {
        Account storage a = accounts[maker][token];
        return (a.cash, a.reserved);
    }

    function availableOf(address maker, address token) external view returns (uint256) {
        Account storage a = accounts[maker][token];
        return a.cash - a.reserved;
    }

    function deposit(address token, uint256 amount, address beneficiary) external nonReentrant {
        if (token == address(0) || beneficiary == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - beforeBal;
        if (received != amount) revert FeeOnTransfer();
        accounts[beneficiary][token].cash += received;
        liabilities[token] += received;
        emit CashDeposited(beneficiary, token, received, msg.sender);
    }

    function withdraw(address token, uint256 amount, address recipient) external nonReentrant {
        if (token == address(0) || recipient == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        Account storage a = accounts[msg.sender][token];
        uint256 available = a.cash - a.reserved;
        if (amount > available) {
            if (a.reserved > 0 && amount <= a.cash) revert ReservedFunds();
            revert InsufficientCash();
        }
        a.cash -= amount;
        liabilities[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        emit CashWithdrawn(msg.sender, token, amount, recipient);
    }

    function reserve(uint256 id, address maker, address token, uint256 amount, uint64 validUntil) external nonReentrant {
        if (msg.sender != quoteRegistry) revert Unauthorized();
        if (!wired) revert Unauthorized();
        if (maker == address(0) || token == address(0)) revert ZeroAddress();
        if (amount == 0 || id == 0) revert ZeroAmount();
        if (reservations[id].maker != address(0)) revert AlreadySet();
        Account storage a = accounts[maker][token];
        if (a.cash < a.reserved + amount) revert InsufficientCash();
        a.reserved += amount;
        reservations[id] = Reservation({
            maker: maker,
            token: token,
            amount: amount,
            validUntil: validUntil,
            consumed: false,
            released: false
        });
        emit CashReserved(id, maker, token, amount, validUntil);
    }

    function release(uint256 id) external nonReentrant {
        if (msg.sender != quoteRegistry) revert Unauthorized();
        Reservation storage r = reservations[id];
        if (r.maker == address(0) || r.consumed || r.released) revert NotActive();
        if (block.timestamp < r.validUntil) revert NotExpired();
        r.released = true;
        Account storage a = accounts[r.maker][r.token];
        a.reserved -= r.amount;
        emit CashReleased(id, r.maker, r.token, r.amount);
    }

    function consume(uint256 id, address to) external nonReentrant {
        if (msg.sender != quoteRegistry) revert Unauthorized();
        if (to != executor) revert Unauthorized();
        Reservation storage r = reservations[id];
        if (r.maker == address(0) || r.consumed || r.released) revert NotActive();
        if (block.timestamp >= r.validUntil) revert Expired();
        r.consumed = true;
        Account storage a = accounts[r.maker][r.token];
        a.reserved -= r.amount;
        a.cash -= r.amount;
        liabilities[r.token] -= r.amount;
        IERC20(r.token).safeTransfer(to, r.amount);
        emit CashConsumed(id, r.maker, r.token, r.amount);
    }
}
