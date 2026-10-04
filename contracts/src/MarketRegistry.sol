// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MarketParams} from "./lending/IMiniMorpho.sol";
import {MiniMorpho} from "./lending/MiniMorpho.sol";

/// @title MarketRegistry
/// @notice Exact market identity, adapter id and versioned execution policy for Nectar (PRD MK01-MK05, Section 12).
/// The registry cannot move maker funds. Governance (owner) admits markets and schedules policy changes behind a
/// delay; the guardian can only pause new reservations / executions by scope.
contract MarketRegistry is Ownable2Step {
    bytes32 public constant GLOBAL_SCOPE = keccak256("NECTAR_GLOBAL_SCOPE");

    struct Policy {
        uint32 version; // assigned by the registry
        uint64 maxQuoteLifetime; // seconds
        uint64 maxPriceAge; // seconds
        uint16 minProtocolFeeBps; // of cashOut
        uint256 maxQuoteCashOut; // debt-token base units
    }

    struct MarketConfig {
        address lending; // MiniMorpho deployment
        bytes32 lendingMarketId; // Morpho market id
        MarketParams params;
        uint8 loanDecimals;
        uint8 collateralDecimals;
        bytes32 adapterId;
        string label;
        Policy policy;
        bool admitted;
    }

    struct ScheduledPolicy {
        bytes32 marketKey;
        Policy policy;
        uint64 eta;
        bool executed;
    }

    struct PauseState {
        bool reservations;
        bool executions;
    }

    address public guardian;
    address public treasury;
    uint64 public policyDelay;
    bool public keeperAllowlistEnabled;

    mapping(bytes32 => MarketConfig) internal _markets;
    bytes32[] public marketKeys;
    mapping(uint256 => ScheduledPolicy) public scheduledPolicies;
    uint256 public nextScheduledId;
    mapping(bytes32 => PauseState) public pauses;
    mapping(address => bool) public isKeeper;

    event MarketAdmitted(bytes32 indexed marketKey, address lending, bytes32 lendingMarketId, string label);
    event PolicyScheduled(uint256 indexed scheduledId, bytes32 indexed marketKey, uint32 version, uint64 eta);
    event PolicyActivated(uint256 indexed scheduledId, bytes32 indexed marketKey, uint32 version);
    event ScopePaused(bytes32 indexed scope, bool reservations, bool executions, address indexed by);
    event GuardianSet(address guardian);
    event TreasurySet(address treasury);
    event PolicyDelaySet(uint64 delay);
    event KeeperAllowlistSet(bool enabled);
    event KeeperSet(address indexed keeper, bool allowed);

    error NotGuardian();
    error UnknownMarket();
    error AlreadyAdmitted();
    error LendingMarketMissing();
    error InvalidPolicy();
    error TooEarly(uint64 eta);
    error AlreadyExecuted();
    error UnpauseRequiresGovernance();

    constructor(address owner_, address guardian_, address treasury_, uint64 policyDelay_) Ownable(owner_) {
        guardian = guardian_;
        treasury = treasury_;
        policyDelay = policyDelay_;
    }

    // ------------------------------------------------------------- admission

    function computeMarketKey(address lending, bytes32 lendingMarketId) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, lending, lendingMarketId));
    }

    /// @notice Initial admission of an exact lending market. Subsequent policy changes go through the timelock.
    function admitMarket(
        address lending,
        MarketParams calldata params,
        bytes32 adapterId,
        string calldata label,
        Policy calldata policy
    ) external onlyOwner returns (bytes32 marketKey) {
        bytes32 lendingMarketId = MiniMorpho(lending).idOf(params);
        (address loan, address coll, address oracle, uint256 lltv) = MiniMorpho(lending).marketParams(lendingMarketId);
        if (loan != params.loanToken || coll != params.collateralToken || oracle != params.oracle || lltv != params.lltv)
        {
            revert LendingMarketMissing();
        }
        _validate(policy);
        marketKey = computeMarketKey(lending, lendingMarketId);
        MarketConfig storage m = _markets[marketKey];
        if (m.admitted) revert AlreadyAdmitted();
        m.lending = lending;
        m.lendingMarketId = lendingMarketId;
        m.params = params;
        m.loanDecimals = IERC20Metadata(params.loanToken).decimals();
        m.collateralDecimals = IERC20Metadata(params.collateralToken).decimals();
        m.adapterId = adapterId;
        m.label = label;
        m.policy = policy;
        m.policy.version = 1;
        m.admitted = true;
        marketKeys.push(marketKey);
        emit MarketAdmitted(marketKey, lending, lendingMarketId, label);
        emit PolicyActivated(type(uint256).max, marketKey, 1);
    }

    function schedulePolicy(bytes32 marketKey, Policy calldata policy) external onlyOwner returns (uint256 id) {
        if (!_markets[marketKey].admitted) revert UnknownMarket();
        _validate(policy);
        id = nextScheduledId++;
        uint64 eta = uint64(block.timestamp) + policyDelay;
        scheduledPolicies[id] = ScheduledPolicy({marketKey: marketKey, policy: policy, eta: eta, executed: false});
        emit PolicyScheduled(id, marketKey, _markets[marketKey].policy.version + 1, eta);
    }

    function activatePolicy(uint256 id) external onlyOwner {
        ScheduledPolicy storage s = scheduledPolicies[id];
        if (s.eta == 0) revert UnknownMarket();
        if (s.executed) revert AlreadyExecuted();
        if (block.timestamp < s.eta) revert TooEarly(s.eta);
        s.executed = true;
        MarketConfig storage m = _markets[s.marketKey];
        uint32 v = m.policy.version + 1;
        m.policy = s.policy;
        m.policy.version = v;
        emit PolicyActivated(id, s.marketKey, v);
    }

    function _validate(Policy calldata p) internal pure {
        if (p.maxQuoteLifetime == 0 || p.maxPriceAge == 0 || p.maxQuoteCashOut == 0 || p.minProtocolFeeBps > 1000) {
            revert InvalidPolicy();
        }
    }

    // ---------------------------------------------------------------- pauses

    /// @notice Guardian or governance can pause; only governance can lift a pause (PRD Section 16).
    function pauseScope(bytes32 scope, bool reservations, bool executions) external {
        bool gov = msg.sender == owner();
        if (!gov && msg.sender != guardian) revert NotGuardian();
        PauseState storage p = pauses[scope];
        if (!gov && ((p.reservations && !reservations) || (p.executions && !executions))) {
            revert UnpauseRequiresGovernance();
        }
        p.reservations = reservations;
        p.executions = executions;
        emit ScopePaused(scope, reservations, executions, msg.sender);
    }

    function isReservationPaused(bytes32 marketKey) public view returns (bool) {
        return pauses[GLOBAL_SCOPE].reservations || pauses[marketKey].reservations;
    }

    function isExecutionPaused(bytes32 marketKey) public view returns (bool) {
        return pauses[GLOBAL_SCOPE].executions || pauses[marketKey].executions;
    }

    // ---------------------------------------------------------------- admin

    function setGuardian(address g) external onlyOwner {
        guardian = g;
        emit GuardianSet(g);
    }

    function setTreasury(address t) external onlyOwner {
        treasury = t;
        emit TreasurySet(t);
    }

    function setPolicyDelay(uint64 d) external onlyOwner {
        policyDelay = d;
        emit PolicyDelaySet(d);
    }

    function setKeeperAllowlistEnabled(bool enabled) external onlyOwner {
        keeperAllowlistEnabled = enabled;
        emit KeeperAllowlistSet(enabled);
    }

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function isKeeperAllowed(address keeper) external view returns (bool) {
        return !keeperAllowlistEnabled || isKeeper[keeper];
    }

    // ---------------------------------------------------------------- views

    function getMarket(bytes32 marketKey) external view returns (MarketConfig memory) {
        return _markets[marketKey];
    }

    function getPolicy(bytes32 marketKey) external view returns (Policy memory) {
        return _markets[marketKey].policy;
    }

    function isAdmitted(bytes32 marketKey) external view returns (bool) {
        return _markets[marketKey].admitted;
    }

    function marketCount() external view returns (uint256) {
        return marketKeys.length;
    }

    function allMarketKeys() external view returns (bytes32[] memory) {
        return marketKeys;
    }
}
