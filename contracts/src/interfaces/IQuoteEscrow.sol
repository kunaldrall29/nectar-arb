// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IQuoteEscrow {
    struct Quote {
        uint256 schemaVersion;
        uint256 chainId;
        address verifyingContract;
        address maker;
        uint256 makerNonce;
        bytes32 marketKey;
        uint256 adapterVersion;
        address borrower;
        address collateralToken;
        uint256 collateralAmount;
        address debtToken;
        uint256 cashOut;
        uint256 maxDebtRepay;
        address collateralRecipient;
        uint256 keeperCompensation;
        uint256 protocolFee;
        uint256 minNetSurplus;
        address keeperRecipient;
        address surplusRecipient;
        uint256 validUntil;
        bytes32 reservationId;
        bytes32 policyHash;
        uint256 quoteNonce;
    }

    event CashDeposited(address indexed maker, address indexed token, uint256 amount, address indexed beneficiary);
    event CashWithdrawn(address indexed maker, address indexed token, uint256 amount, address indexed recipient);
    event QuoteReserved(bytes32 indexed quoteId, address indexed maker, address indexed token, uint256 cashOut, uint256 validUntil);
    event QuoteConsumed(bytes32 indexed quoteId, address indexed maker, uint256 cashOut);
    event QuoteReleased(bytes32 indexed quoteId, address indexed maker, uint256 cashOut);

    function deposit(address token, uint256 amount, address beneficiary) external;
    function withdraw(address token, uint256 amount, address recipient) external;
    function registerQuote(Quote calldata quote, bytes calldata signature) external returns (bytes32 quoteId);
    function releaseExpired(bytes32 quoteId) external;
    function consumeReservation(bytes32 quoteId, address debtToken, uint256 amount, address recipient) external;
    function availableCash(address maker, address token) external view returns (uint256);
    function reservedCash(address maker, address token) external view returns (uint256);
    function cashBalance(address maker, address token) external view returns (uint256);
    function getQuote(bytes32 quoteId) external view returns (Quote memory quote, bool active, bool consumed, bool released);
    function setExecutor(address executor) external;
}