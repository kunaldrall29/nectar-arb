// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {NectarBase} from "./Base.t.sol";
import {Quote, QuoteLib} from "../src/NectarTypes.sol";
import {MakerEscrow} from "../src/MakerEscrow.sol";
import {QuoteRegistry} from "../src/QuoteRegistry.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract LedgerHandler is Test {
    MakerEscrow escrow;
    QuoteRegistry quotes;
    MockERC20 usdg;
    bytes32 marketKey;
    bytes32 policyHash;
    address collateral;
    uint256[3] pks = [uint256(0x1001), 0x1002, 0x1003];
    bytes32[] public ids;
    uint256 nonce;

    constructor(MakerEscrow e, QuoteRegistry q, MockERC20 u, bytes32 mk, bytes32 ph, address c) {
        escrow = e;
        quotes = q;
        usdg = u;
        marketKey = mk;
        policyHash = ph;
        collateral = c;
    }

    function makers(uint256 i) public view returns (address) {
        return vm.addr(pks[i % 3]);
    }

    function deposit(uint256 who, uint96 amount) external {
        address m = makers(who);
        uint256 a = bound(amount, 1, 1e13);
        usdg.mint(m, a);
        vm.startPrank(m);
        usdg.approve(address(escrow), a);
        escrow.deposit(address(usdg), a, m);
        vm.stopPrank();
    }

    function withdraw(uint256 who, uint96 amount) external {
        address m = makers(who);
        uint256 avail = escrow.available(m, address(usdg));
        if (avail == 0) return;
        uint256 a = bound(amount, 1, avail);
        vm.prank(m);
        escrow.withdraw(address(usdg), a, m);
    }

    function reserve(uint256 who, uint96 amount, uint8 life) external {
        uint256 pk = pks[who % 3];
        address m = vm.addr(pk);
        uint256 avail = escrow.available(m, address(usdg));
        if (avail == 0) return;
        Quote memory q;
        q.schemaVersion = 1;
        q.maker = m;
        q.makerNonce = quotes.makerNonce(m);
        q.marketKey = marketKey;
        q.adapterVersion = 1;
        q.borrower = address(0xB0);
        q.collateralToken = collateral;
        q.collateralAmount = 1;
        q.debtToken = address(usdg);
        q.cashOut = bound(amount, 1, avail);
        q.maxDebtRepay = 1;
        q.collateralRecipient = m;
        q.surplusRecipient = m;
        q.validUntil = uint64(block.timestamp + bound(life, 1, 120));
        q.policyHash = policyHash;
        q.quoteNonce = ++nonce;
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", quotes.domainSeparator(), QuoteLib.hashStruct(q)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        ids.push(quotes.registerQuote(q, abi.encodePacked(r, s, v)));
    }

    function warp(uint8 secs) external {
        vm.warp(block.timestamp + secs);
    }

    function release(uint256 idx) external {
        if (ids.length == 0) return;
        bytes32 id = ids[idx % ids.length];
        (Quote memory q,) = quotes.getQuote(id);
        if (block.timestamp < q.validUntil) return;
        quotes.releaseExpired(id);
    }
}

contract LedgerInvariantTest is NectarBase {
    LedgerHandler handler;

    function setUp() public override {
        super.setUp();
        handler = new LedgerHandler(
            escrow, quotes, usdg, marketKey, registry.getMarket(marketKey).policyHash, address(tsla)
        );
        targetContract(address(handler));
    }

    /// AC01: escrow holdings cover the sum of maker liabilities; reserved never exceeds cash.
    function invariant_AC01_conservation() public view {
        assertGe(usdg.balanceOf(address(escrow)), escrow.totalLiabilities(address(usdg)));
        uint256 sum = escrow.cash(maker, address(usdg));
        for (uint256 i; i < 3; i++) {
            address m = handler.makers(i);
            assertLe(escrow.reserved(m, address(usdg)), escrow.cash(m, address(usdg)));
            sum += escrow.cash(m, address(usdg));
        }
        assertEq(sum, escrow.totalLiabilities(address(usdg)));
    }
}
