// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface INectarExecutor {
    struct JobView {
        bool live;
        uint8 route;
        address pool;
        address swapAdapter;
        uint256 minSaleOut;
    }

    function jobActive() external view returns (bool);
    function activeJob() external view returns (JobView memory);
}

interface IPropAMM {
    function previewBid(uint256 collateralAmount) external view returns (uint256 debtOut, bool ok);
    function buyCollateral(uint256 collateralAmount, uint256 minDebtOut) external returns (uint256 debtOut);
}

interface IExternalSwap {
    function sell(address tokenIn, uint256 amountIn, address tokenOut, uint256 minOut, bytes calldata data)
        external
        returns (uint256 amountOut);
}

interface INectarOracle {
    function latest()
        external
        view
        returns (int256 answer, uint256 updatedAt, uint256 scale, bool sessionOpen, bool corporateAction);
}

interface ISequencerUptime {
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
