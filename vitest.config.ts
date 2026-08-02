import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest-Konfiguration für ForensProto.
 * ======================================
 * Nur Node-Umgebung (die getesteten Module sind reine Krypto-/Logik-Bausteine,
 * kein DOM nötig). Der `@/*`-Alias spiegelt tsconfig.json, damit Tests dieselben
 * Imports wie die App nutzen können. Testdateien liegen unter test/.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: true,
  },
});
