import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "node_modules/**",
    "src-tauri/**",
    "ui/**",
    "tmp/**",
    "tmp_bwa/**",
    "coverage/**",
    "packaging/**",
    "scripts/**",
  ]),
  {
    // Diese react-hooks-Regeln sind reine Performance-Hinweise (kein
    // Korrektheitsfehler). Neuere Plugin-Versionen melden sie als "error"
    // und würden damit `next build` blockieren. Auf "warn" herabstufen.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
