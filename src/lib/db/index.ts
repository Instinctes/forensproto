/**
 * ForensProto – Persistenzschicht
 * ================================
 * Einheitliche, dokumentenorientierte Speicherung für Jobs, Audit-Log,
 * Fälle, Asservate (Evidence) und Chain-of-Custody.
 *
 * Primär-Backend:  node:sqlite (eingebaut, Node >= 22.5, keine Native-Builds)
 * Fallback-Backend: atomar geschriebene JSON-Dateien (jede Node-Version)
 *
 * Jede "Collection" speichert Zeilen der Form { id, seq, data } – `data`
 * ist ein JSON-Objekt. Feld-Abfragen erfolgen in JS nach dem Laden
 * (ausreichend für den lokalen Single-User-Forensik-Workflow).
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import { createRequire } from "module";
import { getForensprotoStateDir } from "../data-dir";

export type Row<T = Record<string, unknown>> = { id: string; seq: number; data: T };

export const COLLECTIONS = [
  "jobs",
  "audit_log",
  "cases",
  "evidence",
  "custody",
  "users",
  "sessions",
  "apikeys",
  "tenants",
  "agents",
  "authorizations",
] as const;
export type Collection = (typeof COLLECTIONS)[number];

interface Backend {
  kind: "sqlite" | "json";
  all<T>(coll: Collection): Row<T>[];
  get<T>(coll: Collection, id: string): Row<T> | undefined;
  last<T>(coll: Collection): Row<T> | undefined;
  put<T>(coll: Collection, id: string, data: T): Row<T>;
  append<T>(coll: Collection, id: string, data: T): Row<T>;
  remove(coll: Collection, id: string): void;
}

// ---------------------------------------------------------------------------
// Datenverzeichnis
// ---------------------------------------------------------------------------
const DATA_DIR = getForensprotoStateDir();
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// SQLite-Backend (node:sqlite)
// ---------------------------------------------------------------------------
function createSqliteBackend(): Backend | null {
  let DatabaseSync: typeof import("node:sqlite").DatabaseSync;
  try {
    const req = createRequire(import.meta.url);
    DatabaseSync = req("node:sqlite").DatabaseSync;
  } catch {
    return null;
  }

  const db = new DatabaseSync(join(DATA_DIR, "forensproto.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  for (const coll of COLLECTIONS) {
    db.exec(
      `CREATE TABLE IF NOT EXISTS ${coll} (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, data TEXT NOT NULL);`
    );
    db.exec(`CREATE INDEX IF NOT EXISTS ${coll}_seq_idx ON ${coll}(seq);`);
  }

  const nextSeq = (coll: Collection): number => {
    const r = db.prepare(`SELECT COALESCE(MAX(seq), 0) AS m FROM ${coll}`).get() as { m: number };
    return (r?.m ?? 0) + 1;
  };

  return {
    kind: "sqlite",
    all<T>(coll: Collection): Row<T>[] {
      const rows = db.prepare(`SELECT id, seq, data FROM ${coll} ORDER BY seq ASC`).all() as Array<{
        id: string;
        seq: number;
        data: string;
      }>;
      return rows.map((r) => ({ id: r.id, seq: r.seq, data: JSON.parse(r.data) as T }));
    },
    get<T>(coll: Collection, id: string): Row<T> | undefined {
      const r = db.prepare(`SELECT id, seq, data FROM ${coll} WHERE id = ?`).get(id) as
        | { id: string; seq: number; data: string }
        | undefined;
      return r ? { id: r.id, seq: r.seq, data: JSON.parse(r.data) as T } : undefined;
    },
    last<T>(coll: Collection): Row<T> | undefined {
      const r = db.prepare(`SELECT id, seq, data FROM ${coll} ORDER BY seq DESC LIMIT 1`).get() as
        | { id: string; seq: number; data: string }
        | undefined;
      return r ? { id: r.id, seq: r.seq, data: JSON.parse(r.data) as T } : undefined;
    },
    put<T>(coll: Collection, id: string, data: T): Row<T> {
      const existing = db.prepare(`SELECT seq FROM ${coll} WHERE id = ?`).get(id) as
        | { seq: number }
        | undefined;
      const seq = existing ? existing.seq : nextSeq(coll);
      db.prepare(
        `INSERT INTO ${coll} (id, seq, data) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data`
      ).run(id, seq, JSON.stringify(data));
      return { id, seq, data };
    },
    append<T>(coll: Collection, id: string, data: T): Row<T> {
      const seq = nextSeq(coll);
      db.prepare(`INSERT INTO ${coll} (id, seq, data) VALUES (?, ?, ?)`).run(
        id,
        seq,
        JSON.stringify(data)
      );
      return { id, seq, data };
    },
    remove(coll: Collection, id: string): void {
      db.prepare(`DELETE FROM ${coll} WHERE id = ?`).run(id);
    },
  };
}

// ---------------------------------------------------------------------------
// JSON-Fallback-Backend (atomare Writes)
// ---------------------------------------------------------------------------
function createJsonBackend(): Backend {
  const cache = new Map<Collection, Row[]>();

  const file = (coll: Collection) => join(DATA_DIR, `${coll}.json`);

  const load = (coll: Collection): Row[] => {
    if (cache.has(coll)) return cache.get(coll)!;
    let rows: Row[] = [];
    try {
      if (existsSync(file(coll))) rows = JSON.parse(readFileSync(file(coll), "utf-8")) as Row[];
    } catch {
      rows = [];
    }
    cache.set(coll, rows);
    return rows;
  };

  const persist = (coll: Collection, rows: Row[]) => {
    cache.set(coll, rows);
    const tmp = file(coll) + ".tmp";
    writeFileSync(tmp, JSON.stringify(rows));
    renameSync(tmp, file(coll)); // atomarer Austausch
  };

  const nextSeq = (rows: Row[]) => rows.reduce((m, r) => Math.max(m, r.seq), 0) + 1;

  return {
    kind: "json",
    all<T>(coll: Collection): Row<T>[] {
      return [...load(coll)].sort((a, b) => a.seq - b.seq) as Row<T>[];
    },
    get<T>(coll: Collection, id: string): Row<T> | undefined {
      return load(coll).find((r) => r.id === id) as Row<T> | undefined;
    },
    last<T>(coll: Collection): Row<T> | undefined {
      const rows = load(coll);
      if (rows.length === 0) return undefined;
      return rows.reduce((a, b) => (b.seq > a.seq ? b : a)) as Row<T>;
    },
    put<T>(coll: Collection, id: string, data: T): Row<T> {
      const rows = load(coll);
      const idx = rows.findIndex((r) => r.id === id);
      let row: Row;
      if (idx >= 0) {
        row = { ...rows[idx], data: data as Record<string, unknown> };
        rows[idx] = row;
      } else {
        row = { id, seq: nextSeq(rows), data: data as Record<string, unknown> };
        rows.push(row);
      }
      persist(coll, rows);
      return row as Row<T>;
    },
    append<T>(coll: Collection, id: string, data: T): Row<T> {
      const rows = load(coll);
      const row: Row = { id, seq: nextSeq(rows), data: data as Record<string, unknown> };
      rows.push(row);
      persist(coll, rows);
      return row as Row<T>;
    },
    remove(coll: Collection, id: string): void {
      const rows = load(coll).filter((r) => r.id !== id);
      persist(coll, rows);
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton (überlebt Next.js HMR im Dev-Modus)
// ---------------------------------------------------------------------------
const globalForDb = global as unknown as { __forensprotoDb?: Backend };

function initBackend(): Backend {
  if (process.env.FORENSPROTO_DB === "json") {
    console.log("[ForensProto DB] JSON-Backend erzwungen (FORENSPROTO_DB=json)");
    return createJsonBackend();
  }
  const sqlite = createSqliteBackend();
  if (sqlite) {
    console.log("[ForensProto DB] SQLite-Backend aktiv (.forensproto/forensproto.db)");
    return sqlite;
  }
  console.warn(
    "[ForensProto DB] node:sqlite nicht verfügbar – JSON-Fallback aktiv (Node < 22.5?). Für volle Leistung Node >= 22.5 verwenden."
  );
  return createJsonBackend();
}

export const db: Backend = globalForDb.__forensprotoDb ?? initBackend();
if (process.env.NODE_ENV !== "production") globalForDb.__forensprotoDb = db;
