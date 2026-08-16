import { NextRequest, NextResponse } from "next/server";
import { addressesFromPrivateHex, deriveVisualKey, SUPPORTED_SIZES } from "@/lib/visual-key";
import { lookupFundedAddresses } from "@/lib/funded-lookup";

export const dynamic = "force-dynamic";

interface AddrBalance {
  address: string;
  type: string;
  balance: string;
  unit: string;
  txCount: number;
  active: boolean;
  collision: boolean;
  error?: string;
}

/**
 * POST /api/visual-key/check
 * Body:
 *   { size, cells, salt? } | { privateKeyHex } | { addresses: string[] }
 *   optional: { checkBalance: boolean }  (Default: false)
 *
 * Standard (checkBalance=false): leitet nur den Schlüssel/die Adressen ab —
 * rein lokal, KEIN Netzwerk (für die Live-Anzeige, kein Rate-Limit).
 *
 * checkBalance=true: gleicht die Adressen OFFLINE gegen die lokale Datei
 * `funded-set/btcadresseswithbalance.txt` ab (siehe funded-lookup.ts) —
 * ersetzt die frühere Live-Abfrage gegen mempool.space.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let addresses: { address: string; type: string }[] = [];
    let keyMeta: Record<string, unknown> | null = null;

    if (typeof body.privateKeyHex === "string" && body.privateKeyHex.trim()) {
      // Modus „eigener HEX-Key": Adressen direkt aus dem Nutzer-Key ableiten
      // (KEINE CL-1-Muster-Ableitung), dann on-chain prüfen.
      let derivedRaw;
      try {
        derivedRaw = addressesFromPrivateHex(body.privateKeyHex);
      } catch (e) {
        return NextResponse.json(
          { success: false, error: e instanceof Error ? e.message : "Ungültiger Private Key" },
          { status: 400 }
        );
      }
      keyMeta = {
        algorithm: "RAW-HEX",
        version: "user-input",
        patternFingerprint: derivedRaw.privateKeyHex.slice(0, 16),
        features: null,
        privateKeyHex: derivedRaw.privateKeyHex,
        wifCompressed: derivedRaw.wifCompressed,
        wifUncompressed: derivedRaw.wifUncompressed,
        publicKeyCompressed: derivedRaw.publicKeyCompressed,
        publicKeyUncompressed: derivedRaw.publicKeyUncompressed,
        addresses: derivedRaw.addresses,
        warnings: [
          "Eigener HEX-Key: Adressen werden direkt aus dem eingegebenen Schlüssel berechnet (keine Muster-Ableitung).",
        ],
      };
      addresses = [
        { address: derivedRaw.addresses.p2pkh, type: "p2pkh" },
        { address: derivedRaw.addresses.p2pkhUncompressed, type: "p2pkh-uncompressed" },
        { address: derivedRaw.addresses.p2shP2wpkh, type: "p2sh-p2wpkh" },
        { address: derivedRaw.addresses.p2wpkh, type: "p2wpkh" },
      ];
    } else if (Array.isArray(body.addresses) && body.addresses.length > 0) {
      addresses = body.addresses
        .map((a: unknown) => String(a).trim())
        .filter(Boolean)
        .slice(0, 12)
        .map((address: string) => ({ address, type: "manual" }));
    } else if (body.size != null && Array.isArray(body.cells)) {
      const size = Number(body.size);
      if (!SUPPORTED_SIZES.includes(size as 8 | 12 | 16)) {
        return NextResponse.json(
          { success: false, error: `size muss ${SUPPORTED_SIZES.join("|")} sein` },
          { status: 400 }
        );
      }
      const derived = deriveVisualKey({
        size,
        cells: body.cells,
        salt: typeof body.salt === "string" ? body.salt : undefined,
      });
      keyMeta = {
        algorithm: derived.algorithm,
        version: derived.version,
        patternFingerprint: derived.patternFingerprint,
        features: derived.features,
        privateKeyHex: derived.privateKeyHex,
        wifCompressed: derived.wifCompressed,
        addresses: derived.addresses,
        warnings: derived.warnings,
      };
      addresses = [
        { address: derived.addresses.p2pkh, type: "p2pkh" },
        { address: derived.addresses.p2pkhUncompressed, type: "p2pkh-uncompressed" },
        { address: derived.addresses.p2shP2wpkh, type: "p2sh-p2wpkh" },
        { address: derived.addresses.p2wpkh, type: "p2wpkh" },
      ];
    } else {
      return NextResponse.json(
        {
          success: false,
          error: "Entweder {size,cells} oder {addresses[]} erforderlich",
        },
        { status: 400 }
      );
    }

    // Live-Modus (Default): nur Schlüssel/Adressen ableiten, KEINE Balance-
    // Prüfung, KEIN Netzwerk — verhindert das frühere API-Rate-Limit.
    if (body.checkBalance !== true) {
      return NextResponse.json({ success: true, checked: false, results: [], key: keyMeta });
    }

    // Offline-Balance-Prüfung gegen die lokale funded-Adressliste.
    const lookup = await lookupFundedAddresses(addresses.map((a) => a.address));

    if (!lookup.fileAvailable) {
      const results: AddrBalance[] = addresses.map((a) => ({
        address: a.address,
        type: a.type,
        balance: "0",
        unit: "BTC",
        txCount: 0,
        active: false,
        collision: false,
        error: "Adressdatei fehlt (funded-set/btcadresseswithbalance.txt)",
      }));
      return NextResponse.json({
        success: true,
        checked: true,
        source: "offline-file",
        fileAvailable: false,
        anyCollision: false,
        anyBalance: false,
        totalBtc: "0.00000000",
        verdict: "virgin",
        results,
        key: keyMeta,
      });
    }

    const results: AddrBalance[] = addresses.map((a) => {
      const hit = lookup.hits[a.address] || { found: false };
      const balance = hit.balanceBtc ?? (hit.found ? hit.balanceRaw ?? "0" : "0");
      return {
        address: a.address,
        type: a.type,
        balance,
        unit: hit.balanceBtc ? "BTC" : hit.found ? "" : "BTC",
        txCount: 0,
        // „Kollision/funded": Adresse steht in der funded-Liste.
        active: hit.found,
        collision: hit.found,
      };
    });

    const anyCollision = results.some((r) => r.collision);
    const anyBalance = results.some((r) => parseFloat(r.balance) > 0);
    const totalBtc = results
      .reduce((s, r) => s + (parseFloat(r.balance) || 0), 0)
      .toFixed(8);

    return NextResponse.json({
      success: true,
      checked: true,
      source: "offline-file",
      fileAvailable: true,
      linesScanned: lookup.linesScanned,
      anyCollision,
      anyBalance,
      totalBtc,
      verdict: anyBalance ? "funded" : anyCollision ? "used" : "virgin",
      results,
      key: keyMeta,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "On-Chain-Prüfung fehlgeschlagen" },
      { status: 500 }
    );
  }
}
