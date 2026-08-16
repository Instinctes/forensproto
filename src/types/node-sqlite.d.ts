/**
 * Minimale Ambient-Typen für das eingebaute `node:sqlite` Modul
 * (Node.js >= 22.5). @types/node@20 kennt dieses Modul noch nicht,
 * daher liefern wir hier eine schlanke Deklaration für die von uns
 * genutzte API-Oberfläche.
 */
declare module "node:sqlite" {
  export interface StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
