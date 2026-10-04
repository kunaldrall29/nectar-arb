// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    AlreadySet,
    BadLifetime,
    BadMarket,
    BadParameter,
    Expired,
    FeeOnTransfer,
    InsufficientCash,
    NotActive,
    NotExpired,
    Replay,
    ReservedFunds,
    ScopePaused,
    SignatureInvalid,
    Unauthorized,
    ZeroAddress,
    ZeroAmount
} from "./Errors.sol";
import {MarketRegistry} from "./MarketRegistry.sol";
import {QuoteTypes} from "./libraries/QuoteTypes.sol";

/// @notice Maker cash and firm quotes. The EIP-712 verifying contract is this escrow.
///         Quotes cannot be cancelled before expiry. Unreserved cash can be withdrawn while execution is paused.
contract QuoteEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant DEFAULT_LIFETIME = 30;
    uint256 public constant MAX_LIFETIME = 120;

    enum Status {
        Unknown,
        Active,
        Filled,
        Released
    }

    struct Account {
        uint256 cash;
        uint256 reserved;
    }

    MarketRegistry public immutable registry;
    address public executor;

    mapping(address maker => mapping(address token => Account)) public accounts;
    mapping(address token => uint256) public liabilities;
    mapping(address token => uint256) public reservedTotal;
    mapping(address maker => mapping(uint256 nonce => bool)) public usedNonce;
    mapping(uint256 id => QuoteTypes.Quote) private _quotes;
    mapping(uint256 id => Status) public status;
    uint256[] private _ids;

    event CashDeposited(address indexed maker, address indexed token, uint256 amount, address payer);
    event CashWithdrawn(address indexed maker, address indexed token, uint256 amount, address recipient);
    event QuoteReserved(
        uint256 indexed reservationId, address indexed maker, address indexed borrower, bytes32 marketKey, uint256 cashOut
    );
    event QuoteReleased(uint256 indexed reservationId, address indexed maker, uint256 amount);
    event QuoteConsumed(uint256 indexed reservationId, address indexed maker, uint256 amount);

    constructor(address registry_) EIP712("NectarQuoteEscrow", "1") {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = MarketRegistry(registry_);
    }

    function setExecutor(address executor_) external {
        if (executor != address(0)) revert AlreadySet();
        if (msg.sender != registry.owner()) revert Unauthorized();
        if (executor_ == address(0)) revert ZeroAddress();
        executor = executor_;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function hashTypedData(QuoteTypes.Quote memory q) public view returns (bytes32) {
        return _hashTypedDataV4(QuoteTypes.hash(q));
    }

    function quoteCount() external view returns (uint256) {
        return _ids.length;
    }

    function quoteIdAt(uint256 index) external view returns (uint256) {
        return _ids[index];
    }

    function getQuote(uint256 id) external view returns (QuoteTypes.Quote memory, uint8) {
        return (_quotes[id], uint8(status[id]));
    }

    function availableOf(address maker, address token) external view returns (uint256) {
        Account storage a = accounts[maker][token];
        return a.cash - a.reserved;
    }

    function accountOf(address maker, address token) external view returns (uint256 cash, uint256 reserved) {
        Account storage a = accounts[maker][token];
        return (a.cash, a.reserved);
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

    /// @notice Unreserved cash only. Intentionally ignores the execution pause.
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

    function registerQuote(QuoteTypes.Quote calldata q, bytes calldata signature) external nonReentrant {
        if (registry.executionPaused()) revert ScopePaused();
        MarketRegistry.Market memory m = registry.getMarket(q.marketKey);
        if (!m.exists || m.paused) revert ScopePaused();
        if (q.schemaVersion != 1) revert BadParameter();
        if (q.adapterVersion != m.policyVersion || q.policyHash != m.policyHash) revert BadMarket();
        if (q.collateralToken != m.collateralToken || q.debtToken != m.debtToken) revert BadMarket();
        if (!registry.admitted(q.marketKey, q.debtToken) || !registry.admitted(q.marketKey, q.collateralToken)) {
            revert BadMarket();
        }
        if (q.maker == address(0) || q.borrower == address(0)) revert ZeroAddress();
        if (q.collateralRecipient == address(0) || q.keeperRecipient == address(0) || q.surplusRecipient == address(0)) {
            revert ZeroAddress();
        }
        if (q.collateralAmount == 0 || q.cashOut == 0 || q.maxDebtRepay == 0 || q.reservationId == 0) revert ZeroAmount();
        if (q.quoteNonce != q.makerNonce) revert BadParameter();
        if (q.validUntil <= block.timestamp) revert BadLifetime();
        if (q.validUntil > block.timestamp + MAX_LIFETIME) revert BadLifetime();
        uint256 fees = q.keeperCompensation + q.protocolFee;
        if (q.keeperCompensation > q.cashOut || fees < q.keeperCompensation || fees > q.cashOut) revert InsufficientCash();
        if (q.cashOut - fees < q.minNetSurplus) revert InsufficientCash();
        if (usedNonce[q.maker][q.makerNonce] || status[q.reservationId] != Status.Unknown) revert Replay();
        if (!SignatureChecker.isValidSignatureNow(q.maker, hashTypedData(q), signature)) revert SignatureInvalid();

        Account storage a = accounts[q.maker][q.debtToken];
        if (a.cash < a.reserved + q.cashOut) revert InsufficientCash();
        a.reserved += q.cashOut;
        reservedTotal[q.debtToken] += q.cashOut;
        if (reservedTotal[q.debtToken] > liabilities[q.debtToken]) revert InsufficientCash();

        usedNonce[q.maker][q.makerNonce] = true;
        status[q.reservationId] = Status.Active;
        _quotes[q.reservationId] = q;
        _ids.push(q.reservationId);
        emit QuoteReserved(q.reservationId, q.maker, q.borrower, q.marketKey, q.cashOut);
    }

    /// @notice Anyone may release a quote at or after expiry. There is no earlier cancel.
    function release(uint256 reservationId) external nonReentrant {
        if (status[reservationId] != Status.Active) revert NotActive();
        QuoteTypes.Quote storage q = _quotes[reservationId];
        if (block.timestamp < q.validUntil) revert NotExpired();
        status[reservationId] = Status.Released;
        Account storage a = accounts[q.maker][q.debtToken];
        a.reserved -= q.cashOut;
        reservedTotal[q.debtToken] -= q.cashOut;
        emit QuoteReleased(reservationId, q.maker, q.cashOut);
    }

    function consume(uint256 reservationId) external nonReentrant {
        if (msg.sender != executor) revert Unauthorized();
        if (registry.executionPaused()) revert ScopePaused();
        if (status[reservationId] != Status.Active) revert NotActive();
        QuoteTypes.Quote storage q = _quotes[reservationId];
        MarketRegistry.Market memory m = registry.getMarket(q.marketKey);
        if (m.paused) revert ScopePaused();
        if (block.timestamp >= q.validUntil) revert Expired();
        status[reservationId] = Status.Filled;
        Account storage a = accounts[q.maker][q.debtToken];
        a.reserved -= q.cashOut;
        a.cash -= q.cashOut;
        reservedTotal[q.debtToken] -= q.cashOut;
        liabilities[q.debtToken] -= q.cashOut;
        IERC20(q.debtToken).safeTransfer(executor, q.cashOut);
        emit QuoteConsumed(reservationId, q.maker, q.cashOut);
    }
}
