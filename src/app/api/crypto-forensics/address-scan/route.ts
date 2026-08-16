import { NextRequest, NextResponse } from "next/server";
import { scanAddressForNonceReuse } from "@/lib/crypto-forensics/chain-sigs";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

const BTC_ADDR = /^([13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-z02-9]{11,71})$/; // P2PKH/P2SH/bech32

/**
 * Adressbasierter ECDSA-Nonce-Reuse-Scan: holt On-Chain-Signaturen einer
 * Bitcoin-Adresse, erkennt wiederverwendete Nonces und versucht die
 * Private-Key-Recovery — ohne wallet.dat-Upload.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = String(body.address || "").trim();
    if (!BTC_ADDR.test(address)) {
      return NextResponse.json({ success: false, error: "Ungültige Bitcoin-Adresse. Unterstützt: Legacy (1…), P2SH/P2SH-P2WPKH (3…), SegWit (bc1…)." }, { status: 400 });
    }
    const maxTx = typeof body.maxTx === "number" ? Math.min(Math.max(body.maxTx, 1), 200) : 50;

    const result = await scanAddressForNonceReuse(address, { maxTx });

    const recovered = result.reusedNonces.filter((r) => r.extractedPrivateKey).length;
    appendAuditLog({
      level: recovered > 0 ? "danger" : "info",
      action: "Adress-Nonce-Scan",
      message: `${address}: ${result.signatureCount} Sig / ${result.txScanned} Tx · ${result.reusedNonces.length} Reuse-Gruppen · ${recovered} Key(s) wiederhergestellt`,
      source: "crypto-forensics/address-scan",
    });

    return NextResponse.json({ success: true, ...result });
  } catch {
    return NextResponse.json({ success: false, error: "Scan fehlgeschlagen" }, { status: 500 });
  }
}
