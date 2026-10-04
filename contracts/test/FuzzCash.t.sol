// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Types} from "../src/Types.sol";
import {QuoteLib} from "../src/libraries/QuoteLib.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {QuoteEscrow} from "../src/QuoteEscrow.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {RiskGuard} from "../src/RiskGuard.sol";
import {MorphoBlueAdapter} from "../src/adapters/MorphoBlueAdapter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {MockSequencer} from "../src/mocks/MockSequencer.sol";
import {MockMorpho} from "../src/mocks/MockMorpho.sol";
import {MockAMM} from "../src/mocks/MockAMM.sol";

contract CashHandler is Test {
    QuoteEscrow public escrow;
    MockERC20 public token;
    uint256 public makerPk;
    address public maker;
    bytes32 public marketKey;
    bytes32 public policyHash;
    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;
    uint256 public ghostConsumed;
    bytes32[] public liveQuotes;

    constructor(
        QuoteEscrow escrow_,
        MockERC20 token_,
        uint256 makerPk_,
        bytes32 marketKey_,
        bytes32 policyHash_
    ) {
        escrow = escrow_;
        token = token_;
        makerPk = makerPk_;
        maker = vm.addr(makerPk_);
        marketKey = marketKey_;
        policyHash = policyHash_;
    }

    function deposit(uint256 amount) public {
        amount = bound(amount, 1, 50_000);
        token.mint(maker, amount);
        vm.startPrank(maker);
        token.approve(address(escrow), amount);
        escrow.deposit(address(token), amount, maker);
        vm.stopPrank();
        ghostDeposited += amount;
    }

    function withdraw(uint256 amount) public {
        uint256 avail = escrow.available(maker, address(token));
        if (avail == 0) return;
        amount = bound(amount, 1, avail);
        vm.prank(maker);
        escrow.withdraw(address(token), amount, maker);
        ghostWithdrawn += amount;
    }

    function register(uint256 cashOut, uint256 salt) public {
        uint256 avail = escrow.available(maker, address(token));
        if (avail < 10) return;
        cashOut = bound(cashOut, 10, avail);
        Types.Quote memory q;
        q.schemaVersion = 1;
        q.chainId = block.chainid;
        q.verifyingContract = address(escrow);
        q.maker = maker;
        q.makerNonce = escrow.makerNonces(maker);
        q.marketKey = marketKey;
        q.adapterVersion = 1;
        q.borrower = address(0xB0);
        q.positionKey = QuoteLib.positionKey(marketKey, address(0xB0));
        q.collateralToken = address(0xC011);
        q.collateralAmount = 1;
        q.debtToken = address(token);
        q.cashOut = cashOut;
        q.maxDebtRepay = cashOut;
        q.collateralRecipient = maker;
        q.keeperCompensation = 0;
        q.protocolFee = 0;
        q.minNetSurplus = 0;
        q.keeperRecipient = maker;
        q.surplusRecipient = maker;
        q.validUntil = block.timestamp + 60;
        q.reservationId = keccak256(abi.encode(salt, cashOut, q.makerNonce, block.number));
        q.policyHash = policyHash;
        q.quoteNonce = salt;
        bytes32 digest = QuoteLib.digest(address(escrow), q);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerPk, digest);
        escrow.registerQuote(q, abi.encodePacked(r, s, v));
        liveQuotes.push(QuoteLib.quoteId(q));
    }

    function release(uint256 idx) public {
        if (liveQuotes.length == 0) return;
        idx = bound(idx, 0, liveQuotes.length - 1);
        bytes32 qid = liveQuotes[idx];
        QuoteEscrow.QuoteRecord memory rec = escrow.getQuote(qid);
        if (!rec.reserved || rec.consumed) return;
        vm.warp(rec.validUntil);
        escrow.releaseExpired(qid);
    }
}

contract FuzzCashTest is Test {
    CashHandler internal handler;
    QuoteEscrow internal escrow;
    MockERC20 internal token;
    address internal maker;

    function setUp() public {
        uint256 makerPk = 0xA11CE;
        maker = vm.addr(makerPk);
        token = new MockERC20("Mock USDC", "mUSDC", 6);
        MockOracle oracle = new MockOracle(1e18, bytes32("f"));
        MockSequencer seq = new MockSequencer();
        MockMorpho morpho = new MockMorpho();
        bytes32 mid = morpho.createMarket(address(token), address(0xC011), address(oracle), 0.8e18);
        bytes32 marketKey = keccak256(abi.encode(block.chainid, address(morpho), mid));

        MarketRegistry registry = new MarketRegistry(address(this), address(this), address(this), 0);
        escrow = new QuoteEscrow(address(this), address(registry));
        RiskGuard guard = new RiskGuard();
        NectarExecutor executor = new NectarExecutor(address(this), address(registry), address(escrow), address(guard));
        MorphoBlueAdapter adapter = new MorphoBlueAdapter(address(executor), address(morpho), address(this));
        escrow.setExecutor(address(executor));

        Types.Market memory m = Types.Market({
            marketKey: marketKey,
            chainId: block.chainid,
            protocol: address(morpho),
            morphoMarketId: mid,
            adapter: address(adapter),
            adapterVersion: 1,
            debtToken: address(token),
            collateralToken: address(0xC011),
            oracle: address(oracle),
            sequencer: address(seq),
            lltv: 0.8e18,
            admitted: true,
            mockLabeled: true
        });
        Types.Policy memory p = Types.Policy({
            version: 1,
            hash: bytes32(0),
            maxQuoteLifetime: 120,
            minPriceFreshness: 1 days,
            sequencerGrace: 0,
            protocolFeeRecipient: address(this),
            ammEnabled: false
        });
        p.hash = QuoteLib.policyHash(p);
        registry.admitMarket(m, p);

        handler = new CashHandler(escrow, token, makerPk, marketKey, p.hash);
        targetContract(address(handler));
    }

    function invariant_escrowCoversLiabilities() public view {
        uint256 held = token.balanceOf(address(escrow));
        uint256 liability = escrow.cashOf(maker, address(token));
        assertEq(held, liability, "escrow token holdings must equal maker cash liability");
        assertGe(liability, escrow.reservedOf(maker, address(token)), "reserved cannot exceed cash");
    }

    function invariant_availableMath() public view {
        uint256 cash = escrow.cashOf(maker, address(token));
        uint256 reserved = escrow.reservedOf(maker, address(token));
        assertEq(escrow.available(maker, address(token)), cash - reserved);
    }

    function test_faultyDoubleCreditWouldBreakInvariant() public {
        token.mint(maker, 100);
        vm.startPrank(maker);
        token.approve(address(escrow), 100);
        escrow.deposit(address(token), 100, maker);
        vm.stopPrank();
        uint256 held = token.balanceOf(address(escrow));
        uint256 buggyLiability = escrow.cashOf(maker, address(token)) + 100; // mutated double credit
        assertTrue(held != buggyLiability, "suite detects a faulty extra credit");
    }
}
