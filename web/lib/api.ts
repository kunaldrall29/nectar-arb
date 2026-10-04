export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/nectar-api${path}`, { cache: "no-store" });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export type Preview = {
  network: { name: string; chainId: number };
  asset: string;
  amount: string;
  debtRepay: string;
  collateralAmount: string;
  destination: string;
  destinationLabel: string;
  expiry: string;
  fee: string;
  disabledReason: string | null;
};

export type Receipt = {
  txHash?: string;
  scenario?: string;
  route?: string;
  borrower?: string;
  debtRepaid?: string;
  collateralAmount?: string;
  keeperCompensation?: string;
  protocolFee?: string;
  surplus?: string;
  blockNumber?: string;
  cashOut?: string;
  propBid?: string;
  status?: string;
};
