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

-- Bewegung/Aktivitaet: Aktivitaetskalorien je Eintrag. Sie werden fuer den Tag
-- zum Gesamtverbrauch hinzugezaehlt und erhoehen so das Tagesdefizit.
CREATE TABLE IF NOT EXISTS bewegung (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mandant_id   INTEGER NOT NULL DEFAULT 1,
  datum        TEXT    NOT NULL,
  uhrzeit      TEXT    NOT NULL,
  beschreibung TEXT    NOT NULL,
  kcal         INTEGER NOT NULL DEFAULT 0,
  erstellt_am  TEXT    NOT NULL,
  geaendert_am TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_bewegung_mandant
  ON bewegung (mandant_id);
CREATE INDEX IF NOT EXISTS ix_bewegung_mandant_datum
  ON bewegung (mandant_id, datum);

-- Tagesgewicht: eine Waage-Eingabe je Tag (Gewicht in Gramm). Ein Eintrag pro
-- Tag und Mandant; wird fuer das Gewichts-Liniendiagramm ausgewertet.
CREATE TABLE IF NOT EXISTS gewicht (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  mandant_id   INTEGER NOT NULL DEFAULT 1,
  datum        TEXT    NOT NULL,
  gramm        INTEGER NOT NULL,
  erstellt_am  TEXT    NOT NULL,
  geaendert_am TEXT    NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gewicht_mandant_datum
  ON gewicht (mandant_id, datum);
CREATE INDEX IF NOT EXISTS ix_gewicht_mandant
  ON gewicht (mandant_id);

-- Zeitversionierte Vorgaben (Ziele + Gesamtumsatz). Jede Aenderung gilt ab
-- einem Stichtag (gueltig_ab); fuer einen Tag gilt die juengste Vorgabe mit
-- gueltig_ab <= Tag, fuer Tage vor der ersten Vorgabe die aelteste. So bleiben
-- vergangene Tage mit der damals gueltigen Vorgabe bewertet (z. B. sinkender
-- Gesamtumsatz bei sinkendem Gewicht).
CREATE TABLE IF NOT EXISTS vorgaben (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  mandant_id       INTEGER NOT NULL DEFAULT 1,
  gueltig_ab       TEXT    NOT NULL,
  kcal_ziel        INTEGER NOT NULL DEFAULT 0,
  kcal_ziel_typ    TEXT    NOT NULL DEFAULT 'max',
  eiweiss_ziel_dg  INTEGER NOT NULL DEFAULT 0,
  eiweiss_ziel_typ TEXT    NOT NULL DEFAULT 'min',
  gesamtumsatz     INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_vorgaben_mandant_datum
  ON vorgaben (mandant_id, gueltig_ab);
CREATE INDEX IF NOT EXISTS ix_vorgaben_mandant
  ON vorgaben (mandant_id);

-- Abnehmziele: abzunehmendes Gewicht (Gramm) ab einem Stichtag. Das noetige
-- Defizit ergibt sich aus Gewicht × 7000 kcal/kg. Aktiv ist das juengste Ziel
-- mit gueltig_ab <= heute.
CREATE TABLE IF NOT EXISTS abnehmziele (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mandant_id INTEGER NOT NULL DEFAULT 1,
  gueltig_ab TEXT    NOT NULL,
  ziel_gramm INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_abnehmziele_mandant_datum
  ON abnehmziele (mandant_id, gueltig_ab);
CREATE INDEX IF NOT EXISTS ix_abnehmziele_mandant
  ON abnehmziele (mandant_id);

-- Legacy: fruehere (nicht versionierte) Einstellungen als Key-Value. Bleibt als
-- Migrationsquelle erhalten; neue Werte laufen ueber die Tabelle vorgaben.
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

/**
 * Uebernimmt fruehere (nicht versionierte) Einstellungen aus der Legacy-Tabelle
 * `einstellungen` als erste Vorgabe (gueltig_ab = 2000-01-01, deckt damit alle
 * bereits erfassten Tage ab). Laeuft nur, solange ein Mandant noch keine
 * Vorgaben hat – ist also idempotent und ein No-Op fuer frische Datenbanken.
 */
function migriereEinstellungenZuVorgaben(db: Database): void {
  const mandanten = db
    .prepare('SELECT DISTINCT mandant_id FROM einstellungen')
    .all() as { mandant_id: number }[];
  const zielKeys = [
    'kcal_ziel',
    'kcal_ziel_typ',
    'eiweiss_ziel_dg',
    'eiweiss_ziel_typ',
    'gesamtumsatz',
  ];
  const insert = db.prepare(
    `INSERT INTO vorgaben
       (mandant_id, gueltig_ab, kcal_ziel, kcal_ziel_typ,
        eiweiss_ziel_dg, eiweiss_ziel_typ, gesamtumsatz)
     VALUES (@mandant, '2000-01-01', @kz, @kzt, @ez, @ezt, @gu)`,
  );
  for (const { mandant_id } of mandanten) {
    const hatVorgabe = db
      .prepare('SELECT 1 FROM vorgaben WHERE mandant_id = ? LIMIT 1')
      .get(mandant_id);
    if (hatVorgabe) continue;
    const rows = db
      .prepare(
        'SELECT schluessel, wert FROM einstellungen WHERE mandant_id = ?',
      )
      .all(mandant_id) as { schluessel: string; wert: string | null }[];
    const map = new Map(rows.map((r) => [r.schluessel, r.wert]));
    if (!zielKeys.some((k) => map.has(k))) continue;
    const zahl = (k: string) => {
      const n = Number(map.get(k));
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    };
    const typ = (k: string, def: string) =>
      map.get(k) === 'min' || map.get(k) === 'max' ? map.get(k) : def;
    insert.run({
      mandant: mandant_id,
      kz: zahl('kcal_ziel'),
      kzt: typ('kcal_ziel_typ', 'max'),
      ez: zahl('eiweiss_ziel_dg'),
      ezt: typ('eiweiss_ziel_typ', 'min'),
      gu: zahl('gesamtumsatz'),
    });
  }
}

export function applySchema(db: Database): void {
  db.exec(SCHEMA_SQL);
  migriereEinstellungenZuVorgaben(db);
}
