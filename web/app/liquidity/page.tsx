import Link from "next/link";

export default function LiquidityPage() {
  return (
    <>
      <h1>Liquidity</h1>
      <p className="lede">Quotes and pools are separate. A quote reserves cash in escrow. A pool is maker-owned inventory and does not mint LP shares.</p>
      <p>
        <Link href="/liquidity/quotes">Quotes</Link> · <Link href="/liquidity/pools">Pools</Link>
      </p>
    </>
  );
}
