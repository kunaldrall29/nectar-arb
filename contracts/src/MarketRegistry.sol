// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Types} from "./Types.sol";
import {QuoteLib} from "./libraries/QuoteLib.sol";
import {Unauthorized, UNSUPPORTED_MARKET, SCOPE_PAUSED, PolicyNotReady, InvalidQuote} from "./Errors.sol";

/// @notice Exact market identity, adapters, versioned policy, and scoped pauses.
/// @dev Cannot transfer maker funds. Policy updates are timelocked after first admission.
contract MarketRegistry {
    address public owner;
    address public guardian;
    address public recovery;
    uint256 public policyDelay;

    mapping(bytes32 => Types.Market) public markets;
    mapping(bytes32 => Types.Policy) public policies;
    mapping(bytes32 => bool) public paused;

    uint256 public scheduledCount;

    struct ScheduledPolicy {
        bytes32 marketKey;
        Types.Policy policy;
        uint256 eta;
        bool consumed;
        bool exists;
    }

    mapping(bytes32 => ScheduledPolicy) public scheduled;

    event PolicyScheduled(bytes32 indexed scheduledId, bytes32 indexed marketKey, bytes32 policyHash, uint256 eta);
    event PolicyActivated(bytes32 indexed scheduledId, bytes32 indexed marketKey, bytes32 policyHash);
    event ScopePaused(bytes32 indexed scope, bool pausedFlag, address indexed actor);
    event MarketAdmitted(bytes32 indexed marketKey, address adapter, uint256 adapterVersion, bool mockLabeled);
    event RolesUpdated(address owner, address guardian, address recovery);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address owner_, address guardian_, address recovery_, uint256 policyDelay_) {
        owner = owner_;
        guardian = guardian_;
        recovery = recovery_;
        policyDelay = policyDelay_;
    }

    function setRoles(address owner_, address guardian_, address recovery_) external onlyOwner {
        owner = owner_;
        guardian = guardian_;
        recovery = recovery_;
        emit RolesUpdated(owner_, guardian_, recovery_);
    }

    function setPolicyDelay(uint256 delay) external onlyOwner {
        policyDelay = delay;
    }

    function admitMarket(Types.Market calldata market, Types.Policy calldata policy) external onlyOwner {
        if (market.marketKey == bytes32(0) || market.adapter == address(0)) revert InvalidQuote();
        if (market.chainId != block.chainid) revert UNSUPPORTED_MARKET();
        Types.Policy memory p = policy;
        p.hash = QuoteLib.policyHash(p);
        markets[market.marketKey] = market;
        markets[market.marketKey].admitted = true;
        policies[market.marketKey] = p;
        emit MarketAdmitted(market.marketKey, market.adapter, market.adapterVersion, market.mockLabeled);
        emit PolicyActivated(bytes32(0), market.marketKey, p.hash);
    }

    function schedulePolicy(bytes32 marketKey, Types.Policy calldata policy) external onlyOwner returns (bytes32 scheduledId) {
        if (!markets[marketKey].admitted) revert UNSUPPORTED_MARKET();
        Types.Policy memory p = policy;
        p.hash = QuoteLib.policyHash(p);
        scheduledId = keccak256(abi.encode(marketKey, p.hash, block.number, scheduledCount++));
        uint256 eta = block.timestamp + policyDelay;
        scheduled[scheduledId] = ScheduledPolicy({marketKey: marketKey, policy: p, eta: eta, consumed: false, exists: true});
        emit PolicyScheduled(scheduledId, marketKey, p.hash, eta);
    }

    function activatePolicy(bytes32 scheduledId) external {
        ScheduledPolicy storage s = scheduled[scheduledId];
        if (!s.exists || s.consumed) revert PolicyNotReady();
        if (block.timestamp < s.eta) revert PolicyNotReady();
        s.consumed = true;
        policies[s.marketKey] = s.policy;
        emit PolicyActivated(scheduledId, s.marketKey, s.policy.hash);
    }

    function pauseScope(bytes32 scope) external {
        if (msg.sender != guardian && msg.sender != owner) revert Unauthorized();
        paused[scope] = true;
        emit ScopePaused(scope, true, msg.sender);
    }

    function unpauseScope(bytes32 scope) external {
        if (msg.sender != recovery && msg.sender != owner) revert Unauthorized();
        paused[scope] = false;
        emit ScopePaused(scope, false, msg.sender);
    }

    function requireNotPaused(bytes32 scope, bytes32 marketKey) external view {
        if (paused[scope] || paused[marketKey]) revert SCOPE_PAUSED();
    }

    function isPaused(bytes32 scope) external view returns (bool) {
        return paused[scope];
    }

    function getMarket(bytes32 marketKey) external view returns (Types.Market memory) {
        return markets[marketKey];
    }

    function getPolicy(bytes32 marketKey) external view returns (Types.Policy memory) {
        return policies[marketKey];
    }

    function policyHashOf(bytes32 marketKey) external view returns (bytes32) {
        return policies[marketKey].hash;
    }
}
