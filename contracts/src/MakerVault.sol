// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {MarketRegistry} from "./MarketRegistry.sol";

/// @title MakerVault (QuoteEscrow)
/// @notice Segregated maker cash accounts and funded, single-fill, time-bounded quotes (PRD Section 8).
///  - deposit credits verified received cash (balance-delta check, LQ07)
///  - registerQuote verifies an EIP-712 / EIP-1271 authorization and reserves the full cashOut atomically (LQ02, LQ06)
///  - a registered quote cannot be cancelled before expiry (LQ03); after expiry anyone may release it (LQ04)
///  - only the bound executor can consume a reservation, exactly once (LQ05)
///  - withdraw debits only unreserved cash and stays available during a Nectar pause (Section 16)
contract MakerVault is Ownable, ReentrancyGuard, EIP712 {
    using SafeERC20 for IERC20;

    uint16 public constant SCHEMA_VERSION = 1;

    struct Quote {
        address maker;
        bytes32 marketKey;
        uint32 policyVersion;
        address borrower; // address(0) = any position in the market (labeled market-scoped quote)
        address collateralToken;
        uint256 collateralAmount;
        address debtToken;
        uint256 cashOut;
        uint256 maxDebtRepay;
        address collateralRecipient;
        uint256 keeperFee;
        uint256 protocolFee;
        uint256 minNetSurplus;
        address surplusRecipient;
        uint64 validUntil;
        uint256 nonce;
    }

    enum Status {
        None,
        Active,
        Filled,
        Released
    }

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(address maker,bytes32 marketKey,uint32 policyVersion,address borrower,address collateralToken,uint256 collateralAmount,address debtToken,uint256 cashOut,uint256 maxDebtRepay,address collateralRecipient,uint256 keeperFee,uint256 protocolFee,uint256 minNetSurplus,address surplusRecipient,uint64 validUntil,uint256 nonce)"
    );

    MarketRegistry public immutable registry;
    address public executor;

    mapping(address => bool) public isCashToken;
    mapping(address => mapping(address => uint256)) public cashOf; // maker => token => liability
    mapping(address => mapping(address => uint256)) public reservedOf; // maker => token => reserved
    mapping(address => uint256) public totalLiabilities; // token => sum of cashOf
    mapping(bytes32 => Quote) internal _quotes;
    mapping(bytes32 => Status) public statusOf;
    mapping(address => mapping(uint256 => bool)) public nonceUsed;

    event CashDeposited(address indexed beneficiary, address indexed token, uint256 amount, address indexed from);
    event CashWithdrawn(address indexed maker, address indexed token, uint256 amount, address indexed recipient);
    event QuoteReserved(
        bytes32 indexed quoteId,
        address indexed maker,
        bytes32 indexed marketKey,
        address borrower,
        address debtToken,
        uint256 cashOut,
        uint256 collateralAmount,
        uint64 validUntil
    );
    event QuoteConsumed(bytes32 indexed quoteId, address indexed maker, uint256 cashOut);
    event QuoteReleased(bytes32 indexed quoteId, address indexed maker, uint256 amount);
    event ExecutorSet(address executor);
    event CashTokenSet(address token, bool allowed);

    error UnsupportedToken();
    error ZeroAmount();
    error UnexpectedReceivedAmount(uint256 expected, uint256 received);
    error ReservedFunds(uint256 available);
    error InvalidSignature();
    error QuoteExists();
    error NonceUsed();
    error UnsupportedMarket();
    error ScopePaused();
    error PolicyVersionMismatch();
    error AssetMismatch();
    error InvalidExpiry();
    error InvalidTerms();
    error QuoteNotFunded();
    error QuoteExpired();
    error QuoteNotExpired();
    error NotExecutor();
    error ExecutorAlreadySet();

    constructor(MarketRegistry registry_, address owner_) Ownable(owner_) EIP712("Nectar QuoteEscrow", "1") {
        registry = registry_;
    }

    // ----------------------------------------------------------------- admin

    /// @notice One-time binding of the settlement executor; cannot be changed afterwards.
    function setExecutor(address executor_) external onlyOwner {
        if (executor != address(0)) revert ExecutorAlreadySet();
        executor = executor_;
        emit ExecutorSet(executor_);
    }

    function setCashToken(address token, bool allowed) external onlyOwner {
        isCashToken[token] = allowed;
        emit CashTokenSet(token, allowed);
    }

    // ------------------------------------------------------------ cash accounts

    function deposit(address token, uint256 amount, address beneficiary) external nonReentrant {
        if (!isCashToken[token]) revert UnsupportedToken();
        if (amount == 0) revert ZeroAmount();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        if (received != amount) revert UnexpectedReceivedAmount(amount, received);
        cashOf[beneficiary][token] += amount;
        totalLiabilities[token] += amount;
        emit CashDeposited(beneficiary, token, amount, msg.sender);
    }

    function withdraw(address token, uint256 amount, address recipient) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 avail = available(msg.sender, token);
        if (amount > avail) revert ReservedFunds(avail);
        cashOf[msg.sender][token] -= amount;
        totalLiabilities[token] -= amount;
        IERC20(token).safeTransfer(recipient, amount);
        emit CashWithdrawn(msg.sender, token, amount, recipient);
    }

    function available(address maker, address token) public view returns (uint256) {
        return cashOf[maker][token] - reservedOf[maker][token];
    }

    // ----------------------------------------------------------------- quotes

    function hashQuote(Quote calldata q) public pure returns (bytes32) {
        bytes memory a = abi.encode(
            QUOTE_TYPEHASH,
            q.maker,
            q.marketKey,
            q.policyVersion,
            q.borrower,
            q.collateralToken,
            q.collateralAmount,
            q.debtToken,
            q.cashOut
        );
        bytes memory b = abi.encode(
            q.maxDebtRepay,
            q.collateralRecipient,
            q.keeperFee,
            q.protocolFee,
            q.minNetSurplus,
            q.surplusRecipient,
            q.validUntil,
            q.nonce
        );
        return keccak256(bytes.concat(a, b));
    }

    /// @notice EIP-712 digest; also the quote id (domain-bound to chain id and this contract).
    function quoteId(Quote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(hashQuote(q));
    }

    /// @notice Register a quote and reserve its full cashOut. The maker may submit directly with an empty
    /// signature; anyone else must supply the maker's EIP-712 (EOA) or EIP-1271 (contract wallet) signature.
    function registerQuote(Quote calldata q, bytes calldata signature) external nonReentrant returns (bytes32 id) {
        id = quoteId(q);
        if (statusOf[id] != Status.None) revert QuoteExists();
        if (msg.sender != q.maker && !SignatureChecker.isValidSignatureNow(q.maker, id, signature)) {
            revert InvalidSignature();
        }
        if (nonceUsed[q.maker][q.nonce]) revert NonceUsed();

        MarketRegistry.MarketConfig memory m = registry.getMarket(q.marketKey);
        if (!m.admitted) revert UnsupportedMarket();
        if (registry.isReservationPaused(q.marketKey)) revert ScopePaused();
        if (m.policy.version != q.policyVersion) revert PolicyVersionMismatch();
        if (m.params.loanToken != q.debtToken || m.params.collateralToken != q.collateralToken) revert AssetMismatch();
        if (q.validUntil <= block.timestamp || q.validUntil > block.timestamp + m.policy.maxQuoteLifetime) {
            revert InvalidExpiry();
        }
        _checkTerms(q, m.policy);

        uint256 avail = available(q.maker, q.debtToken);
        if (q.cashOut > avail) revert ReservedFunds(avail);

        nonceUsed[q.maker][q.nonce] = true;
        reservedOf[q.maker][q.debtToken] += q.cashOut;
        _quotes[id] = q;
        statusOf[id] = Status.Active;
        emit QuoteReserved(id, q.maker, q.marketKey, q.borrower, q.debtToken, q.cashOut, q.collateralAmount, q.validUntil);
    }

    function _checkTerms(Quote calldata q, MarketRegistry.Policy memory p) internal pure {
        if (
            q.collateralAmount == 0 || q.cashOut == 0 || q.cashOut > p.maxQuoteCashOut
                || q.collateralRecipient == address(0) || q.surplusRecipient == address(0)
        ) revert InvalidTerms();
        uint256 obligations = q.keeperFee + q.protocolFee + q.minNetSurplus;
        if (obligations > q.cashOut || q.maxDebtRepay == 0 || q.maxDebtRepay > q.cashOut - obligations) {
            revert InvalidTerms();
        }
        if (q.protocolFee * 10_000 < q.cashOut * p.minProtocolFeeBps) revert InvalidTerms();
    }

    /// @notice Release an expired, unconsumed reservation back to the same maker. Idempotent: a second call is a no-op.
    function releaseExpired(bytes32 id) external nonReentrant returns (bool released) {
        Status s = statusOf[id];
        if (s == Status.None) revert QuoteNotFunded();
        if (s != Status.Active) return false;
        Quote storage q = _quotes[id];
        if (block.timestamp < q.validUntil) revert QuoteNotExpired();
        statusOf[id] = Status.Released;
        reservedOf[q.maker][q.debtToken] -= q.cashOut;
        emit QuoteReleased(id, q.maker, q.cashOut);
        return true;
    }

    /// @notice Consume a live reservation exactly once and transfer its cashOut to the executor.
    function consume(bytes32 id) external nonReentrant returns (Quote memory q) {
        if (msg.sender != executor) revert NotExecutor();
        if (statusOf[id] != Status.Active) revert QuoteNotFunded();
        q = _quotes[id];
        if (block.timestamp >= q.validUntil) revert QuoteExpired();
        statusOf[id] = Status.Filled;
        reservedOf[q.maker][q.debtToken] -= q.cashOut;
        cashOf[q.maker][q.debtToken] -= q.cashOut;
        totalLiabilities[q.debtToken] -= q.cashOut;
        IERC20(q.debtToken).safeTransfer(executor, q.cashOut);
        emit QuoteConsumed(id, q.maker, q.cashOut);
    }

    function getQuote(bytes32 id) external view returns (Quote memory) {
        return _quotes[id];
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}
