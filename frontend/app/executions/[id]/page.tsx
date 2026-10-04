"use client";

import { useEffect, useState } from "react";
import { explorerTx } from "@/lib/config";
import { api } from "@/lib/wallet";

export default function ExecutionDetail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api(`/receipts`).then(setData);
  }, [params.id]);
  const receipt = (data?.receipts || []).find((r: any) => r.quoteId === params.id) || data?.receipts?.[0];
  return (
    <div className="space-y-4">
      <h1 className="font-display text-4xl text-nectar-honey">Receipt</h1>
      <p className="text-sm text-nectar-mist">
        Amounts are integers in base units. Writeoffs are reported separately from recovered debt.
      </p>
      <pre className="panel overflow-auto rounded-2xl p-4 text-xs">{JSON.stringify(receipt, null, 2)}</pre>
      {receipt?.tx && (
        <a className="text-sm text-nectar-gold" href={explorerTx(receipt.tx)}>
          View transaction →
        </a>
      )}
    </div>
  );
}
