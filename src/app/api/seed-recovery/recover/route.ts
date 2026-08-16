import { NextRequest, NextResponse } from "next/server";
import { recoverMissingWords, DEFAULT_PATHS, type SeedCandidate } from "@/lib/seed-recovery";
import { appendAuditLog } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

interface EnrichedCandidate extends SeedCandidate {
  onchain?: { address: string; txCount: number; balanceBtc: string } | null;
  isMatch?: boolean;
}

/** Prüft eine BTC-Adresse on-chain (mempool.space). */
async function checkAddress(addr: string): Promise<{ txCount: number; balanceBtc: string } | null> {
  try {
    const res = await fetch(`https://mempool.space/api/address/${addr}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const d = await res.json();
    const bal =
      d.chain_stats.funded_txo_sum - d.chain_stats.spent_txo_sum +
      d.mempool_stats.funded_txo_sum - d.mempool_stats.spent_txo_sum;
    return { txCount: d.chain_stats.tx_count + d.mempool_stats.tx_count, balanceBtc: (bal / 1e8).toFixed(8) };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const words: string[] = Array.isArray(body.words) ? body.words.map((w: unknown) => String(w)) : [];
    if (words.length === 0) return NextResponse.json({ success: false, error: "words[] erforderlich" }, { status: 400 });

    const paths: string[] = Array.isArray(body.paths) && body.paths.length ? body.paths : DEFAULT_PATHS.slice(0, 1);

    let result;
    try {
      result = recoverMissingWords(words, {
        passphrase: typeof body.passphrase === "string" ? body.passphrase : "",
        paths,
        maxCandidates: typeof body.maxCandidates === "number" ? body.maxCandidates : 500,
      });
    } catch (e) {
      return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "Recovery-Fehler" }, { status: 400 });
    }

    const target = typeof body.targetAddress === "string" ? body.targetAddress.trim() : "";
    let candidates: EnrichedCandidate[] = result.candidates;
    let matched: EnrichedCandidate | null = null;

    // 1) Offline-Treffer über bekannte Zieladresse
    if (target) {
      for (const c of candidates) {
        if (c.addresses.includes(target)) {
          c.isMatch = true;
          matched = c;
        }
      }
    }

    // 2) Optional: On-Chain-Bestätigung (gebündelt, begrenzt)
    let onchainChecked = 0;
    if (body.checkOnChain && !matched) {
      const cap = Math.min(candidates.length, typeof body.maxOnChain === "number" ? body.maxOnChain : 40);
      for (let i = 0; i < cap; i++) {
        const c = candidates[i];
        const oc = await checkAddress(c.addresses[0]);
        onchainChecked++;
        if (oc) {
          c.onchain = { address: c.addresses[0], ...oc };
          if (oc.txCount > 0) {
            c.isMatch = true;
            matched = c;
            break;
          }
        }
      }
    }

    appendAuditLog({
      level: matched ? "success" : "info",
      action: "Seed-Recovery (fehlende Wörter)",
      message: `${result.unknownPositions.length} unbekannt · ${result.checksumValid} checksum-gültig${matched ? " · TREFFER bestätigt" : ""}`,
      source: "seed-recovery/recover",
    });

    // Antwort begrenzen (max 200 Kandidaten im Payload)
    if (candidates.length > 200) candidates = candidates.slice(0, 200);

    return NextResponse.json({
      success: true,
      unknownPositions: result.unknownPositions,
      totalCombinations: result.totalCombinations,
      checksumValid: result.checksumValid,
      truncated: result.truncated,
      onchainChecked,
      matched,
      candidates,
    });
  } catch {
    return NextResponse.json({ success: false, error: "Recovery fehlgeschlagen" }, { status: 500 });
  }
}
