/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  let tempFilePath = "";

  try {
    const formData = await request.formData();
    const file = formData.get("wallet") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Keine Wallet hochgeladen" }, { status: 400 });
    }

    // Save uploaded file to a temporary location
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "alphaforensic-extract-"));
    tempFilePath = path.join(tempDir, file.name || "wallet.dat");
    
    await fs.writeFile(tempFilePath, buffer);

    // Call Python extraction script
    const pyScript = path.join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "extract_wallet_data.py");
    const { stdout, stderr } = await execAsync(`python3 "${pyScript}" "${tempFilePath}"`);

    const result = JSON.parse(stdout);

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Fehler beim Extrahieren" }, { status: 500 });
    }

    // Cleanup happens in finally block
    return NextResponse.json(result);

  } catch (error: unknown) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      { error: "Interner Server Fehler bei der Analyse" },
      { status: 500 }
    );
  } finally {
    // Zero-Persistence Cleanup
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
        await fs.rmdir(path.dirname(tempFilePath));
      } catch (e) {
        console.error("Cleanup error:", e);
      }
    }
  }
}
