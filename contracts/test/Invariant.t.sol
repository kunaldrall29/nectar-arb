// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NectarBase} from "./Base.t.sol";
import {MakerVault} from "../src/MakerVault.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {TestToken} from "../src/mocks/TestToken.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

contract VaultHandler is Test {
    MakerVault internal vault;
    NectarExecutor internal executor;
    TestToken internal usdc;
    MockOracle internal oracle;
    address internal gov;
    bytes32 internal marketKey;
    address internal borrower;
    address internal tsla;
    address[] internal makers;
    bytes32[] public quoteIds;
    uint256 internal nonce;

    constructor(
        MakerVault vault_,
        NectarExecutor executor_,
        TestToken usdc_,
        MockOracle oracle_,
        address gov_,
        bytes32 marketKey_,
        address borrower_,
        address tsla_
    ) {
        vault = vault_;
        executor = executor_;
        usdc = usdc_;
        oracle = oracle_;
        gov = gov_;
        marketKey = marketKey_;
        borrower = borrower_;
        tsla = tsla_;
        for (uint256 i; i < 3; i++) {
            address m = makeAddr(string(abi.encodePacked("maker", i)));
            makers.push(m);
            vm.prank(m);
            usdc.approve(address(vault), type(uint256).max);
        }
    }

    function deposit(uint256 who, uint256 amount) external {
        address m = makers[who % makers.length];
        amount = bound(amount, 1, 50_000e6);
        vm.prank(gov);
        usdc.mint(m, amount);
        vm.prank(m);
        vault.deposit(address(usdc), amount, m);
    }

    function withdraw(uint256 who, uint256 amount) external {
        address m = makers[who % makers.length];
        uint256 avail = vault.available(m, address(usdc));
        if (avail == 0) return;
        amount = bound(amount, 1, avail);
        vm.prank(m);
        vault.withdraw(address(usdc), amount, m);
    }

    function register(uint256 who, uint256 cash, uint256 life) external {
        address m = makers[who % makers.length];
        uint256 avail = vault.available(m, address(usdc));
        if (avail < 1_000e6) return;
        cash = bound(cash, 1_000e6, avail);
        MakerVault.Quote memory q = MakerVault.Quote({
            maker: m,
            marketKey: marketKey,
            policyVersion: 1,
            borrower: borrower,
            collateralToken: tsla,
            collateralAmount: 1e18,
            debtToken: address(usdc),
            cashOut: cash,
            maxDebtRepay: cash / 2,
            collateralRecipient: m,
            keeperFee: 1e6,
            protocolFee: cash / 500,
            minNetSurplus: 0,
            surplusRecipient: m,
            validUntil: uint64(block.timestamp + bound(life, 1, 120)),
            nonce: ++nonce
        });
        vm.prank(m);
        quoteIds.push(vault.registerQuote(q, ""));
    }

    function release(uint256 idx) external {
        if (quoteIds.length == 0) return;
        bytes32 id = quoteIds[idx % quoteIds.length];
        MakerVault.Quote memory q = vault.getQuote(id);
        if (block.timestamp < q.validUntil) return;
        vault.releaseExpired(id);
    }

    function execute(uint256 idx) external {
        if (quoteIds.length == 0) return;
        bytes32 id = quoteIds[idx % quoteIds.length];
        try executor.executeJob(NectarExecutor.Job({quoteId: id, borrower: borrower, deadline: block.timestamp})) {}
            catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 200));
        vm.prank(gov);
        oracle.poke();
    }

    function makerCount() external view returns (uint256) {
        return makers.length;
    }

    function makerAt(uint256 i) external view returns (address) {
        return makers[i];
    }
}

contract VaultInvariantTest is NectarBase {
    VaultHandler internal handler;

    function setUp() public override {
        super.setUp();
        vm.prank(gov);
        oracle.setPrice(200 * DOLLAR_PRICE); // borrower liquidatable so some executions succeed
        handler = new VaultHandler(vault, executor, usdc, oracle, gov, marketKey, borrower, address(tsla));
        targetContract(address(handler));
    }

    /// AC01: escrow holdings cover the sum of maker liabilities; reserved never exceeds cash.
    function invariant_CashConservation() public view {
        assertGe(usdc.balanceOf(address(vault)), vault.totalLiabilities(address(usdc)));
        uint256 sum;
        for (uint256 i; i < handler.makerCount(); i++) {
            address m = handler.makerAt(i);
            assertLe(vault.reservedOf(m, address(usdc)), vault.cashOf(m, address(usdc)));
            sum += vault.cashOf(m, address(usdc));
        }
        assertEq(sum, vault.totalLiabilities(address(usdc)));
    }

    function invariant_ExecutorHoldsNothing() public view {
        assertEq(usdc.balanceOf(address(executor)), 0);
        assertEq(tsla.balanceOf(address(executor)), 0);
        assertEq(uint8(executor.stage()), 0);
    }
}
