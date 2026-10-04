// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {NectarEscrow} from "../src/NectarEscrow.sol";
import {NectarExecutor} from "../src/NectarExecutor.sol";
import {NectarQuotes} from "../src/NectarQuotes.sol";
import {PauseGuardian} from "../src/PauseGuardian.sol";
import {QuoteLib} from "../src/QuoteLib.sol";
import {RehearsalMarket} from "../src/RehearsalMarket.sol";

/// @notice Deploys the hackathon rehearsal slice. Refuses every chain except Anvil and Arbitrum Sepolia.
contract Deploy is Script {
    uint256 internal constant U = 1e6;
    address internal constant ANVIL_MAKER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        uint256 chainId = block.chainid;
        require(chainId == 421614 || chainId == 31337, "refusing chain");

        address borrowerA = makeAddr("nectar.borrower.A");
        address borrowerB = makeAddr("nectar.borrower.B");
        address demoMaker = chainId == 31337 ? ANVIL_MAKER : deployer;

        vm.startBroadcast(pk);
        MockERC20 debt = new MockERC20("Nectar Rehearsal USD", "nUSD", 6, 100_000 * U);
        MockERC20 coll = new MockERC20("Nectar Rehearsal Collateral", "nSTK", 18, 1_000 ether);
        PauseGuardian pause = new PauseGuardian(deployer);
        RehearsalMarket market = new RehearsalMarket(
            address(debt),
            address(coll),
            deployer,
            8_000,
            500,
            2e6,
            1 hours,
            "Nectar rehearsal market"
        );
        NectarEscrow escrow = new NectarEscrow(address(pause));
        NectarQuotes quotes = new NectarQuotes(address(escrow), address(market), address(pause));
        NectarExecutor executor = new NectarExecutor(address(escrow), address(quotes), address(market), address(pause), deployer);
        escrow.wire(address(quotes), address(executor));
        quotes.setExecutor(address(executor));

        debt.mint(deployer, 200_000 * U);
        coll.mint(deployer, 100_000 ether);
        debt.mint(demoMaker, 100_000 * U);
        coll.mint(demoMaker, 1_000 ether);

        debt.approve(address(market), type(uint256).max);
        coll.approve(address(market), type(uint256).max);
        market.supply(80_000 * U);
        market.openRehearsalPosition(borrowerA, 12_000 ether, 10_000 * U);
        market.openRehearsalPosition(borrowerB, 12_000 ether, 10_000 * U);
        market.setPrice(1e6);

        debt.approve(address(escrow), type(uint256).max);
        escrow.deposit(address(debt), 10_140 * U, deployer);
        vm.stopBroadcast();

        if (vm.envOr("SEED_FILL", uint256(1)) == 1) {
            QuoteLib.Quote memory q;
            q.schemaVersion = 1;
            q.maker = deployer;
            q.makerNonce = 1;
            q.marketKey = market.marketKey();
            q.adapterVersion = 1;
            q.borrower = borrowerA;
            q.collateralToken = address(coll);
            q.collateralAmount = market.seizureFor(10_000 * U);
            q.debtToken = address(debt);
            q.cashOut = 10_140 * U;
            q.maxDebtRepay = 10_000 * U;
            q.collateralRecipient = deployer;
            q.keeperCompensation = 50 * U;
            q.protocolFee = 20 * U;
            q.minNetSurplus = 70 * U;
            q.keeperRecipient = deployer;
            q.surplusRecipient = deployer;
            q.validUntil = uint64(block.timestamp + 90);
            q.reservationId = 1;
            q.policyHash = market.policyHash();
            q.quoteNonce = 1;

            bytes32 digest = quotes.hashTypedData(q);
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
            bytes memory sig = abi.encodePacked(r, s, v);

            vm.startBroadcast(pk);
            quotes.registerQuote(q, sig);
            executor.execute(q);
            vm.stopBroadcast();
        }

        string memory json = _manifest(
            chainId,
            deployer,
            demoMaker,
            borrowerA,
            borrowerB,
            address(debt),
            address(coll),
            address(pause),
            address(market),
            address(escrow),
            address(quotes),
            address(executor)
        );
        vm.writeJson(json, "./deployments/latest.json");
        console2.log("deployer", deployer);
        console2.log("escrow", address(escrow));
        console2.log("quotes", address(quotes));
        console2.log("executor", address(executor));
        console2.log("market", address(market));
        console2.log("debt", address(debt));
        console2.log("collateral", address(coll));
        console2.log("borrowerB", borrowerB);
    }

    function _manifest(
        uint256 chainId,
        address deployer,
        address demoMaker,
        address borrowerA,
        address borrowerB,
        address debt,
        address coll,
        address pause,
        address market,
        address escrow,
        address quotes,
        address executor
    ) internal returns (string memory) {
        string memory obj = "manifest";
        vm.serializeString(obj, "scope", "hackathon-r1-single-deployment");
        vm.serializeBool(obj, "audited", false);
        vm.serializeString(
            obj,
            "label",
            "Nectar testnet prototype. Rehearsal market is not Morpho. EVM contracts are a new implementation and are not audited."
        );
        vm.serializeUint(obj, "chainId", chainId);
        vm.serializeUint(obj, "startBlock", block.number);
        vm.serializeString(obj, "commit", vm.envOr("GIT_COMMIT", string("unknown")));
        vm.serializeAddress(obj, "deployer", deployer);
        vm.serializeAddress(obj, "guardian", deployer);
        vm.serializeAddress(obj, "oracle", deployer);
        vm.serializeAddress(obj, "protocolFeeRecipient", deployer);
        vm.serializeAddress(obj, "demoMaker", demoMaker);
        vm.serializeAddress(obj, "openBorrower", borrowerB);
        vm.serializeAddress(obj, "seededBorrower", borrowerA);
        vm.serializeAddress(obj, "debtToken", debt);
        vm.serializeAddress(obj, "collateralToken", coll);
        vm.serializeUint(obj, "debtDecimals", 6);
        vm.serializeUint(obj, "collateralDecimals", 18);
        vm.serializeAddress(obj, "pauseGuardian", pause);
        vm.serializeAddress(obj, "rehearsalMarket", market);
        vm.serializeAddress(obj, "escrow", escrow);
        vm.serializeAddress(obj, "quotes", quotes);
        vm.serializeString(obj, "debtSymbol", "nUSD");
        vm.serializeString(obj, "collateralSymbol", "nSTK");
        string memory out = vm.serializeAddress(obj, "executor", executor);
        return out;
    }
}
