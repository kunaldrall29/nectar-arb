// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {FundedQuote} from "./interfaces/INectarTypes.sol";
import {QuoteEIP712} from "./QuoteEIP712.sol";

/// @title QuoteEscrow — maker cash accounts and funded quote reservations
contract QuoteEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public executor;
    address public guardian;
    bool public globalPaused;

    mapping(address => mapping(address => uint256)) public cashBalance;
    mapping(address => mapping(address => uint256)) public reservedBalance;
    mapping(uint256 => Reservation) public reservations;
    mapping(address => uint256) public makerNonces;
    mapping(uint256 => bool) public quoteNonceUsed;

    struct Reservation {
        address maker;
        address debtToken;
        uint256 amount;
        uint64 validUntil;
        bool consumed;
        bool released;
        bytes32 marketKey;
        uint256 quoteNonce;
    }

    event CashDeposited(address indexed maker, address indexed token, uint256 amount, address beneficiary);
    event CashWithdrawn(address indexed maker, address indexed token, uint256 amount, address recipient);
    event QuoteReserved(
        uint256 indexed reservationId,
        address indexed maker,
        bytes32 marketKey,
        uint256 cashOut,
        uint64 validUntil
    );
    event QuoteConsumed(uint256 indexed reservationId, address indexed keeper);
    event QuoteReleased(uint256 indexed reservationId, address indexed maker, uint256 amount);
    event ScopePaused(bool paused);

    error InsufficientCash();
    error InvalidSignature();
    error QuoteExpired();
    error ReservationActive();
    error ReservationUnknown();
    error ReservationConsumed();
    error ReservationNotExpired();
    error ReservationAlreadyReleased();
    error ReplayNonce();
    error WrongChain();
    error WrongVerifier();
    error Paused();
    error OnlyExecutor();

    constructor(address executor_, address guardian_) EIP712("Nectar", "1") {
        executor = executor_;
        guardian = guardian_;
    }

    function setExecutor(address executor_) external {
        require(msg.sender == guardian || executor == address(0), "auth");
        executor = executor_;
    }

    function pause(bool paused) external {
        if (msg.sender != guardian) revert Paused();
        globalPaused = paused;
        emit ScopePaused(paused);
    }

    function availableCash(address maker, address token) public view returns (uint256) {
        uint256 bal = cashBalance[maker][token];
        uint256 res = reservedBalance[maker][token];
        return bal > res ? bal - res : 0;
    }

    function deposit(address token, uint256 amount, address beneficiary) external nonReentrant {
        if (globalPaused) revert Paused();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        cashBalance[beneficiary][token] += amount;
        emit CashDeposited(beneficiary, token, amount, beneficiary);
    }

    function withdraw(address token, uint256 amount, address recipient) external nonReentrant {
        if (globalPaused) revert Paused();
        uint256 avail = availableCash(msg.sender, token);
        if (amount > avail) revert InsufficientCash();
        cashBalance[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        emit CashWithdrawn(msg.sender, token, amount, recipient);
    }

    function registerQuote(FundedQuote calldata quote, bytes calldata signature) external nonReentrant {
        if (globalPaused) revert Paused();
        if (quote.chainId != block.chainid) revert WrongChain();
        if (quote.verifyingContract != address(this)) revert WrongVerifier();
        if (quote.validUntil <= block.timestamp) revert QuoteExpired();
        if (quoteNonceUsed[quote.quoteNonce]) revert ReplayNonce();

        bytes32 digest = _hashQuote(quote);
        address signer = ECDSA.recover(digest, signature);
        if (signer != quote.maker) revert InvalidSignature();
        if (quote.makerNonce != makerNonces[quote.maker]) revert ReplayNonce();

        uint256 avail = availableCash(quote.maker, quote.debtToken);
        if (quote.cashOut > avail) revert InsufficientCash();

        makerNonces[quote.maker]++;
        quoteNonceUsed[quote.quoteNonce] = true;
        reservedBalance[quote.maker][quote.debtToken] += quote.cashOut;

        reservations[quote.reservationId] = Reservation({
            maker: quote.maker,
            debtToken: quote.debtToken,
            amount: quote.cashOut,
            validUntil: quote.validUntil,
            consumed: false,
            released: false,
            marketKey: quote.marketKey,
            quoteNonce: quote.quoteNonce
        });

        emit QuoteReserved(quote.reservationId, quote.maker, quote.marketKey, quote.cashOut, quote.validUntil);
    }

    function releaseExpired(uint256 reservationId) external nonReentrant {
        Reservation storage r = reservations[reservationId];
        if (r.maker == address(0)) revert ReservationUnknown();
        if (r.consumed) revert ReservationConsumed();
        if (r.released) revert ReservationAlreadyReleased();
        if (block.timestamp < r.validUntil) revert ReservationNotExpired();

        r.released = true;
        reservedBalance[r.maker][r.debtToken] -= r.amount;
        emit QuoteReleased(reservationId, r.maker, r.amount);
    }

    /// @dev Called only by executor during settlement
    /// @dev Pull reserved cash for settlement (executor only, after consumeReservation accounting)
    function transferForSettlement(address token, address to, uint256 amount) external {
        if (msg.sender != executor) revert OnlyExecutor();
        IERC20(token).safeTransfer(to, amount);
    }

    function consumeReservation(uint256 reservationId, address keeper) external {
        if (msg.sender != executor) revert OnlyExecutor();
        Reservation storage r = reservations[reservationId];
        if (r.maker == address(0)) revert ReservationUnknown();
        if (r.consumed) revert ReservationConsumed();
        if (r.released) revert ReservationAlreadyReleased();
        if (block.timestamp >= r.validUntil) revert QuoteExpired();

        r.consumed = true;
        reservedBalance[r.maker][r.debtToken] -= r.amount;
        cashBalance[r.maker][r.debtToken] -= r.amount;
        emit QuoteConsumed(reservationId, keeper);
    }

    function getReservation(uint256 reservationId) external view returns (Reservation memory) {
        return reservations[reservationId];
    }

    function hashQuote(FundedQuote calldata q) external view returns (bytes32) {
        return _hashQuote(q);
    }

    function _hashQuote(FundedQuote calldata q) internal view returns (bytes32) {
        return _hashTypedDataV4(QuoteEIP712.structHash(q));
    }
}
