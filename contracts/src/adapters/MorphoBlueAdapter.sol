// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Types} from "../Types.sol";
import {QuoteLib} from "../libraries/QuoteLib.sol";
import {SafeTransfer} from "../libraries/SafeTransfer.sol";
import {IERC20Minimal} from "../interfaces/IERC20Minimal.sol";
import {Unauthorized, UnexpectedCallback, INSUFFICIENT_PROCEEDS, NestedJob} from "../Errors.sol";
import {MockMorpho} from "../mocks/MockMorpho.sol";
import {MockAMM} from "../mocks/MockAMM.sol";

interface INectarExecutorCb {
    function settleExpectedCallback(bytes32 jobId, uint256 repaid, Types.Quote calldata quote, uint8 routeKind)
        external;
    function activeJobId() external view returns (bytes32);
}

/// @notice Morpho Blue-style liquidation adapter. Transient custody only for the active job.
///         Collateral in → sell against reserved maker cash (or AMM estimate path) → approve exact repayment.
contract MorphoBlueAdapter {
    using SafeTransfer for address;

    address public immutable executor;
    address public immutable morpho;
    address public feeRecipient;

    bool private _inCallback;

    event AdapterSettled(bytes32 indexed jobId, uint256 repaid, uint256 surplus, uint8 routeKind);

    constructor(address executor_, address morpho_, address feeRecipient_) {
        executor = executor_;
        morpho = morpho_;
        feeRecipient = feeRecipient_;
    }

    function setFeeRecipient(address r) external {
        if (msg.sender != executor) revert Unauthorized();
        feeRecipient = r;
    }

    function execute(Types.Job calldata job, Types.Quote calldata quote, Types.Route calldata route, bytes32 morphoMarketId)
        external
    {
        if (msg.sender != executor) revert Unauthorized();
        if (_inCallback) revert NestedJob();
        bytes memory data = abi.encode(job, quote, route);
        MockMorpho(morpho).liquidate(morphoMarketId, job.borrower, job.seizedCollateral, data);
    }

    function onMorphoLiquidate(uint256 repaidAssets, bytes calldata data) external {
        if (msg.sender != morpho) revert UnexpectedCallback();
        if (_inCallback) revert NestedJob();
        _inCallback = true;

        (Types.Job memory job, Types.Quote memory quote, Types.Route memory route) =
            abi.decode(data, (Types.Job, Types.Quote, Types.Route));

        bytes32 jobId = INectarExecutorCb(executor).activeJobId();
        INectarExecutorCb(executor).settleExpectedCallback(jobId, repaidAssets, quote, route.kind);

        if (route.kind == Types.ROUTE_AMM) {
            _settleAmm(job, quote, route, repaidAssets);
        } else {
            _settleMaker(quote, repaidAssets);
        }

        quote.debtToken.approveExact(morpho, repaidAssets);

        uint256 col = IERC20Minimal(quote.collateralToken).balanceOf(address(this));
        if (col > 0) {
            quote.collateralToken.pushExact(quote.collateralRecipient, col);
        }

        _inCallback = false;
        emit AdapterSettled(jobId, repaidAssets, 0, route.kind);
    }

    function _settleMaker(Types.Quote memory quote, uint256 repaid) internal {
        if (repaid > quote.maxDebtRepay) revert INSUFFICIENT_PROCEEDS();
        uint256 bal = IERC20Minimal(quote.debtToken).balanceOf(address(this));
        uint256 obligated = repaid + quote.keeperCompensation + quote.protocolFee;
        if (bal < obligated + quote.minNetSurplus) revert INSUFFICIENT_PROCEEDS();
        uint256 surplus = bal - obligated;
        if (surplus < quote.minNetSurplus) revert INSUFFICIENT_PROCEEDS();

        if (quote.keeperCompensation > 0) {
            quote.debtToken.pushExact(quote.keeperRecipient, quote.keeperCompensation);
        }
        if (quote.protocolFee > 0) {
            address feeTo = feeRecipient == address(0) ? quote.surplusRecipient : feeRecipient;
            quote.debtToken.pushExact(feeTo, quote.protocolFee);
        }
        if (surplus > 0) {
            quote.debtToken.pushExact(quote.surplusRecipient, surplus);
        }
    }

    function _settleAmm(Types.Job memory job, Types.Quote memory quote, Types.Route memory route, uint256 repaid)
        internal
    {
        if (route.amm == address(0)) revert INSUFFICIENT_PROCEEDS();
        uint256 col = IERC20Minimal(quote.collateralToken).balanceOf(address(this));
        quote.collateralToken.approveExact(route.amm, col);
        uint256 out = MockAMM(route.amm).swap(quote.collateralToken, col, quote.debtToken, address(this));
        if (out < route.minOut) revert INSUFFICIENT_PROCEEDS();
        uint256 obligated = repaid + quote.keeperCompensation + quote.protocolFee + quote.minNetSurplus;
        if (out < obligated || repaid > job.maxDebtRepay) revert INSUFFICIENT_PROCEEDS();
        // leftover after Morpho collect + fees is surplus; Morpho collect happens after this returns
        uint256 leftover = IERC20Minimal(quote.debtToken).balanceOf(address(this));
        if (leftover < obligated) revert INSUFFICIENT_PROCEEDS();
        if (quote.keeperCompensation > 0) {
            quote.debtToken.pushExact(quote.keeperRecipient, quote.keeperCompensation);
        }
        if (quote.protocolFee > 0) {
            address feeTo = feeRecipient == address(0) ? quote.surplusRecipient : feeRecipient;
            quote.debtToken.pushExact(feeTo, quote.protocolFee);
        }
        uint256 rem = IERC20Minimal(quote.debtToken).balanceOf(address(this));
        if (rem > repaid) {
            quote.debtToken.pushExact(quote.surplusRecipient, rem - repaid);
        }
    }
}
