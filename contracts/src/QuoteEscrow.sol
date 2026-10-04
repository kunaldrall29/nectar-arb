// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IQuoteEscrow} from "./interfaces/IQuoteEscrow.sol";

/// @notice Segregated maker cash accounts with funded single-fill quote reservations.
contract QuoteEscrow is IQuoteEscrow, EIP712, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(uint256 schemaVersion,uint256 chainId,address verifyingContract,address maker,uint256 makerNonce,bytes32 marketKey,uint256 adapterVersion,address borrower,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperCompensation,uint256 protocolFee,uint256 minNetSurplus,address keeperRecipient,address surplusRecipient,uint256 validUntil,bytes32 reservationId,bytes32 policyHash,uint256 quoteNonce)"
    );

    address public executor;
    mapping(address => mapping(address => uint256)) private _cash;
    mapping(address => mapping(address => uint256)) private _reserved;
    mapping(bytes32 => Quote) private _quotes;
    mapping(bytes32 => bool) private _active;
    mapping(bytes32 => bool) private _consumed;
    mapping(bytes32 => bool) private _released;
    mapping(address => uint256) public nonces;
    mapping(bytes32 => bool) public usedReservationIds;

    uint256 public constant MAX_QUOTE_LIFETIME = 120;
    uint256 public constant SCHEMA_VERSION = 1;

    error Unauthorized();
    error InsufficientAvailable();
    error InvalidSignature();
    error QuoteExists();
    error QuoteInactive();
    error QuoteNotExpired();
    error QuoteExpired();
    error BadDomain();
    error BadNonce();
    error ReservationUsed();
    error ZeroAmount();
    error LifetimeTooLong();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert Unauthorized();
        _;
    }

    constructor(address initialOwner) EIP712("NectarQuote", "1") Ownable(initialOwner) {}

    function setExecutor(address executor_) external onlyOwner {
        executor = executor_;
    }

    function deposit(address token, uint256 amount, address beneficiary) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (beneficiary == address(0)) beneficiary = msg.sender;
        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - beforeBal;
        _cash[beneficiary][token] += received;
        emit CashDeposited(msg.sender, token, received, beneficiary);
    }

    function withdraw(address token, uint256 amount, address recipient) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) recipient = msg.sender;
        uint256 avail = availableCash(msg.sender, token);
        if (amount > avail) revert InsufficientAvailable();
        _cash[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        emit CashWithdrawn(msg.sender, token, amount, recipient);
    }

    function registerQuote(Quote calldata quote, bytes calldata signature) external nonReentrant returns (bytes32 quoteId) {
        if (quote.schemaVersion != SCHEMA_VERSION) revert BadDomain();
        if (quote.chainId != block.chainid) revert BadDomain();
        if (quote.verifyingContract != address(this)) revert BadDomain();
        if (quote.cashOut == 0 || quote.collateralAmount == 0) revert ZeroAmount();
        if (quote.validUntil <= block.timestamp) revert QuoteExpired();
        if (quote.validUntil > block.timestamp + MAX_QUOTE_LIFETIME) revert LifetimeTooLong();
        if (quote.makerNonce != nonces[quote.maker]) revert BadNonce();
        if (usedReservationIds[quote.reservationId]) revert ReservationUsed();
        if (availableCash(quote.maker, quote.debtToken) < quote.cashOut) revert InsufficientAvailable();

        bytes32 digest = _hashTypedDataV4(_hashQuote(quote));
        address signer = ECDSA.recover(digest, signature);
        if (signer != quote.maker) revert InvalidSignature();

        quoteId = keccak256(abi.encode(quote.reservationId, quote.maker, quote.quoteNonce));
        if (_active[quoteId] || _consumed[quoteId] || _released[quoteId]) revert QuoteExists();

        _quotes[quoteId] = quote;
        _active[quoteId] = true;
        usedReservationIds[quote.reservationId] = true;
        nonces[quote.maker] = quote.makerNonce + 1;
        _reserved[quote.maker][quote.debtToken] += quote.cashOut;

        emit QuoteReserved(quoteId, quote.maker, quote.debtToken, quote.cashOut, quote.validUntil);
    }

    function releaseExpired(bytes32 quoteId) external nonReentrant {
        Quote memory q = _quotes[quoteId];
        if (!_active[quoteId] || _consumed[quoteId] || _released[quoteId]) revert QuoteInactive();
        if (block.timestamp < q.validUntil) revert QuoteNotExpired();
        _active[quoteId] = false;
        _released[quoteId] = true;
        _reserved[q.maker][q.debtToken] -= q.cashOut;
        emit QuoteReleased(quoteId, q.maker, q.cashOut);
    }

    function consumeReservation(bytes32 quoteId, address debtToken, uint256 amount, address recipient)
        external
        onlyExecutor
        nonReentrant
    {
        Quote memory q = _quotes[quoteId];
        if (!_active[quoteId] || _consumed[quoteId] || _released[quoteId]) revert QuoteInactive();
        if (block.timestamp >= q.validUntil) revert QuoteExpired();
        if (debtToken != q.debtToken || amount > q.cashOut) revert InsufficientAvailable();

        _active[quoteId] = false;
        _consumed[quoteId] = true;
        _reserved[q.maker][q.debtToken] -= q.cashOut;
        _cash[q.maker][q.debtToken] -= q.cashOut;

        // Transfer exact settlement amount to recipient; remainder stays conceptual surplus handling by executor.
        IERC20(debtToken).safeTransfer(recipient, amount);
        // If cashOut > amount, residual stays in escrow and must be attributed by executor via separate pulls.
        // For MVP: residual stays under protocol control via executor pulling surplus in same tx through withdrawSurplus.
        uint256 residual = q.cashOut - amount;
        if (residual > 0) {
            // Credit residual to a transient protocol pocket keyed by address(this) for executor allocation.
            _cash[address(this)][debtToken] += residual;
        }

        emit QuoteConsumed(quoteId, q.maker, q.cashOut);
    }

    /// @notice Executor allocates residual cashOut after debt repayment to fee/surplus recipients.
    function allocateResidual(address token, address to, uint256 amount) external onlyExecutor nonReentrant {
        if (amount > _cash[address(this)][token]) revert InsufficientAvailable();
        _cash[address(this)][token] -= amount;
        IERC20(token).safeTransfer(to, amount);
    }

    function availableCash(address maker, address token) public view returns (uint256) {
        uint256 cash = _cash[maker][token];
        uint256 reserved = _reserved[maker][token];
        return cash > reserved ? cash - reserved : 0;
    }

    function reservedCash(address maker, address token) external view returns (uint256) {
        return _reserved[maker][token];
    }

    function cashBalance(address maker, address token) external view returns (uint256) {
        return _cash[maker][token];
    }

    function getQuote(bytes32 quoteId)
        external
        view
        returns (Quote memory quote, bool active, bool consumed, bool released)
    {
        return (_quotes[quoteId], _active[quoteId], _consumed[quoteId], _released[quoteId]);
    }

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function _hashQuote(Quote calldata q) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                QUOTE_TYPEHASH,
                q.schemaVersion,
                q.chainId,
                q.verifyingContract,
                q.maker,
                q.makerNonce,
                q.marketKey,
                q.adapterVersion,
                q.borrower,
                q.collateralToken,
                q.collateralAmount,
                q.debtToken,
                q.cashOut,
                q.maxDebtRepay,
                q.collateralRecipient,
                q.keeperCompensation,
                q.protocolFee,
                q.minNetSurplus,
                q.keeperRecipient,
                q.surplusRecipient,
                q.validUntil,
                q.reservationId,
                q.policyHash,
                q.quoteNonce
            )
        );
    }
}