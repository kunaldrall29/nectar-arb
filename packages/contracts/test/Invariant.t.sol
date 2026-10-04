// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/mocks/Mocks.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {QuoteTypes} from "../src/libraries/QuoteTypes.sol";
import {ProtocolBase} from "./Base.sol";

contract EscrowHandler is Test {
    QuoteEscrow public escrow;
    MockERC20 public token;
    address public maker;
    uint256 public ghost;
    uint256 internal pk;
    bytes32 internal marketId;
    address internal collateral;
    address internal borrower;
    uint256 internal nextNonce = 1;

    constructor(QuoteEscrow escrow_, MockERC20 token_, bytes32 marketId_, address collateral_, address borrower_, uint256 pk_) {
        escrow = escrow_;
        token = token_;
        marketId = marketId_;
        collateral = collateral_;
        borrower = borrower_;
        pk = pk_;
        maker = vm.addr(pk_);
        (ghost,) = escrow.accountOf(maker, address(token_));
    }

    function deposit(uint256 amount) external {
        amount = bound(amount, 1, 1e18);
        token.mint(maker, amount);
        vm.startPrank(maker);
        token.approve(address(escrow), amount);
        escrow.deposit(address(token), amount, maker);
        vm.stopPrank();
        ghost += amount;
    }

    function withdraw(uint256 amount) external {
        uint256 available = escrow.availableOf(maker, address(token));
        if (available == 0) return;
        amount = bound(amount, 1, available);
        vm.prank(maker);
        escrow.withdraw(address(token), amount, maker);
        ghost -= amount;
    }

    function donate(uint256 amount) external {
        amount = bound(amount, 1, 1e18);
        token.mint(address(escrow), amount);
    }

    function register(uint256 amount) external {
        uint256 available = escrow.availableOf(maker, address(token));
        if (available == 0) return;
        amount = bound(amount, 1, available);
        uint256 nonce = nextNonce++;
        QuoteTypes.Quote memory q;
        q.schemaVersion = 1;
        q.maker = maker;
        q.makerNonce = nonce;
        q.marketKey = marketId;
        q.adapterVersion = 1;
        q.borrower = borrower;
        q.collateralToken = collateral;
        q.collateralAmount = 1;
        q.debtToken = address(token);
        q.cashOut = amount;
        q.maxDebtRepay = amount;
        q.collateralRecipient = maker;
        q.keeperRecipient = maker;
        q.surplusRecipient = maker;
        q.validUntil = uint64(block.timestamp + 30);
        q.reservationId = nonce + 1_000_000;
        q.policyHash = keccak256("robinhood.fresh-price-stock");
        q.quoteNonce = nonce;
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, escrow.hashTypedData(q));
        escrow.registerQuote(q, abi.encodePacked(r, s, v));
    }
}

contract EscrowInvariantTest is ProtocolBase {
    EscrowHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new EscrowHandler(escrow, debt, marketId, address(coll), borrower, makerPk);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = handler.deposit.selector;
        selectors[1] = handler.withdraw.selector;
        selectors[2] = handler.donate.selector;
        selectors[3] = handler.register.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_holdingsCoverLiabilities() public view {
        assertGe(debt.balanceOf(address(escrow)), escrow.liabilities(address(debt)));
        assertLe(escrow.reservedTotal(address(debt)), escrow.liabilities(address(debt)));
    }

    function invariant_donationsDoNotCreditMaker() public view {
        (uint256 cash, uint256 reserved) = escrow.accountOf(handler.maker(), address(debt));
        assertEq(cash, handler.ghost());
        assertLe(reserved, cash);
    }
}
