// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ECDSA} from "./ECDSA.sol";
import {IPause} from "./IPause.sol";
import {NectarEscrow} from "./NectarEscrow.sol";
import {QuoteLib} from "./QuoteLib.sol";
import {RehearsalMarket} from "./RehearsalMarket.sol";
import {
    AlreadySet,
    BadLifetime,
    BadMarket,
    BadParameter,
    Expired,
    InsufficientCash,
    NotActive,
    NotExpired,
    Replay,
    ScopePaused,
    SignatureInvalid,
    Unauthorized,
    ZeroAddress,
    ZeroAmount
} from "./Errors.sol";

/// @notice Registers EIP-712 single-fill quotes and reserves the full cashOut in escrow.
///         Quotes cannot be cancelled before expiry. Anyone may release an expired reservation.
contract NectarQuotes {
    enum Status {
        Unknown,
        Active,
        Filled,
        Released
    }

    bytes32 public immutable domainSeparator;
    NectarEscrow public immutable escrow;
    RehearsalMarket public immutable market;
    IPause public immutable pause;
    address public executor;
    address public owner;

    mapping(address maker => mapping(uint256 nonce => bool)) public usedNonce;
    mapping(uint256 id => QuoteLib.Quote) private stored;
    mapping(uint256 id => Status) public status;
    uint256 private locked;

    event QuoteReserved(
        uint256 indexed reservationId,
        address indexed maker,
        address indexed borrower,
        bytes32 marketKey,
        uint256 cashOut,
        uint256 collateralAmount,
        uint64 validUntil
    );
    event QuoteConsumed(uint256 indexed reservationId, address indexed maker, address indexed token, uint256 amount);
    event QuoteReleased(uint256 indexed reservationId, address indexed maker, address indexed token, uint256 amount);

    modifier nonReentrant() {
        if (locked != 0) revert Unauthorized();
        locked = 1;
        _;
        locked = 0;
    }

    constructor(address escrow_, address market_, address pause_) {
        if (escrow_ == address(0) || market_ == address(0) || pause_ == address(0)) revert ZeroAddress();
        escrow = NectarEscrow(escrow_);
        market = RehearsalMarket(market_);
        pause = IPause(pause_);
        owner = msg.sender;
        domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("NectarQuotes")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function setExecutor(address executor_) external {
        if (msg.sender != owner) revert Unauthorized();
        if (executor != address(0)) revert AlreadySet();
        if (executor_ == address(0)) revert ZeroAddress();
        executor = executor_;
        owner = address(0);
    }

    function hashTypedData(QuoteLib.Quote memory q) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, QuoteLib.hash(q)));
    }

    function quoteHash(uint256 id) public view returns (bytes32) {
        if (status[id] != Status.Active) return bytes32(0);
        return QuoteLib.hash(stored[id]);
    }

    function getQuote(uint256 id) external view returns (QuoteLib.Quote memory, uint8) {
        return (stored[id], uint8(status[id]));
    }

    function registerQuote(QuoteLib.Quote calldata q, bytes calldata signature) external nonReentrant {
        if (pause.paused()) revert ScopePaused();
        if (q.schemaVersion != 1 || q.adapterVersion != 1) revert BadParameter();
        if (q.maker == address(0) || q.borrower == address(0)) revert ZeroAddress();
        if (
            q.collateralRecipient == address(0) || q.keeperRecipient == address(0) || q.surplusRecipient == address(0)
        ) revert ZeroAddress();
        if (q.marketKey != market.marketKey() || q.policyHash != market.policyHash()) revert BadMarket();
        if (q.collateralToken != address(market.collateralToken()) || q.debtToken != address(market.debtToken())) {
            revert BadMarket();
        }
        if (q.collateralAmount == 0 || q.cashOut == 0 || q.maxDebtRepay == 0 || q.reservationId == 0) revert ZeroAmount();
        if (q.quoteNonce != q.makerNonce) revert BadParameter();
        if (q.keeperCompensation > q.cashOut) revert InsufficientCash();
        uint256 fees = q.keeperCompensation + q.protocolFee;
        if (fees < q.keeperCompensation || fees > q.cashOut) revert InsufficientCash();
        if (q.cashOut - fees < q.minNetSurplus) revert InsufficientCash();
        if (q.validUntil <= block.timestamp) revert BadLifetime();
        if (q.validUntil > block.timestamp + market.MAX_QUOTE_LIFETIME()) revert BadLifetime();
        if (usedNonce[q.maker][q.makerNonce]) revert Replay();
        if (status[q.reservationId] != Status.Unknown) revert Replay();

        address signer = ECDSA.recover(hashTypedData(q), signature);
        if (signer == address(0) || signer != q.maker) revert SignatureInvalid();

        usedNonce[q.maker][q.makerNonce] = true;
        status[q.reservationId] = Status.Active;
        stored[q.reservationId] = q;
        escrow.reserve(q.reservationId, q.maker, q.debtToken, q.cashOut, q.validUntil);
        emit QuoteReserved(
            q.reservationId, q.maker, q.borrower, q.marketKey, q.cashOut, q.collateralAmount, q.validUntil
        );
    }

    function releaseExpired(uint256 reservationId) external nonReentrant {
        if (status[reservationId] != Status.Active) revert NotActive();
        QuoteLib.Quote storage q = stored[reservationId];
        if (block.timestamp < q.validUntil) revert NotExpired();
        status[reservationId] = Status.Released;
        escrow.release(reservationId);
        emit QuoteReleased(reservationId, q.maker, q.debtToken, q.cashOut);
    }

    function consume(uint256 reservationId) external nonReentrant {
        if (msg.sender != executor) revert Unauthorized();
        if (status[reservationId] != Status.Active) revert NotActive();
        QuoteLib.Quote storage q = stored[reservationId];
        if (block.timestamp >= q.validUntil) revert Expired();
        status[reservationId] = Status.Filled;
        escrow.consume(reservationId, executor);
        emit QuoteConsumed(reservationId, q.maker, q.debtToken, q.cashOut);
    }
}
