/**
 * Persistentes Server-Secret für HMAC-Session-Token.
 * Wird einmalig erzeugt und unter .forensproto/server-secret abgelegt.
 */
import { randomBytes } from "crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { getForensprotoStateDir } from "../data-dir";

const DATA_DIR = getForensprotoStateDir();
const SECRET_FILE = join(DATA_DIR, "server-secret");

const globalForSecret = global as unknown as { __forensSecret?: string };

export function getServerSecret(): string {
  if (globalForSecret.__forensSecret) return globalForSecret.__forensSecret;
  let secret: string;
  if (existsSync(SECRET_FILE)) {
    secret = readFileSync(SECRET_FILE, "utf-8").trim();
  } else {
    secret = randomBytes(48).toString("hex");
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SECRET_FILE, secret, { mode: 0o600 });
  }
  globalForSecret.__forensSecret = secret;
  return secret;
}
