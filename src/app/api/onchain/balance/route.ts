import { NextRequest, NextResponse } from "next/server";
import { loadOnchainApiKeys } from "@/lib/api-keys-store";

export const dynamic = "force-dynamic";

interface AddrResult {
  address: string;
  chain: "btc" | "eth" | "unknown";
  balance: string;
  unit: string;
  txCount: number;
  active: boolean;
  error?: string;
}

function detectChain(addr: string): AddrResult["chain"] {
  if (/^(bc1|[13])[a-zA-HJ-NP-Z0-9]{20,}$/.test(addr)) return "btc";
  if (/^0x[0-9a-fA-F]{40}$/.test(addr)) return "eth";
  return "unknown";
}

async function checkBtc(addr: string): Promise<AddrResult> {
  try {
    const res = await fetch(`https://mempool.space/api/address/${addr}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    const sats =
      d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum +
      d.mempool_stats.funded_txo_sum - d.mempool_stats.spent_txo_sum;
    const txCount = d.chain_stats.tx_count + d.mempool_stats.tx_count;
    return { address: addr, chain: "btc", balance: (sats / 1e8).toFixed(8), unit: "BTC", txCount, active: txCount > 0 || sats > 0 };
  } catch (e) {
    return { address: addr, chain: "btc", balance: "0", unit: "BTC", txCount: 0, active: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

async function checkEth(addr: string): Promise<AddrResult> {
  try {
    const { etherscan } = loadOnchainApiKeys();
    const keyQ = etherscan ? `&apikey=${encodeURIComponent(etherscan)}` : "";
    const balRes = await fetch(
      `https://api.etherscan.io/api?module=account&action=balance&address=${addr}&tag=latest${keyQ}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const balData = await balRes.json();
    if (balData.message === "NOTOK" && typeof balData.result === "string") {
      throw new Error(balData.result);
    }
    const wei = balData.result && /^\d+$/.test(String(balData.result)) ? BigInt(balData.result) : 0n;
    const eth = Number(wei) / 1e18;
    const txRes = await fetch(
      `https://api.etherscan.io/api?module=account&action=txlist&address=${addr}&page=1&offset=1&sort=asc${keyQ}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const txData = await txRes.json();
    const hasTx = Array.isArray(txData.result) && txData.result.length > 0;
    return { address: addr, chain: "eth", balance: eth.toFixed(6), unit: "ETH", txCount: hasTx ? 1 : 0, active: eth > 0 || hasTx };
  } catch (e) {
    return { address: addr, chain: "eth", balance: "0", unit: "ETH", txCount: 0, active: false, error: e instanceof Error ? e.message : "Fehler" };
  }
}

/**
 * Prüft den On-Chain-Wert/Status von Adressen — Grundlage für die
 * „Lohnt sich der Aufwand?"-Entscheidung vor einem Recovery-Job.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawAddrs: string[] = Array.isArray(body.addresses)
      ? body.addresses.map((a: unknown) => String(a).trim()).filter((a: string) => a.length > 0)
      : [];
    const addresses: string[] = [...new Set<string>(rawAddrs)].slice(0, 25);
    if (addresses.length === 0) {
      return NextResponse.json({ success: false, error: "Mindestens eine Adresse erforderlich" }, { status: 400 });
    }

    const results: AddrResult[] = [];
    for (const addr of addresses) {
      const chain = detectChain(addr);
      if (chain === "btc") results.push(await checkBtc(addr));
      else if (chain === "eth") results.push(await checkEth(addr));
      else results.push({ address: addr, chain: "unknown", balance: "0", unit: "", txCount: 0, active: false, error: "Unbekanntes Adressformat" });
    }

    const anyActive = results.some((r) => r.active);
    const anyBalance = results.some((r) => parseFloat(r.balance) > 0);
    const verdict = anyBalance ? "value" : anyActive ? "active" : "empty";

    return NextResponse.json({ success: true, verdict, anyActive, anyBalance, results });
  } catch {
    return NextResponse.json({ success: false, error: "On-Chain-Prüfung fehlgeschlagen" }, { status: 500 });
  }
}
