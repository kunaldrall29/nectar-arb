// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {MarketParams} from "./interfaces/IMorphoLike.sol";

/// @title MarketRegistry
/// @notice Exact market identity and versioned, timelocked execution policy (MK01, MK04, SEC09).
///         Holds no funds and has no authority over lending markets, makers or borrowers.
contract MarketRegistry {
    struct Policy {
        address lendingMarket;
        MarketParams params;
        address priceSource;
        address sequencerFeed;
        uint32 sequencerGracePeriod;
        uint32 maxPriceAge;
        uint32 maxQuoteLifetime;
        uint32 adapterVersion;
        uint8 debtDecimals;
        uint8 collateralDecimals;
    }

    struct MarketState {
        Policy policy;
        bytes32 policyHash;
        uint32 policyVersion;
        bool admitted;
    }

    struct Scheduled {
        bytes32 marketKey;
        Policy policy;
        uint64 eta;
        bool done;
    }

    uint32 public constant ABSOLUTE_MAX_QUOTE_LIFETIME = 120;

    address public immutable governance;
    uint64 public immutable timelockDelay;

    mapping(bytes32 => MarketState) internal _markets;
    bytes32[] public marketKeys;
    mapping(bytes32 => Scheduled) internal _scheduled;
    uint256 public scheduleCount;

    event PolicyScheduled(bytes32 indexed scheduledId, bytes32 indexed marketKey, bytes32 policyHash, uint64 eta);
    event PolicyActivated(
        bytes32 indexed scheduledId, bytes32 indexed marketKey, bytes32 policyHash, uint32 policyVersion
    );

    error NotGovernance();
    error TooEarly(uint64 eta);
    error AlreadyActivated();
    error UnknownSchedule();
    error InvalidPolicy(string reason);

    constructor(address governance_, uint64 timelockDelay_) {
        governance = governance_;
        timelockDelay = timelockDelay_;
    }

    function computeMarketKey(address lendingMarket, MarketParams memory p) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, lendingMarket, keccak256(abi.encode(p))));
    }

    function hashPolicy(Policy memory p) public pure returns (bytes32) {
        return keccak256(abi.encode(p));
    }

    function schedulePolicy(Policy calldata policy) external returns (bytes32 scheduledId) {
        if (msg.sender != governance) revert NotGovernance();
        _validate(policy);
        bytes32 marketKey = computeMarketKey(policy.lendingMarket, policy.params);
        scheduledId = keccak256(abi.encode(marketKey, scheduleCount++));
        uint64 eta = uint64(block.timestamp) + timelockDelay;
        _scheduled[scheduledId] = Scheduled({marketKey: marketKey, policy: policy, eta: eta, done: false});
        emit PolicyScheduled(scheduledId, marketKey, hashPolicy(policy), eta);
    }

    function activatePolicy(bytes32 scheduledId) external {
        if (msg.sender != governance) revert NotGovernance();
        Scheduled storage s = _scheduled[scheduledId];
        if (s.eta == 0) revert UnknownSchedule();
        if (s.done) revert AlreadyActivated();
        if (block.timestamp < s.eta) revert TooEarly(s.eta);
        s.done = true;
        MarketState storage m = _markets[s.marketKey];
        if (!m.admitted) {
            m.admitted = true;
            marketKeys.push(s.marketKey);
        }
        m.policy = s.policy;
        m.policyHash = hashPolicy(s.policy);
        m.policyVersion += 1;
        emit PolicyActivated(scheduledId, s.marketKey, m.policyHash, m.policyVersion);
    }

    function getMarket(bytes32 marketKey) external view returns (MarketState memory) {
        return _markets[marketKey];
    }

    function getScheduled(bytes32 scheduledId) external view returns (Scheduled memory) {
        return _scheduled[scheduledId];
    }

    function marketCount() external view returns (uint256) {
        return marketKeys.length;
    }

    function _validate(Policy calldata p) internal view {
        if (p.lendingMarket == address(0) || p.lendingMarket.code.length == 0) revert InvalidPolicy("lendingMarket");
        if (p.params.loanToken == p.params.collateralToken) revert InvalidPolicy("tokens");
        if (p.priceSource != p.params.oracle) revert InvalidPolicy("feed mismatch");
        if (IERC20Metadata(p.params.loanToken).decimals() != p.debtDecimals) revert InvalidPolicy("debt decimals");
        if (IERC20Metadata(p.params.collateralToken).decimals() != p.collateralDecimals) {
            revert InvalidPolicy("collateral decimals");
        }
        if (p.maxQuoteLifetime == 0 || p.maxQuoteLifetime > ABSOLUTE_MAX_QUOTE_LIFETIME) {
            revert InvalidPolicy("quote lifetime");
        }
        if (p.maxPriceAge == 0) revert InvalidPolicy("price age");
    }
}
