// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {AlreadySet, BadMarket, BadParameter, Unauthorized, ZeroAddress} from "./Errors.sol";

/// @notice Exact Nectar market identity. Scoped pause lives here. The guardian cannot move tokens
///         or change settlement recipients; this contract has no transfer function.
contract MarketRegistry is Ownable2Step {
    struct Market {
        bytes32 marketId;
        address collateralToken;
        address debtToken;
        address adapter;
        address oracle;
        address morpho;
        address irm;
        uint256 lltv;
        uint16 policyVersion;
        bytes32 policyHash;
        bytes32 morphoMarketId;
        bool exists;
        bool paused;
    }

    address public immutable guardian;
    bool public executionPaused;
    bytes32[] private _ids;

    mapping(bytes32 id => Market) private _markets;
    mapping(bytes32 id => mapping(address asset => bool)) public admitted;

    event MarketRegistered(bytes32 indexed marketId, address indexed adapter, bytes32 policyHash, uint16 policyVersion);
    event AssetAdmitted(bytes32 indexed marketId, address indexed asset);
    event ExecutionPauseSet(bool paused);
    event MarketPauseSet(bytes32 indexed marketId, bool paused);

    constructor(address guardian_) Ownable(msg.sender) {
        if (guardian_ == address(0)) revert ZeroAddress();
        guardian = guardian_;
    }

    function marketCount() external view returns (uint256) {
        return _ids.length;
    }

    function marketIdAt(uint256 index) external view returns (bytes32) {
        return _ids[index];
    }

    function getMarket(bytes32 id) external view returns (Market memory) {
        return _markets[id];
    }

    function computeMarketId(
        address collateralToken,
        address debtToken,
        address adapter,
        address oracle,
        address morpho,
        address irm,
        uint256 lltv,
        uint16 policyVersion,
        bytes32 policyHash
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                collateralToken,
                debtToken,
                adapter,
                oracle,
                morpho,
                irm,
                lltv,
                policyVersion,
                policyHash
            )
        );
    }

    function computeMorphoId(address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(loanToken, collateralToken, oracle, irm, lltv));
    }

    function register(
        address collateralToken,
        address debtToken,
        address adapter,
        address oracle,
        address morpho,
        address irm,
        uint256 lltv,
        uint16 policyVersion,
        bytes32 policyHash
    ) external onlyOwner returns (bytes32 id) {
        if (
            collateralToken == address(0) || debtToken == address(0) || adapter == address(0) || oracle == address(0)
                || morpho == address(0)
        ) revert ZeroAddress();
        if (collateralToken == debtToken || lltv == 0 || policyVersion == 0 || policyHash == bytes32(0)) {
            revert BadParameter();
        }
        id = computeMarketId(collateralToken, debtToken, adapter, oracle, morpho, irm, lltv, policyVersion, policyHash);
        if (_markets[id].exists) revert AlreadySet();
        _markets[id] = Market({
            marketId: id,
            collateralToken: collateralToken,
            debtToken: debtToken,
            adapter: adapter,
            oracle: oracle,
            morpho: morpho,
            irm: irm,
            lltv: lltv,
            policyVersion: policyVersion,
            policyHash: policyHash,
            morphoMarketId: computeMorphoId(debtToken, collateralToken, oracle, irm, lltv),
            exists: true,
            paused: false
        });
        _ids.push(id);
        admitted[id][collateralToken] = true;
        admitted[id][debtToken] = true;
        emit MarketRegistered(id, adapter, policyHash, policyVersion);
        emit AssetAdmitted(id, collateralToken);
        emit AssetAdmitted(id, debtToken);
    }

    function admit(bytes32 id, address asset) external onlyOwner {
        if (!_markets[id].exists) revert BadMarket();
        if (asset == address(0)) revert ZeroAddress();
        if (admitted[id][asset]) revert AlreadySet();
        admitted[id][asset] = true;
        emit AssetAdmitted(id, asset);
    }

    function setExecutionPaused(bool paused_) external {
        if (msg.sender != guardian) revert Unauthorized();
        executionPaused = paused_;
        emit ExecutionPauseSet(paused_);
    }

    function setMarketPaused(bytes32 id, bool paused_) external {
        if (msg.sender != guardian) revert Unauthorized();
        if (!_markets[id].exists) revert BadMarket();
        _markets[id].paused = paused_;
        emit MarketPauseSet(id, paused_);
    }
}
