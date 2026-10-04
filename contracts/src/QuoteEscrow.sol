// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Types} from "./Types.sol";
import {QuoteLib} from "./libraries/QuoteLib.sol";
import {SafeTransfer} from "./libraries/SafeTransfer.sol";
import {ECDSA} from "./libraries/ECDSA.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {
    Unauthorized,
    InvalidQuote,
    InvalidSignature,
    RESERVED_FUNDS,
    QUOTE_NOT_FUNDED,
    QUOTE_EXPIRED,
    QuoteAlreadyUsed,
    AlreadyReleased,
    IdempotentRelease,
    QuoteLifetime,
    ZeroAmount,
    UNSUPPORTED_MARKET,
    WRONG_NETWORK
} from "./Errors.sol";

/// @notice Segregated maker cash. Reservations consume available cash.
///         Only the authorized executor may consume a reservation.
contract QuoteEscrow {
    using SafeTransfer for address;

    MarketRegistry public immutable registry;
    address public executor;
    address public owner;

    mapping(address => mapping(address => uint256)) public cashOf;
    mapping(address => mapping(address => uint256)) public reservedOf;
    mapping(address => uint256) public makerNonces;
    mapping(bytes32 => bool) public reservationUsed;

    struct QuoteRecord {
        address maker;
        address token;
        uint256 cashOut;
        uint256 validUntil;
        bool reserved;
        bool consumed;
        bool released;
        bytes32 reservationId;
        bytes32 policyHash;
        bytes32 marketKey;
    }

    mapping(bytes32 => QuoteRecord) public quotes;

    event CashDeposited(address indexed token, address indexed from, address indexed beneficiary, uint256 amount);
    event CashWithdrawn(address indexed token, address indexed maker, address indexed recipient, uint256 amount);
    event QuoteReserved(
        bytes32 indexed quoteId,
        address indexed maker,
        address token,
        uint256 cashOut,
        uint256 validUntil,
        bytes32 reservationId
    );
    event QuoteConsumed(bytes32 indexed quoteId, address indexed maker, address token, uint256 cashOut, bytes32 jobId);
    event QuoteReleased(bytes32 indexed quoteId, address indexed maker, address token, uint256 cashOut);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address registry_) {
        owner = owner_;
        registry = MarketRegistry(registry_);
    }

    function setExecutor(address executor_) external onlyOwner {
        executor = executor_;
    }

    function available(address maker, address token) public view returns (uint256) {
        uint256 cash = cashOf[maker][token];
        uint256 reserved = reservedOf[maker][token];
        if (reserved > cash) return 0;
        return cash - reserved;
    }

    function deposit(address token, uint256 amount, address beneficiary) external {
        if (amount == 0) revert ZeroAmount();
        if (beneficiary == address(0) || token == address(0)) revert InvalidQuote();
        token.pullExact(msg.sender, amount);
        cashOf[beneficiary][token] += amount;
        emit CashDeposited(token, msg.sender, beneficiary, amount);
    }

    function withdraw(address token, uint256 amount, address recipient) external {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert InvalidQuote();
        if (available(msg.sender, token) < amount) revert RESERVED_FUNDS();
        cashOf[msg.sender][token] -= amount;
        token.pushExact(recipient, amount);
        emit CashWithdrawn(token, msg.sender, recipient, amount);
    }

    function registerQuote(Types.Quote calldata q, bytes calldata signature) external returns (bytes32 qid) {
        registry.requireNotPaused(Types.SCOPE_RESERVATIONS, q.marketKey);
        _validateQuote(q);
        qid = QuoteLib.quoteId(q);
        if (quotes[qid].reserved || quotes[qid].consumed) revert QuoteAlreadyUsed();
        if (reservationUsed[q.reservationId]) revert QuoteAlreadyUsed();

        bytes32 dgst = QuoteLib.digest(address(this), q);
        if (!ECDSA.isValidSignature(q.maker, dgst, signature)) revert InvalidSignature();

        if (available(q.maker, q.debtToken) < q.cashOut) revert QUOTE_NOT_FUNDED();

        reservationUsed[q.reservationId] = true;
        reservedOf[q.maker][q.debtToken] += q.cashOut;
        makerNonces[q.maker] = q.makerNonce + 1;

        quotes[qid] = QuoteRecord({
            maker: q.maker,
            token: q.debtToken,
            cashOut: q.cashOut,
            validUntil: q.validUntil,
            reserved: true,
            consumed: false,
            released: false,
            reservationId: q.reservationId,
            policyHash: q.policyHash,
            marketKey: q.marketKey
        });

        emit QuoteReserved(qid, q.maker, q.debtToken, q.cashOut, q.validUntil, q.reservationId);
    }

    function releaseExpired(bytes32 quoteId_) external {
        QuoteRecord storage r = quotes[quoteId_];
        if (r.released) return; // LQ04: idempotent, no duplicate credit
        if (r.consumed) revert QuoteAlreadyUsed();
        if (!r.reserved) revert QUOTE_NOT_FUNDED();
        if (block.timestamp < r.validUntil) revert QuoteLifetime();
        r.reserved = false;
        r.released = true;
        reservedOf[r.maker][r.token] -= r.cashOut;
        emit QuoteReleased(quoteId_, r.maker, r.token, r.cashOut);
    }

    /// @notice Authorized settlement only. Transfers reserved cashOut to `recipient` (the adapter).
    function consume(bytes32 quoteId_, address recipient, bytes32 jobId) external {
        if (msg.sender != executor) revert Unauthorized();
        QuoteRecord storage r = quotes[quoteId_];
        if (!r.reserved || r.consumed || r.released) revert QUOTE_NOT_FUNDED();
        if (block.timestamp >= r.validUntil) revert QUOTE_EXPIRED();
        r.reserved = false;
        r.consumed = true;
        reservedOf[r.maker][r.token] -= r.cashOut;
        cashOf[r.maker][r.token] -= r.cashOut;
        r.token.pushExact(recipient, r.cashOut);
        emit QuoteConsumed(quoteId_, r.maker, r.token, r.cashOut, jobId);
    }

    function getQuote(bytes32 quoteId_) external view returns (QuoteRecord memory) {
        return quotes[quoteId_];
    }

    function domainSeparator() external view returns (bytes32) {
        return QuoteLib.domainSeparator(address(this));
    }

    function _validateQuote(Types.Quote calldata q) internal view {
        if (q.schemaVersion != Types.SCHEMA_VERSION) revert InvalidQuote();
        if (q.chainId != block.chainid) revert WRONG_NETWORK();
        if (q.verifyingContract != address(this)) revert WRONG_NETWORK();
        if (q.maker == address(0) || q.collateralRecipient == address(0)) revert InvalidQuote();
        if (q.keeperRecipient == address(0) || q.surplusRecipient == address(0)) revert InvalidQuote();
        if (q.cashOut == 0 || q.collateralAmount == 0 || q.maxDebtRepay == 0) revert ZeroAmount();
        if (q.validUntil <= block.timestamp) revert QUOTE_EXPIRED();
        if (q.makerNonce != makerNonces[q.maker]) revert InvalidQuote();
        if (q.reservationId == bytes32(0)) revert InvalidQuote();

        Types.Market memory m = registry.getMarket(q.marketKey);
        if (!m.admitted) revert UNSUPPORTED_MARKET();
        if (m.adapterVersion != q.adapterVersion) revert InvalidQuote();
        if (m.debtToken != q.debtToken || m.collateralToken != q.collateralToken) revert InvalidQuote();
        if (q.policyHash != registry.policyHashOf(q.marketKey)) revert InvalidQuote();
        if (q.positionKey != QuoteLib.positionKey(q.marketKey, q.borrower)) revert InvalidQuote();

        Types.Policy memory p = registry.getPolicy(q.marketKey);
        uint256 maxLife = p.maxQuoteLifetime == 0 ? Types.MAX_QUOTE_LIFETIME : p.maxQuoteLifetime;
        if (maxLife > Types.MAX_QUOTE_LIFETIME) maxLife = Types.MAX_QUOTE_LIFETIME;
        if (q.validUntil > block.timestamp + maxLife) revert QuoteLifetime();
    }
}
