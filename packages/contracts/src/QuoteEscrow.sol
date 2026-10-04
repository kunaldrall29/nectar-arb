// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {FundedQuote, QuoteTypes} from "./libraries/QuoteTypes.sol";

/// @title QuoteEscrow — maker cash accounts and funded reservations (LQ01–LQ08).
contract QuoteEscrow is EIP712, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    string private constant NAME = "NectarQuoteEscrow";
    string private constant VERSION = "1";

    struct Reservation {
        address maker;
        address token;
        uint256 amount;
        uint256 validUntil;
        bool consumed;
        bool released;
    }

    mapping(address => mapping(address => uint256)) public balances;
    mapping(address => mapping(address => uint256)) public reserved;
    mapping(bytes32 => Reservation) public reservations;
    mapping(address => uint256) public makerNonces;

    address public executor;

    event CashDeposited(address indexed maker, address indexed token, uint256 amount, address indexed from);
    event CashWithdrawn(address indexed maker, address indexed token, uint256 amount, address indexed to);
    event QuoteReserved(bytes32 indexed reservationId, address indexed maker, address indexed token, uint256 amount, uint256 validUntil);
    event QuoteConsumed(bytes32 indexed reservationId, address indexed maker, uint256 amount);
    event QuoteReleased(bytes32 indexed reservationId, address indexed maker, uint256 amount);
    event ScopePaused(bytes32 indexed scope, bool paused);

    mapping(bytes32 => bool) public reservationsPaused;

    error InsufficientAvailable();
    error ReservationExists();
    error InvalidSignature();
    error QuoteExpired();
    error NotExpired();
    error AlreadyConsumed();
    error AlreadyReleased();
    error UnauthorizedConsumer();
    error DomainMismatch();

    constructor() EIP712(NAME, VERSION) Ownable(msg.sender) {}

    function setExecutor(address executor_) external onlyOwner {
        executor = executor_;
    }

    function pauseReservations(bytes32 scope, bool paused) external onlyOwner {
        reservationsPaused[scope] = paused;
        emit ScopePaused(scope, paused);
    }

    function available(address maker, address token) public view returns (uint256) {
        uint256 bal = balances[maker][token];
        uint256 res = reserved[maker][token];
        return bal > res ? bal - res : 0;
    }

    function deposit(address token, uint256 amount, address beneficiary) external nonReentrant {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[beneficiary][token] += amount;
        emit CashDeposited(beneficiary, token, amount, msg.sender);
    }

    function withdraw(address token, uint256 amount, address recipient) external nonReentrant {
        uint256 avail = available(msg.sender, token);
        if (amount > avail) revert InsufficientAvailable();
        balances[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        emit CashWithdrawn(msg.sender, token, amount, recipient);
    }

    function registerQuote(FundedQuote calldata quote, bytes calldata signature) external nonReentrant returns (bytes32) {
        if (quote.chainId != block.chainid) revert DomainMismatch();
        if (quote.verifyingContract != address(this)) revert DomainMismatch();
        if (block.timestamp >= quote.validUntil) revert QuoteExpired();
        if (reservations[quote.reservationId].amount != 0) revert ReservationExists();
        if (reservationsPaused[quote.marketKey]) revert("SCOPE_PAUSED");

        bytes32 digest = _hashTypedDataV4(QuoteTypes.hash(quote));
        address signer = ECDSA.recover(digest, signature);
        if (signer != quote.maker) revert InvalidSignature();

        uint256 avail = available(quote.maker, quote.debtToken);
        if (quote.cashOut > avail) revert InsufficientAvailable();

        reserved[quote.maker][quote.debtToken] += quote.cashOut;
        reservations[quote.reservationId] = Reservation({
            maker: quote.maker,
            token: quote.debtToken,
            amount: quote.cashOut,
            validUntil: quote.validUntil,
            consumed: false,
            released: false
        });

        emit QuoteReserved(quote.reservationId, quote.maker, quote.debtToken, quote.cashOut, quote.validUntil);
        return quote.reservationId;
    }

    function consumeReservation(bytes32 reservationId, address recipient) external nonReentrant {
        if (msg.sender != executor) revert UnauthorizedConsumer();
        Reservation storage r = reservations[reservationId];
        if (r.amount == 0) revert("unknown reservation");
        if (r.consumed) revert AlreadyConsumed();
        if (block.timestamp >= r.validUntil) revert QuoteExpired();

        uint256 amount = r.amount;
        r.consumed = true;
        reserved[r.maker][r.token] -= amount;
        balances[r.maker][r.token] -= amount;
        IERC20(r.token).safeTransfer(recipient, amount);
        emit QuoteConsumed(reservationId, r.maker, amount);
    }

    function releaseExpired(bytes32 reservationId) external nonReentrant {
        Reservation storage r = reservations[reservationId];
        if (r.amount == 0) revert("unknown reservation");
        if (r.consumed) revert AlreadyConsumed();
        if (r.released) revert AlreadyReleased();
        if (block.timestamp < r.validUntil) revert NotExpired();

        r.released = true;
        reserved[r.maker][r.token] -= r.amount;
        emit QuoteReleased(reservationId, r.maker, r.amount);
    }

    function getReservation(bytes32 reservationId) external view returns (Reservation memory) {
        return reservations[reservationId];
    }

    function hashQuote(FundedQuote calldata quote) external view returns (bytes32) {
        return _hashTypedDataV4(QuoteTypes.hash(quote));
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
