// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Unauthorized} from "./Errors.sol";
import {NectarPropAMM} from "./NectarPropAMM.sol";

/// @notice Deploys maker-owned pools. Pools are not the quote escrow and do not mint LP shares.
contract NectarPropAMMFactory {
    address public immutable owner;
    address public immutable executor;
    address public immutable buyer;
    address[] public pools;

    event PoolCreated(address indexed pool, address indexed maker, address debt, address collateral);

    constructor(address executor_, address buyer_) {
        owner = msg.sender;
        executor = executor_;
        buyer = buyer_;
    }

    function poolCount() external view returns (uint256) {
        return pools.length;
    }

    function create(
        address maker,
        address debt,
        address collateral,
        address risk,
        address oracle,
        bytes32 policyId,
        address pricingUpdater,
        uint256 baseSpreadBps,
        uint256 volatilityBufferBps,
        uint256 sessionBufferBps,
        uint256 maxSkewBps,
        uint256 inventoryCap
    ) external returns (address pool) {
        if (msg.sender != maker && msg.sender != owner) revert Unauthorized();
        pool = address(
            new NectarPropAMM(
                maker,
                executor,
                buyer,
                debt,
                collateral,
                risk,
                oracle,
                policyId,
                pricingUpdater,
                baseSpreadBps,
                volatilityBufferBps,
                sessionBufferBps,
                maxSkewBps,
                inventoryCap
            )
        );
        pools.push(pool);
        emit PoolCreated(pool, maker, debt, collateral);
    }
}
