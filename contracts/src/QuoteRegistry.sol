// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Quote, QuoteStatus, QuoteLib, Scopes} from "./NectarTypes.sol";
import {MakerEscrow} from "./MakerEscrow.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {PauseGuard} from "./PauseGuard.sol";

/// @title QuoteRegistry
/// @notice Verifies EIP-712 (EOA + EIP-1271) maker quotes and atomically reserves the full cashOut in escrow
///         (LQ02, LQ06). Quotes are firm until validUntil (LQ03), releasable by anyone afterwards (LQ04)
///         and consumable exactly once by the bound executor (LQ05).
contract QuoteRegistry is EIP712 {
    uint16 public constant SCHEMA_VERSION = 1;

    MakerEscrow public immutable escrow;
    MarketRegistry public immutable markets;
    PauseGuard public immutable guard;
    address public immutable deployer;
    address public executor;

    struct StoredQuote {
        Quote quote;
        QuoteStatus status;
    }

    mapping(bytes32 => StoredQuote) internal _quotes;
    mapping(address => uint256) public makerNonce;

    event QuoteReserved(
        bytes32 indexed quoteId,
        address indexed maker,
        bytes32 indexed marketKey,
        address borrower,
        address debtToken,
        uint256 cashOut,
        uint256 collateralAmount,
        uint256 maxDebtRepay,
        uint64 validUntil
    );
    event QuoteConsumed(bytes32 indexed quoteId, address indexed maker, address indexed executor);
    event QuoteReleased(bytes32 indexed quoteId, address indexed maker, uint256 cashOut);
    event MakerNonceIncremented(address indexed maker, uint256 newNonce);

    error NotExecutor();
    error AlreadyBound();
    error BadSchema();
    error ScopePaused();
    error UnsupportedMarket();
    error PolicyMismatch();
    error QuoteExpired();
    error LifetimeTooLong();
    error BadMakerNonce();
    error InvalidTerms(string reason);
    error DuplicateQuote();
    error InvalidSignature();
    error QuoteNotActive();
    error QuoteNotExpired();

    constructor(MakerEscrow escrow_, MarketRegistry markets_, PauseGuard guard_) EIP712("Nectar", "1") {
        escrow = escrow_;
        markets = markets_;
        guard = guard_;
        deployer = msg.sender;
    }

    function bindExecutor(address executor_) external {
        if (msg.sender != deployer || executor != address(0)) revert AlreadyBound();
        executor = executor_;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function quoteId(Quote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(QuoteLib.hashStruct(q));
    }

    /// @notice Cancels every signed-but-unregistered quote at the current nonce. Registered quotes stay firm.
    function incrementMakerNonce() external {
        uint256 n = ++makerNonce[msg.sender];
        emit MakerNonceIncremented(msg.sender, n);
    }

    function registerQuote(Quote calldata q, bytes calldata signature) external returns (bytes32 id) {
        if (q.schemaVersion != SCHEMA_VERSION) revert BadSchema();
        if (guard.isPaused(Scopes.GLOBAL_RESERVATIONS, Scopes.marketReservations(q.marketKey))) revert ScopePaused();

        MarketRegistry.MarketState memory m = markets.getMarket(q.marketKey);
        if (!m.admitted) revert UnsupportedMarket();
        if (q.policyHash != m.policyHash || q.adapterVersion != m.policy.adapterVersion) revert PolicyMismatch();
        if (q.collateralToken != m.policy.params.collateralToken || q.debtToken != m.policy.params.loanToken) {
            revert UnsupportedMarket();
        }
        if (q.validUntil <= block.timestamp) revert QuoteExpired();
        if (q.validUntil > block.timestamp + m.policy.maxQuoteLifetime) revert LifetimeTooLong();
        if (q.makerNonce != makerNonce[q.maker]) revert BadMakerNonce();
        if (q.collateralAmount == 0 || q.maxDebtRepay == 0) revert InvalidTerms("zero amount");
        if (q.collateralRecipient == address(0) || q.surplusRecipient == address(0)) {
            revert InvalidTerms("recipient");
        }
        if (q.cashOut < q.keeperCompensation + q.protocolFee + q.minNetSurplus) revert InvalidTerms("cashOut");

        id = quoteId(q);
        if (_quotes[id].status != QuoteStatus.None) revert DuplicateQuote();
        if (!SignatureChecker.isValidSignatureNow(q.maker, id, signature)) revert InvalidSignature();

        _quotes[id] = StoredQuote({quote: q, status: QuoteStatus.Active});
        escrow.reserve(q.maker, q.debtToken, q.cashOut, id);
        emit QuoteReserved(
            id, q.maker, q.marketKey, q.borrower, q.debtToken, q.cashOut, q.collateralAmount, q.maxDebtRepay, q.validUntil
        );
    }

    /// @notice Anyone may release an expired, unconsumed reservation back to its maker. Idempotent.
    function releaseExpired(bytes32 id) external returns (bool released) {
        StoredQuote storage s = _quotes[id];
        if (s.status == QuoteStatus.Released) return false;
        if (s.status != QuoteStatus.Active) revert QuoteNotActive();
        if (block.timestamp < s.quote.validUntil) revert QuoteNotExpired();
        s.status = QuoteStatus.Released;
        escrow.release(s.quote.maker, s.quote.debtToken, s.quote.cashOut, id);
        emit QuoteReleased(id, s.quote.maker, s.quote.cashOut);
        return true;
    }

    /// @notice Marks the quote consumed and moves its cashOut to the executor for settlement.
    function consumeForExecution(bytes32 id) external returns (Quote memory q) {
        if (msg.sender != executor) revert NotExecutor();
        StoredQuote storage s = _quotes[id];
        if (s.status != QuoteStatus.Active) revert QuoteNotActive();
        if (block.timestamp >= s.quote.validUntil) revert QuoteExpired();
        s.status = QuoteStatus.Consumed;
        q = s.quote;
        escrow.consume(q.maker, q.debtToken, q.cashOut, id, msg.sender);
        emit QuoteConsumed(id, q.maker, msg.sender);
    }

    function getQuote(bytes32 id) external view returns (Quote memory quote, QuoteStatus status) {
        StoredQuote storage s = _quotes[id];
        return (s.quote, s.status);
    }
}
