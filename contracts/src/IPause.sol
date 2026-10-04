// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IPause {
    function paused() external view returns (bool);
}
