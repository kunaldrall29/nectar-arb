// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {
    BadParameter,
    BadScale,
    CorporateAction,
    PriceFuture,
    PriceNonpositive,
    PriceStale,
    PriceUnavailable,
    SequencerDown,
    SequencerGrace,
    SessionClosed,
    ZeroAddress
} from "./Errors.sol";
import {INectarOracle, ISequencerUptime} from "./interfaces/INectar.sol";

/// @notice Rejects stale, nonpositive, and future prices. A feed multiplier is applied once, inside the
///         oracle adapter that produces `answer`. This guard returns that answer unchanged when `scale`
///         equals the policy's `feedScale`. It does not multiply again.
///
///         Sequencer grace (Arbitrum-style uptime feed):
///         `answer == 0` means the sequencer is up and `answer == 1` means it is down.
///         After it returns, prices stay invalid until `block.timestamp - startedAt > gracePeriod`.
///         `gracePeriod` is the documented grace (deployment default 3600 seconds).
///         A closed session never refreshes a stale timestamp. Staleness is checked first.
contract RiskGuard is Ownable2Step {
    struct Policy {
        uint256 maxStaleness;
        bool requireSessionOpen;
        bool rejectCorporateAction;
        uint256 feedScale;
        bool exists;
    }

    ISequencerUptime public immutable sequencer;
    uint256 public immutable gracePeriod;
    mapping(bytes32 id => Policy) public policies;

    event PolicySet(bytes32 indexed id, uint256 maxStaleness, uint256 feedScale);

    constructor(address sequencer_, uint256 gracePeriod_) Ownable(msg.sender) {
        sequencer = ISequencerUptime(sequencer_);
        gracePeriod = gracePeriod_;
    }

    function setPolicy(bytes32 id, Policy calldata policy) external onlyOwner {
        if (id == bytes32(0) || policy.feedScale == 0 || policy.maxStaleness == 0) revert BadParameter();
        policies[id] = policy;
        policies[id].exists = true;
        emit PolicySet(id, policy.maxStaleness, policy.feedScale);
    }

    function verify(bytes32 policyId, address oracle) external view returns (uint256 price) {
        if (oracle == address(0)) revert ZeroAddress();
        Policy memory policy = policies[policyId];
        if (!policy.exists) revert BadParameter();
        _sequencer();
        (int256 answer, uint256 updatedAt, uint256 scale, bool sessionOpen, bool corporateAction) =
            INectarOracle(oracle).latest();
        if (answer <= 0) revert PriceNonpositive();
        if (updatedAt == 0) revert PriceUnavailable();
        if (updatedAt > block.timestamp) revert PriceFuture();
        if (block.timestamp - updatedAt > policy.maxStaleness) revert PriceStale();
        if (policy.rejectCorporateAction && corporateAction) revert CorporateAction();
        if (policy.requireSessionOpen && !sessionOpen) revert SessionClosed();
        if (scale != policy.feedScale) revert BadScale();
        price = uint256(answer);
    }

    function tryVerify(bytes32 policyId, address oracle) external view returns (bool ok, uint256 price) {
        try this.verify(policyId, oracle) returns (uint256 got) {
            return (true, got);
        } catch {
            return (false, 0);
        }
    }

    function _sequencer() internal view {
        if (address(sequencer) == address(0)) return;
        (, int256 answer, uint256 startedAt,,) = sequencer.latestRoundData();
        if (answer != 0) revert SequencerDown();
        if (startedAt == 0 || block.timestamp < startedAt) revert SequencerDown();
        if (block.timestamp - startedAt <= gracePeriod) revert SequencerGrace();
    }
}
