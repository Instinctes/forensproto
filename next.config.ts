import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" erzeugt einen minimalen, in sich geschlossenen Server
  // (.next/standalone/server.js + nur die tatsächlich benötigten
  // node_modules) statt des vollen 500+ MB node_modules-Ordners. Das ist
  // die Voraussetzung dafür, die native macOS-App als Tauri-Resource zu
  // bündeln und vollständig unabhängig vom Source-/Projektordner laufen
  // zu lassen (siehe packaging/prepare-bundle.sh, src-tauri/src/main.rs).
  // Wirkt sich NICHT auf `npm run dev` aus — nur `npm run build` erzeugt
  // zusätzlich den .next/standalone-Ordner.
  output: "standalone",
};

export default nextConfig;
