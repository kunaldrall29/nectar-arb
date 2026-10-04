import type { Abi } from "viem";
import raw from "./abi.json";

export const abis = raw as Record<string, Abi>;
export const quoteEscrowAbi = abis.QuoteEscrow;
export const nectarExecutorAbi = abis.NectarExecutor;
export const marketRegistryAbi = abis.MarketRegistry;
export const riskGuardAbi = abis.RiskGuard;
export const morphoBlueAdapterAbi = abis.MorphoBlueAdapter;
export const mockErc20Abi = abis.MockERC20;
export const mockOracleAbi = abis.MockOracle;
export const mockSequencerAbi = abis.MockSequencer;
export const mockMorphoAbi = abis.MockMorpho;
export const mockAmmAbi = abis.MockAMM;
