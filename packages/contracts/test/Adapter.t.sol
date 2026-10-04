// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Duplicate, Nested, Unsolicited, WrongProtocol} from "../src/Errors.sol";
import {INectarExecutor} from "../src/interfaces/INectar.sol";
import {MarketParams} from "../src/interfaces/IMorpho.sol";
import {MockERC20} from "../src/mocks/Mocks.sol";
import {MorphoBlueAdapter} from "../src/MorphoBlueAdapter.sol";
import {ProtocolBase} from "./Base.sol";

contract JobExecutor is INectarExecutor {
    JobView private _job;

    function setJob(uint8 route, address pool, address swapAdapter, uint256 minSaleOut) external {
        _job = JobView({live: true, route: route, pool: pool, swapAdapter: swapAdapter, minSaleOut: minSaleOut});
    }

    function jobActive() external view returns (bool) {
        return _job.live;
    }

    function activeJob() external view returns (JobView memory) {
        return _job;
    }

    function go(MorphoBlueAdapter adapter_, MarketParams calldata params, uint256 shares, bytes calldata data) external {
        adapter_.liquidate(params, address(1), 0, shares, data);
    }

    function again(address adapter_, bytes calldata data) external {
        MarketParams memory params;
        MorphoBlueAdapter(adapter_).liquidate(params, address(1), 0, 1, data);
    }
}

contract EvilMorpho {
    uint256 public mode;
    address public token;
    address public executor;

    function set(uint256 mode_, address token_, address executor_) external {
        mode = mode_;
        token = token_;
        executor = executor_;
    }

    function liquidate(MarketParams calldata, address, uint256, uint256, bytes calldata data)
        external
        returns (uint256, uint256)
    {
        if (mode == 1) {
            JobExecutor(executor).again(msg.sender, data);
        } else {
            MockERC20(token).mint(msg.sender, 10);
            MorphoBlueAdapter(msg.sender).onMorphoLiquidate(10_000, data);
            MorphoBlueAdapter(msg.sender).onMorphoLiquidate(10_000, data);
        }
        return (10, 10_000);
    }
}

contract AdapterTest is ProtocolBase {
    function test_unsolicitedAndWrongProtocolCannotSpend() public {
        debt.mint(address(adapter), 500);
        uint256 before = debt.balanceOf(address(adapter));
        vm.prank(address(morpho));
        vm.expectRevert(Unsolicited.selector);
        adapter.onMorphoLiquidate(10_000, "");
        vm.prank(keeper);
        vm.expectRevert(WrongProtocol.selector);
        adapter.onMorphoLiquidate(10_000, "");
        assertEq(debt.balanceOf(address(adapter)), before);
        assertEq(debt.balanceOf(keeper), 0);
    }

    function test_nestedCallbackCannotSpend() public {
        (MorphoBlueAdapter nested, JobExecutor jobs,) = _evil(1);
        debt.mint(address(nested), 800);
        bytes memory data = abi.encode(uint8(1), address(0), address(0), uint256(0));
        vm.expectRevert(Nested.selector);
        jobs.go(nested, params, REPAY, data);
        assertEq(debt.balanceOf(address(nested)), 800);
    }

    function test_duplicateCallbackCannotSpend() public {
        (MorphoBlueAdapter dup, JobExecutor jobs,) = _evil(2);
        jobs.setJob(1, address(0), address(0), 0);
        debt.mint(address(dup), 10_000);
        bytes memory data = abi.encode(uint8(1), address(0), address(0), uint256(0));
        vm.expectRevert(Duplicate.selector);
        jobs.go(dup, params, REPAY, data);
        assertEq(debt.balanceOf(address(dup)), 10_000);
        assertEq(debt.balanceOf(address(morpho)), debt.balanceOf(address(morpho)));
    }

    function _evil(uint256 mode)
        internal
        returns (MorphoBlueAdapter nestedAdapter, JobExecutor jobs, EvilMorpho evil)
    {
        jobs = new JobExecutor();
        evil = new EvilMorpho();
        evil.set(mode, address(coll), address(jobs));
        nestedAdapter = new MorphoBlueAdapter(address(evil), address(jobs));
        jobs.setJob(1, address(0), address(0), 0);
    }
}
