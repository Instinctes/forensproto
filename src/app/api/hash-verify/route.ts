import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "Keine Datei hochgeladen" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const md5 = crypto.createHash("md5").update(buffer).digest("hex");
    const sha1 = crypto.createHash("sha1").update(buffer).digest("hex");
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    return NextResponse.json({
      success: true,
      filename: file.name,
      fileSize: buffer.length,
      hashes: { md5, sha1, sha256 },
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : "Hash-Berechnung fehlgeschlagen",
    }, { status: 500 });
  }
}
