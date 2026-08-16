import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { detectWalletType } from "@/lib/wallet-analyzer";
import { tmpdir } from "os";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "Es wurde keine Datei übertragen." },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Temporäres Verzeichnis für diesen Job erstellen
    const jobId = randomUUID();
    const tempDir = join(tmpdir(), "alphaforensic", jobId);
    await mkdir(tempDir, { recursive: true });
    
    // Datei speichern
    const filePath = join(tempDir, file.name);
    await writeFile(filePath, buffer);

    // Binary-Analyse durchführen
    const analysis = detectWalletType(buffer, file.name);

    return NextResponse.json({
      success: true,
      jobId,
      filePath,
      filename: file.name,
      fileSize: file.size,
      walletType: analysis.type,
      format: analysis.format,
    });
  } catch (error) {
    console.error("Upload Fehler:", error);
    return NextResponse.json(
      { error: "Fehler bei der Dateiverarbeitung auf dem Server." },
      { status: 500 }
    );
  }
}
