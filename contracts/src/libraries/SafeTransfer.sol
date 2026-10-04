// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BadTokenDelta, TOKEN_RESTRICTED} from "../Errors.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";

library SafeTransfer {
    function pullExact(address token, address from, uint256 amount) internal {
        uint256 beforeBal = IERC20Minimal(token).balanceOf(address(this));
        _call(token, abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, address(this), amount));
        uint256 received = IERC20Minimal(token).balanceOf(address(this)) - beforeBal;
        if (received != amount) revert BadTokenDelta();
    }

    function pushExact(address token, address to, uint256 amount) internal {
        uint256 beforeBal = IERC20Minimal(token).balanceOf(to);
        _call(token, abi.encodeWithSelector(IERC20Minimal.transfer.selector, to, amount));
        uint256 got = IERC20Minimal(token).balanceOf(to) - beforeBal;
        if (got != amount) revert TOKEN_RESTRICTED();
    }

    function approveExact(address token, address spender, uint256 amount) internal {
        _call(token, abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, 0));
        if (amount != 0) {
            _call(token, abi.encodeWithSelector(IERC20Minimal.approve.selector, spender, amount));
        }
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok) revert TOKEN_RESTRICTED();
        if (ret.length > 0) {
            if (!abi.decode(ret, (bool))) revert TOKEN_RESTRICTED();
        }
    }
}
