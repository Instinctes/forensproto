import { NextRequest, NextResponse } from "next/server";
import {
  loadOnchainApiKeys,
  saveOnchainApiKeys,
  maskKey,
} from "@/lib/api-keys-store";

export const dynamic = "force-dynamic";

/** GET — Status der gespeicherten On-Chain-API-Keys (maskiert). */
export async function GET() {
  const keys = loadOnchainApiKeys();
  return NextResponse.json({
    success: true,
    mempoolConfigured: Boolean(keys.mempool),
    etherscanConfigured: Boolean(keys.etherscan),
    mempoolMasked: maskKey(keys.mempool),
    etherscanMasked: maskKey(keys.etherscan),
    updatedAt: keys.updatedAt || null,
  });
}

/**
 * POST — speichert Keys serverseitig (lokal .forensproto/).
 * - Nicht-leerer String: Key setzen
 * - clearMempool / clearEtherscan: Key löschen
 * - Feld weggelassen/leer: unverändert
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const current = loadOnchainApiKeys();
    const next = saveOnchainApiKeys({
      mempool: body.clearMempool
        ? undefined
        : typeof body.mempool === "string" && body.mempool.trim()
          ? body.mempool.trim()
          : current.mempool,
      etherscan: body.clearEtherscan
        ? undefined
        : typeof body.etherscan === "string" && body.etherscan.trim()
          ? body.etherscan.trim()
          : current.etherscan,
    });
    return NextResponse.json({
      success: true,
      mempoolConfigured: Boolean(next.mempool),
      etherscanConfigured: Boolean(next.etherscan),
      mempoolMasked: maskKey(next.mempool),
      etherscanMasked: maskKey(next.etherscan),
      updatedAt: next.updatedAt,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Speichern fehlgeschlagen" },
      { status: 500 }
    );
  }
}
