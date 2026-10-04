// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IPause} from "./IPause.sol";
import {MockERC20} from "./MockERC20.sol";
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
contract NectarEscrow {
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
    address public owner;
    bool public wired;

    mapping(address maker => mapping(address token => Account)) public accounts;
    mapping(address token => uint256) public liabilities;
    mapping(uint256 id => Reservation) public reservations;
    uint256 private locked;

    event CashDeposited(address indexed maker, address indexed token, uint256 amount, address payer);
    event CashWithdrawn(address indexed maker, address indexed token, uint256 amount, address recipient);
    event CashReserved(uint256 indexed reservationId, address indexed maker, address indexed token, uint256 amount, uint64 validUntil);
    event CashReleased(uint256 indexed reservationId, address indexed maker, address indexed token, uint256 amount);
    event CashConsumed(uint256 indexed reservationId, address indexed maker, address indexed token, uint256 amount);

    modifier nonReentrant() {
        if (locked != 0) revert Unauthorized();
        locked = 1;
        _;
        locked = 0;
    }

    constructor(address pause_) {
        if (pause_ == address(0)) revert ZeroAddress();
        pause = IPause(pause_);
        owner = msg.sender;
    }

    function wire(address quoteRegistry_, address executor_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (wired) revert AlreadySet();
        if (quoteRegistry_ == address(0) || executor_ == address(0)) revert ZeroAddress();
        quoteRegistry = quoteRegistry_;
        executor = executor_;
        wired = true;
        owner = address(0);
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
        uint256 beforeBal = MockERC20(token).balanceOf(address(this));
        if (!MockERC20(token).transferFrom(msg.sender, address(this), amount)) revert FeeOnTransfer();
        uint256 received = MockERC20(token).balanceOf(address(this)) - beforeBal;
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
        if (!MockERC20(token).transfer(recipient, amount)) revert InsufficientCash();
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
        if (!MockERC20(r.token).transfer(to, r.amount)) revert InsufficientCash();
        emit CashConsumed(id, r.maker, r.token, r.amount);
    }
}
