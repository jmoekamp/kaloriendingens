import type { Database } from 'better-sqlite3';

/**
 * Vollstaendiges SQLite-Schema fuer cal-o-matic.
 *
 * Konventionen:
 * - kcal als ganze Kilokalorien (INTEGER), Eiweiss in Dezigramm (0,1 g),
 *   Mengen in ganzen Gramm – alles als Ganzzahl, erst zur Anzeige formatiert.
 * - Datumswerte als ISO-Text (YYYY-MM-DD), Uhrzeit als HH:MM.
 * - Jede fachliche Tabelle hat mandant_id (NOT NULL, Standard 1) plus Index,
 *   sodass die Mandantentrennung ohne Migration greift.
 *
 * Das Schema ist idempotent (CREATE TABLE IF NOT EXISTS) und wird beim Start
 * angewandt.
 */
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS lebensmittel (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  mandant_id          INTEGER NOT NULL DEFAULT 1,
  name                TEXT    NOT NULL,
  kcal_pro_100g       INTEGER NOT NULL DEFAULT 0,
  eiweiss_dg_pro_100g INTEGER NOT NULL DEFAULT 0,
  erstellt_am         TEXT    NOT NULL,
  geaendert_am        TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lebensmittel_mandant_name
  ON lebensmittel (mandant_id, name);
CREATE INDEX IF NOT EXISTS ix_lebensmittel_mandant
  ON lebensmittel (mandant_id);

CREATE TABLE IF NOT EXISTS eintraege (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  mandant_id      INTEGER NOT NULL DEFAULT 1,
  datum           TEXT    NOT NULL,
  uhrzeit         TEXT    NOT NULL,
  lebensmittel_id INTEGER NOT NULL REFERENCES lebensmittel (id),
  menge_gramm     INTEGER NOT NULL DEFAULT 0,
  erstellt_am     TEXT    NOT NULL,
  geaendert_am    TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_eintraege_mandant
  ON eintraege (mandant_id);
CREATE INDEX IF NOT EXISTS ix_eintraege_mandant_datum
  ON eintraege (mandant_id, datum);
CREATE INDEX IF NOT EXISTS ix_eintraege_lebensmittel
  ON eintraege (lebensmittel_id);

CREATE TABLE IF NOT EXISTS einstellungen (
  mandant_id INTEGER NOT NULL DEFAULT 1,
  schluessel TEXT    NOT NULL,
  wert       TEXT,
  PRIMARY KEY (mandant_id, schluessel)
);

-- Nutzer & Sessions sind mandant-UEBERGREIFEND (Auth-Verwaltung, kein Fachdatum).
-- mandant_id = 0 ist der Admin-Realm (nur Nutzerverwaltung), >= 1 Daten-Mandanten.
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  mandant_id    INTEGER NOT NULL,
  username      TEXT    NOT NULL,
  password_hash TEXT    NOT NULL,
  erstellt_am   TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_username ON users (username);

CREATE TABLE IF NOT EXISTS sessions (
  token             TEXT PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  erstellt_am       TEXT    NOT NULL,
  letzte_aktivitaet TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_sessions_user ON sessions (user_id);
`;

export function applySchema(db: Database): void {
  db.exec(SCHEMA_SQL);
}
