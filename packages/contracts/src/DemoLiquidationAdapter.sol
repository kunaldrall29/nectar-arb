// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Testnet adapter: simulates debt vault receiving repayment and releasing collateral
contract DemoLiquidationAdapter {
    using SafeERC20 for IERC20;

    address public immutable debtVault;
    address public immutable collateralToken;

    constructor(address debtVault_, address collateralToken_) {
        debtVault = debtVault_;
        collateralToken = collateralToken_;
    }

    /// @dev Transfer collateral to maker; debt repayment is handled by NectarExecutor via escrow
    function settleDemo(
        address,
        address,
        uint256,
        address collateralRecipient,
        uint256 collateralAmount
    ) external {
        IERC20(collateralToken).safeTransfer(collateralRecipient, collateralAmount);
    }
}
