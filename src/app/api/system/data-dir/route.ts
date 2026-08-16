import { NextRequest, NextResponse } from "next/server";
import { existsSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import {
  getDataDir,
  isDataDirOverridden,
  getForensprotoStateDir,
  getWordlistsDir,
  getRulesDir,
  getUploadsDir,
} from "@/lib/data-dir";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

/** Zeigt den aktuell wirksamen Datenspeicherort (siehe src/lib/data-dir.ts). */
export async function GET() {
  const dataDir = getDataDir();
  const paths = {
    state: getForensprotoStateDir(),
    wordlists: getWordlistsDir(),
    rules: getRulesDir(),
    uploads: getUploadsDir(),
  };
  return NextResponse.json({
    success: true,
    dataDir,
    overridden: isDataDirOverridden(),
    paths,
    exists: {
      state: existsSync(paths.state),
      wordlists: existsSync(paths.wordlists),
      rules: existsSync(paths.rules),
      uploads: existsSync(paths.uploads),
    },
    // Von src-tauri/src/main.rs beim Start gesetzt: "bundled" (native App,
    // Server aus dem App-Bundle) oder "dev" (Source-Ordner-Fallback, z.B.
    // veralteter/manuell gestarteter Prozess). Fehlt (undefined), wenn der
    // Server außerhalb der nativen App läuft, z.B. per `npm run dev` direkt.
    // Dient v.a. der Diagnose: taucht hier "dev" auf, obwohl eine frisch
    // gebaute BUNDLED-App erwartet wird, läuft höchstwahrscheinlich noch
    // ein alter Serverprozess auf dem Port (siehe Einstellungen → Speicherort).
    launchMode: process.env.FORENSPROTO_LAUNCH_MODE || null,
  });
}

/**
 * Öffnet den Datenordner im Finder. Nimmt bewusst KEINEN Pfad vom Client
 * entgegen (kein Injection-Risiko) — es wird immer der serverseitig
 * berechnete, aktuelle Datenordner geöffnet.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const target = body?.target === "wordlists" ? getWordlistsDir() : getDataDir();
  try {
    await execAsync(`open "${target.replace(/"/g, '\\"')}"`);
    return NextResponse.json({ success: true, opened: target });
  } catch {
    return NextResponse.json(
      { success: false, error: "Konnte Finder nicht öffnen (nur auf macOS verfügbar)." },
      { status: 500 }
    );
  }
}
