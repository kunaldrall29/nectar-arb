// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {
    CallbackMissing,
    CollateralMismatch,
    Duplicate,
    InsufficientProceeds,
    Mismatch,
    Nested,
    Unauthorized,
    Unsolicited,
    WrongProtocol,
    ZeroAddress
} from "./Errors.sol";
import {IExternalSwap, INectarExecutor, IPropAMM} from "./interfaces/INectar.sol";
import {IMorpho, MarketParams} from "./interfaces/IMorpho.sol";

/// @notice Liquidates through the pinned Morpho and sells collateral inside the callback when the
///         route is a pool or an external swap. Debt for a funded quote is already on this contract,
///         so that route does not flash-borrow. Unsolicited, nested, duplicate, and wrong-protocol
///         callbacks revert before they can approve or transfer assets.
contract MorphoBlueAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable morpho;
    address public immutable executor;

    uint256 private depth;
    bool private seen;
    address private loanToken;
    address private collateralToken;
    uint256 private collateralBefore;

    modifier nestGuard() {
        if (depth != 0) revert Nested();
        depth = 1;
        _;
        depth = 0;
        seen = false;
    }

    constructor(address morpho_, address executor_) {
        if (morpho_ == address(0) || executor_ == address(0)) revert ZeroAddress();
        morpho = morpho_;
        executor = executor_;
    }

    function liquidate(
        MarketParams calldata marketParams,
        address borrower,
        uint256 seizedAssets,
        uint256 repaidShares,
        bytes calldata data
    ) external nestGuard nonReentrant returns (uint256 seized, uint256 repaid) {
        if (msg.sender != executor) revert Unauthorized();
        if (data.length == 0) revert CallbackMissing();
        seen = false;
        loanToken = marketParams.loanToken;
        collateralToken = marketParams.collateralToken;
        collateralBefore = IERC20(collateralToken).balanceOf(address(this));
        (seized, repaid) = IMorpho(morpho).liquidate(marketParams, borrower, seizedAssets, repaidShares, data);
        if (!seen) revert CallbackMissing();
        uint256 debtLeft = IERC20(loanToken).balanceOf(address(this));
        uint256 collLeft = IERC20(collateralToken).balanceOf(address(this));
        IERC20(loanToken).forceApprove(morpho, 0);
        if (debtLeft != 0) IERC20(loanToken).safeTransfer(executor, debtLeft);
        if (collLeft != 0) IERC20(collateralToken).safeTransfer(executor, collLeft);
    }

    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external {
        if (msg.sender != morpho) revert WrongProtocol();
        if (depth == 0) revert Unsolicited();
        if (depth != 1) revert Nested();
        if (seen) revert Duplicate();
        seen = true;
        if (repaidAssets == 0) revert InsufficientProceeds();

        (uint8 route, address pool, address swapAdapter, uint256 minSaleOut) =
            abi.decode(data, (uint8, address, address, uint256));
        INectarExecutor.JobView memory job = INectarExecutor(executor).activeJob();
        if (!job.live || job.route != route || job.pool != pool || job.swapAdapter != swapAdapter || job.minSaleOut != minSaleOut)
        {
            revert Mismatch();
        }

        uint256 received = IERC20(collateralToken).balanceOf(address(this)) - collateralBefore;
        if (received == 0) revert CollateralMismatch();
        uint256 need = minSaleOut > repaidAssets ? minSaleOut : repaidAssets;

        if (route == 1) {
            if (IERC20(loanToken).balanceOf(address(this)) < repaidAssets) revert InsufficientProceeds();
        } else if (route == 2) {
            IERC20(collateralToken).forceApprove(pool, received);
            uint256 out = IPropAMM(pool).buyCollateral(received, need);
            IERC20(collateralToken).forceApprove(pool, 0);
            if (out < repaidAssets) revert InsufficientProceeds();
        } else if (route == 3) {
            IERC20(collateralToken).forceApprove(swapAdapter, received);
            uint256 out = IExternalSwap(swapAdapter).sell(collateralToken, received, loanToken, need, "");
            IERC20(collateralToken).forceApprove(swapAdapter, 0);
            if (out < repaidAssets) revert InsufficientProceeds();
        } else {
            revert Mismatch();
        }

        IERC20(loanToken).forceApprove(morpho, repaidAssets);
    }
}
