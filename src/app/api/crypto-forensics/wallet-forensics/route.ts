import { NextRequest, NextResponse } from "next/server";
import { analyzeWalletForensics } from "@/lib/crypto-forensics/wallet-forensics";

interface SimpleTx {
  txid: string;
  inputs: Array<{ address: string }>;
  outputs: Array<{ address: string; value: number }>;
  timestamp?: string;
}

async function fetchAddressTxs(address: string): Promise<SimpleTx[]> {
  try {
    const res = await fetch(`https://mempool.space/api/address/${address}/txs`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    
    return data.map((tx: { txid: string; status: { block_time?: number }; vin: Array<{ prevout?: { scriptpubkey_address?: string } }>; vout: Array<{ scriptpubkey_address?: string; value?: number }> }) => ({
      txid: tx.txid,
      timestamp: tx.status.block_time ? new Date(tx.status.block_time * 1000).toISOString() : undefined,
      inputs: tx.vin.map((vin) => ({
        address: vin.prevout?.scriptpubkey_address || "",
      })),
      outputs: tx.vout.map((vout) => ({
        address: vout.scriptpubkey_address || "",
        value: vout.value || 0,
      })),
    }));
  } catch {
    return [];
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { addresses } = body;
    
    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json({ success: false, error: "Keine Adressen angegeben" }, { status: 400 });
    }
    
    const allTxs: SimpleTx[] = [];
    const seenTxids = new Set<string>();
    
    // Fetch txs for all requested addresses
    for (const addr of addresses.slice(0, 10)) { // limit to 10 addresses for performance
      const txs = await fetchAddressTxs(addr);
      for (const tx of txs) {
        if (!seenTxids.has(tx.txid)) {
          seenTxids.add(tx.txid);
          allTxs.push(tx);
        }
      }
    }
    
    if (allTxs.length === 0) {
      return NextResponse.json({ success: false, error: "Keine Transaktionen gefunden" }, { status: 404 });
    }
    
    // Run the analysis
    const analysis = analyzeWalletForensics(allTxs);
    
    return NextResponse.json({
      success: true,
      analysis,
      txCount: allTxs.length,
      addressesAnalyzed: addresses.slice(0, 10)
    });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unbekannter Fehler" }, { status: 500 });
  }
}
