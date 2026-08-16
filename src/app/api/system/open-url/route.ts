import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export const dynamic = "force-dynamic";

/**
 * Erlaubte Host-Allowlist für das Öffnen externer Links im Standardbrowser.
 * Bewusst eng gehalten: nur bekannte Block-Explorer, damit diese Route nicht
 * als generischer „öffne beliebige URL"-Vektor missbraucht werden kann.
 */
const ALLOWED_HOSTS = new Set([
  "mempool.space",
  "blockstream.info",
  "www.blockstream.info",
  "btc.com",
  "explorer.btc.com",
  "etherscan.io",
  "www.etherscan.io",
]);

/**
 * POST /api/system/open-url  Body: { url }
 *
 * Öffnet die URL im Standardbrowser des lokalen Rechners. Notwendig, weil in
 * der nativen App (Tauri/WKWebView) ein normaler <a target="_blank"> den Link
 * nicht im externen Browser öffnet, sondern im App-Fenster navigieren würde.
 * Läuft serverseitig (lokaler Next.js-Server = Mac des Nutzers) — dieselbe
 * Mechanik wie das Finder-Öffnen in /api/system/data-dir.
 *
 * Sicherheit: nur https + Host aus ALLOWED_HOSTS; Aufruf via execFile mit
 * Argument-Array (keine Shell) → keine Command-Injection möglich.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const raw = typeof body?.url === "string" ? body.url.trim() : "";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return NextResponse.json({ success: false, error: "Ungültige URL." }, { status: 400 });
  }

  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) {
    return NextResponse.json(
      { success: false, error: "Host nicht erlaubt (nur bekannte Block-Explorer über https)." },
      { status: 403 }
    );
  }

  try {
    if (process.platform === "darwin") {
      await execFileAsync("open", [url.toString()]);
    } else if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "start", "", url.toString()]);
    } else {
      await execFileAsync("xdg-open", [url.toString()]);
    }
    return NextResponse.json({ success: true, opened: url.toString() });
  } catch {
    return NextResponse.json(
      { success: false, error: "Konnte den Browser nicht öffnen." },
      { status: 500 }
    );
  }
}
