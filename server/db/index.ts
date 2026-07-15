import Database from 'better-sqlite3';
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { applySchema } from './schema.ts';

/**
 * Zentrale DB-Zugriffsschicht.
 *
 * Mandantentrennung (siehe CLAUDE.md): Der Mandantenfilter wird zentral erzwungen.
 * Der aktive Mandant haengt am eingeloggten Nutzer und wird je Request ueber einen
 * AsyncLocalStorage gefuehrt (gesetzt von der Auth-Middleware). Die Repositories
 * lesen ihn ueber aktuellerMandant(), statt ihn in jede Query manuell zu streuen.
 */
export interface RequestKontext {
  /** Mandant des eingeloggten Nutzers. 0 = Admin-Realm (kein Fachdatenzugriff). */
  mandantId: number;
}

export const requestKontext = new AsyncLocalStorage<RequestKontext>();

/**
 * Liefert den Mandanten des aktuellen Requests. Fallback 1, wenn kein Kontext
 * gesetzt ist (Seed-Vorgaenge und direkte Repo-Aufrufe in Tests laufen damit
 * gegen den Standard-Daten-Mandanten 1).
 */
export function aktuellerMandant(): number {
  return requestKontext.getStore()?.mandantId ?? 1;
}

let dbInstance: Database.Database | null = null;

export interface OpenDbOptions {
  /** Pfad zur SQLite-Datei. ':memory:' fuer Tests. */
  file?: string;
}

export function openDb(options: OpenDbOptions = {}): Database.Database {
  const file =
    options.file ??
    process.env.DB_FILE ??
    resolve(process.cwd(), 'data', 'kalorien.sqlite');

  if (file !== ':memory:') {
    mkdirSync(dirname(file), { recursive: true });
  }

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

/** Liefert die geteilte DB-Instanz (lazy, einmalig geoeffnet). */
export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = openDb();
  }
  return dbInstance;
}
