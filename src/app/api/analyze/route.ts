/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { readFile } from "fs/promises";
import { analyzeEthereumKeystore, computeStrength } from "@/lib/wallet-analyzer";

const execFileAsync = promisify(execFile);

export async function POST(request: NextRequest) {
  try {
    const { filePath, walletType } = await request.json();

    if (!filePath || !walletType) {
      return NextResponse.json(
        { error: "Fehlende Parameter: filePath oder walletType" },
        { status: 400 }
      );
    }

    // 1. Bitcoin Core / Litecoin (BDB/SQLite)
    if (walletType === "bitcoin_core" || walletType === "litecoin") {
      const scriptPath = join(process.cwd(), "scripts", "bitcoin2john.py");
      
      try {
        const { stdout } = await execFileAsync("python3", [scriptPath, filePath, "--json"]);
        const [result, binaryData] = await Promise.all([
          JSON.parse(stdout),
          readFile(filePath).then(buf => import("@/lib/forensics/wallet-parser").then(m => m.WalletParser.parse(buf)))
        ]);
        
        if (result.error) {
          return NextResponse.json({ error: result.error }, { status: 400 });
        }

        const strength = computeStrength({ kdf: result.kdf, iterations: result.iterations });

        return NextResponse.json({
          success: true,
          ...result,
          binaryMetadata: binaryData,
          strength,
        });
      } catch (error: unknown) {
        console.error("bitcoin2john error:", error);
        
        // Ausgaben zusammenführen, egal wo das Python-Skript den Error hinwirft
        const anyError = error as any;
        const output = (anyError.stdout || "") + " " + (anyError.stderr || "") + " " + ((error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten") || "");
        
        let userMessage = `Hash-Extraktion fehlgeschlagen. CFE: ${(error instanceof Error ? error.message : "Ein unbekannter Fehler ist aufgetreten")}`;
        
        if (output.includes("No encrypted master key found") || output.includes("may not be encrypted")) {
            // Unverschlüsselt! Wir versuchen sofort, alle Keys zu extrahieren.
            try {
               const dumpScriptPath = join(process.cwd(), "scripts", "dump_wallet.py");
               const { stdout: dumpOut } = await execFileAsync("python3", [dumpScriptPath, filePath]);
               const dumpResult = JSON.parse(dumpOut);
               
               if (dumpResult.success && dumpResult.keys) {
                   return NextResponse.json({
                       success: true,
                       encrypted: false,
                       wallet_type: "bitcoin_core_unencrypted",
                       keys: dumpResult.keys,
                       message: "Wallet ist nicht verschlüsselt. Keys wurden erfolgreich extrahiert.",
                       format: "Berkeley DB (Unencrypted)"
                   });
               }
            } catch (dumpErr) {
               console.error("Auto-Dump error:", dumpErr);
            }

            userMessage = "Diese Wallet ist NICHT verschlüsselt. Adress-Extraktion konnte nicht generiert werden.";
        }

        return NextResponse.json(
          { error: userMessage },
          { status: 400 } // 400 statt 500
        );
      }
    }
    // 2. Ethereum Keystore (JSON)
    else if (walletType === "ethereum_keystore") {
        try {
          const content = await readFile(filePath, "utf-8");
          const ethAnalysis = analyzeEthereumKeystore(content);
          
          if (ethAnalysis.error) {
             return NextResponse.json({ error: ethAnalysis.error }, { status: 400 });
          }

          return NextResponse.json({
              success: true,
              ...ethAnalysis,
              wallet_type: "ethereum_keystore",
          });
        } catch(error) {
          return NextResponse.json({ error: "Fehler beim Lesen der Ethereum Keystore-Datei" }, { status: 500 });
        }
    }

    // Fallback für noch nicht unterstützte Formate
    return NextResponse.json(
      { error: `Die Extraktion für den Typ '${walletType}' ist noch nicht implementiert.` },
      { status: 501 }
    );
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json(
      { error: "Interner Serverfehler bei der Analyse." },
      { status: 500 }
    );
  }
}
