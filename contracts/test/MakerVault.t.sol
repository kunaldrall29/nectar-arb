// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NectarBase} from "./Base.t.sol";
import {MakerVault} from "../src/MakerVault.sol";
import {MarketRegistry} from "../src/MarketRegistry.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {
        _mint(msg.sender, 1e30);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

contract SmartWallet is IERC1271 {
    address public immutable signer;

    constructor(address signer_) {
        signer = signer_;
    }

    function isValidSignature(bytes32 hash, bytes memory sig) external view returns (bytes4) {
        (address rec,,) = ECDSA.tryRecover(hash, sig);
        return rec == signer ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

contract MakerVaultTest is NectarBase {
    // T01
    function test_T01_DepositAndWithdrawUnreserved() public {
        _deposit(1_000 * USDC);
        assertEq(vault.cashOf(maker, address(usdc)), 1_000 * USDC);
        assertEq(vault.available(maker, address(usdc)), 1_000 * USDC);
        uint256 before = usdc.balanceOf(maker);
        vm.prank(maker);
        vault.withdraw(address(usdc), 400 * USDC, maker);
        assertEq(usdc.balanceOf(maker), before + 400 * USDC);
        assertEq(vault.cashOf(maker, address(usdc)), 600 * USDC);
        assertEq(vault.totalLiabilities(address(usdc)), 600 * USDC);
    }

    function test_DepositOnBehalfCreditsBeneficiaryOnly() public {
        address other = makeAddr("other");
        vm.prank(maker);
        vault.deposit(address(usdc), 500 * USDC, other);
        assertEq(vault.cashOf(other, address(usdc)), 500 * USDC);
        assertEq(vault.cashOf(maker, address(usdc)), 0);
    }

    function test_RevertWhen_DepositZeroOrUnsupported() public {
        vm.startPrank(maker);
        vm.expectRevert(MakerVault.ZeroAmount.selector);
        vault.deposit(address(usdc), 0, maker);
        vm.expectRevert(MakerVault.UnsupportedToken.selector);
        vault.deposit(address(tsla), 1, maker);
        vm.stopPrank();
    }

    // UX02 / T02 / T03: 1,000 deposited, 600 reserved => at most 400 withdrawable
    function test_T02_T03_ReservedCashIsNotWithdrawable() public {
        _deposit(1_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.collateralAmount = 20 * SHARE;
        q.cashOut = 600 * USDC;
        q.maxDebtRepay = 400 * USDC;
        q.keeperFee = 5 * USDC;
        q.protocolFee = 1 * USDC;
        q.minNetSurplus = 0;
        _register(q);
        assertEq(vault.reservedOf(maker, address(usdc)), 600 * USDC);
        assertEq(vault.available(maker, address(usdc)), 400 * USDC);

        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(MakerVault.ReservedFunds.selector, 400 * USDC));
        vault.withdraw(address(usdc), 401 * USDC, maker);
        assertEq(vault.cashOf(maker, address(usdc)), 1_000 * USDC);

        vm.prank(maker);
        vault.withdraw(address(usdc), 400 * USDC, maker);
        assertEq(vault.available(maker, address(usdc)), 0);
    }

    // T04
    function test_T04_RegisterMoreThanAvailableReverts() public {
        _deposit(10_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote(); // needs 10,140
        bytes memory sig = _sign(q, makerPk);
        vm.expectRevert(abi.encodeWithSelector(MakerVault.ReservedFunds.selector, 10_000 * USDC));
        vault.registerQuote(q, sig);
        assertEq(vault.reservedOf(maker, address(usdc)), 0);
    }

    function test_AllowanceWithoutDepositIsNotCapacity() public {
        MakerVault.Quote memory q = _fixtureQuote();
        bytes memory sig = _sign(q, makerPk);
        vm.expectRevert(abi.encodeWithSelector(MakerVault.ReservedFunds.selector, 0));
        vault.registerQuote(q, sig);
    }

    function test_MakerCannotWithdrawAnotherMakersCash() public {
        _deposit(1_000 * USDC);
        address thief = makeAddr("thief");
        vm.prank(thief);
        vm.expectRevert(abi.encodeWithSelector(MakerVault.ReservedFunds.selector, 0));
        vault.withdraw(address(usdc), 1, thief);
    }

    // T07 (release half) / T08
    function test_T08_ReleaseExpiredIsIdempotent() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        vm.expectRevert(MakerVault.QuoteNotExpired.selector);
        vault.releaseExpired(id);

        vm.warp(block.timestamp + 61);
        address anyone = makeAddr("anyone");
        vm.prank(anyone);
        assertTrue(vault.releaseExpired(id));
        assertEq(vault.reservedOf(maker, address(usdc)), 0);
        assertEq(vault.available(maker, address(usdc)), 20_000 * USDC);
        assertEq(usdc.balanceOf(anyone), 0);

        vm.prank(anyone);
        assertFalse(vault.releaseExpired(id));
        assertEq(vault.available(maker, address(usdc)), 20_000 * USDC);
        assertEq(vault.cashOf(maker, address(usdc)), 20_000 * USDC);
    }

    // T09: changing any signed field invalidates the signature
    function test_T09_AlteredFieldsInvalidateSignature() public {
        _deposit(50_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        bytes memory sig = _sign(q, makerPk);

        MakerVault.Quote memory a = _fixtureQuote();
        a.collateralRecipient = makeAddr("attacker");
        vm.expectRevert(MakerVault.InvalidSignature.selector);
        vault.registerQuote(a, sig);

        a = _fixtureQuote();
        a.cashOut = 10_141 * USDC;
        vm.expectRevert(MakerVault.InvalidSignature.selector);
        vault.registerQuote(a, sig);

        a = _fixtureQuote();
        a.validUntil += 1;
        vm.expectRevert(MakerVault.InvalidSignature.selector);
        vault.registerQuote(a, sig);

        a = _fixtureQuote();
        a.protocolFee = 30 * USDC;
        vm.expectRevert(MakerVault.InvalidSignature.selector);
        vault.registerQuote(a, sig);

        // original still valid
        vault.registerQuote(q, sig);
    }

    // T10: domain binding (other chain / other verifying contract)
    function test_T10_ReplayOnOtherVaultOrChainFails() public {
        MakerVault other = new MakerVault(registry, gov);
        vm.prank(gov);
        other.setCashToken(address(usdc), true);
        vm.startPrank(maker);
        usdc.approve(address(other), type(uint256).max);
        other.deposit(address(usdc), 20_000 * USDC, maker);
        vm.stopPrank();
        _deposit(20_000 * USDC);

        MakerVault.Quote memory q = _fixtureQuote();
        bytes memory sig = _sign(q, makerPk);
        vm.expectRevert(MakerVault.InvalidSignature.selector);
        other.registerQuote(q, sig);

        bytes32 idHere = vault.quoteId(q);
        vm.chainId(42161);
        assertTrue(vault.quoteId(q) != idHere);
        vm.expectRevert(MakerVault.InvalidSignature.selector);
        vault.registerQuote(q, sig);
    }

    function test_NonceReplayAndDuplicateRejected() public {
        _deposit(50_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        bytes memory sig = _sign(q, makerPk);
        vault.registerQuote(q, sig);
        vm.expectRevert(MakerVault.QuoteExists.selector);
        vault.registerQuote(q, sig);

        MakerVault.Quote memory q2 = _fixtureQuote();
        q2.validUntil += 5; // different id, same nonce
        bytes memory sig2 = _sign(q2, makerPk);
        vm.expectRevert(MakerVault.NonceUsed.selector);
        vault.registerQuote(q2, sig2);
    }

    function test_MakerCanRegisterDirectlyWithoutSignature() public {
        _deposit(20_000 * USDC);
        vm.prank(maker);
        bytes32 id = vault.registerQuote(_fixtureQuote(), "");
        assertEq(uint8(vault.statusOf(id)), uint8(MakerVault.Status.Active));
    }

    function test_RevertWhen_ExpiryBeyondPolicyOrPast() public {
        _deposit(20_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.validUntil = uint64(block.timestamp + 121);
        vm.prank(maker);
        vm.expectRevert(MakerVault.InvalidExpiry.selector);
        vault.registerQuote(q, "");
        q.validUntil = uint64(block.timestamp);
        vm.prank(maker);
        vm.expectRevert(MakerVault.InvalidExpiry.selector);
        vault.registerQuote(q, "");
    }

    // Section 9 fixture: a 10,040 cashOut cannot meet the same fee and surplus requirements
    function test_RevertWhen_Fixture10040CannotCoverObligations() public {
        _deposit(20_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.cashOut = 10_040 * USDC;
        vm.prank(maker);
        vm.expectRevert(MakerVault.InvalidTerms.selector);
        vault.registerQuote(q, "");
    }

    function test_RevertWhen_ProtocolFeeBelowPolicy() public {
        _deposit(20_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.protocolFee = 10 * USDC; // policy min 10 bps of 10,140 = 10.14
        q.minNetSurplus = 80 * USDC;
        vm.prank(maker);
        vm.expectRevert(MakerVault.InvalidTerms.selector);
        vault.registerQuote(q, "");
    }

    function test_RevertWhen_AssetMismatch() public {
        _deposit(20_000 * USDC);
        MakerVault.Quote memory q = _fixtureQuote();
        q.collateralToken = address(usdc);
        vm.prank(maker);
        vm.expectRevert(MakerVault.AssetMismatch.selector);
        vault.registerQuote(q, "");
    }

    // LQ07
    function test_RevertWhen_FeeOnTransferDeposit() public {
        FeeOnTransferToken fot = new FeeOnTransferToken();
        vm.prank(gov);
        vault.setCashToken(address(fot), true);
        fot.approve(address(vault), type(uint256).max);
        vm.expectRevert(abi.encodeWithSelector(MakerVault.UnexpectedReceivedAmount.selector, 1000, 990));
        vault.deposit(address(fot), 1000, address(this));
    }

    // T27: EIP-1271 maker wallet
    function test_T27_SmartWalletMaker() public {
        uint256 ownerPk = 0xB0B;
        SmartWallet wallet = new SmartWallet(vm.addr(ownerPk));
        vm.prank(gov);
        usdc.mint(address(wallet), 20_000 * USDC);
        vm.startPrank(address(wallet));
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(address(usdc), 20_000 * USDC, address(wallet));
        vm.stopPrank();

        MakerVault.Quote memory q = _fixtureQuote();
        q.maker = address(wallet);
        bytes memory wrongSig = _sign(q, makerPk);
        bytes memory ownerSig = _sign(q, ownerPk);
        vm.expectRevert(MakerVault.InvalidSignature.selector);
        vault.registerQuote(q, wrongSig);
        bytes32 id = vault.registerQuote(q, ownerSig);
        assertEq(uint8(vault.statusOf(id)), uint8(MakerVault.Status.Active));
    }

    function test_OnlyExecutorConsumes() public {
        _deposit(20_000 * USDC);
        bytes32 id = _register(_fixtureQuote());
        vm.expectRevert(MakerVault.NotExecutor.selector);
        vault.consume(id);
        vm.prank(gov);
        vm.expectRevert(MakerVault.ExecutorAlreadySet.selector);
        vault.setExecutor(address(1));
    }

    function test_ReservationPausedBlocksRegistrationButNotWithdrawal() public {
        _deposit(20_000 * USDC);
        vm.prank(guardian);
        registry.pauseScope(marketKey, true, true);
        vm.prank(maker);
        vm.expectRevert(MakerVault.ScopePaused.selector);
        vault.registerQuote(_fixtureQuote(), "");
        vm.prank(maker);
        vault.withdraw(address(usdc), 20_000 * USDC, maker);
        assertEq(vault.cashOf(maker, address(usdc)), 0);
    }

    function testFuzz_AvailableNeverExceedsCash(uint96 dep, uint96 wd) public {
        uint256 d = bound(uint256(dep), 1, 100_000 * USDC);
        _deposit(d);
        uint256 w = bound(uint256(wd), 1, d);
        vm.prank(maker);
        vault.withdraw(address(usdc), w, maker);
        assertEq(vault.cashOf(maker, address(usdc)), d - w);
        assertGe(usdc.balanceOf(address(vault)), vault.totalLiabilities(address(usdc)));
    }
}
