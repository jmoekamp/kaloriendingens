import type { Database } from 'better-sqlite3';
import type { Eintrag, EintragInput } from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import { badRequest, notFound } from '../errors.ts';
import { portionEiweissDg, portionKcal } from '../../shared/naehrwerte.ts';

/**
 * Zugriffsschicht fuer Tages-Eintraege (was & wann gegessen). kcal und Eiweiss
 * werden LIVE aus dem verknuepften Lebensmittel und der Menge berechnet, nicht
 * gespeichert.
 */

interface EintragRow {
  id: number;
  datum: string;
  uhrzeit: string;
  lebensmittel_id: number;
  menge_gramm: number;
  lebensmittel_name: string;
  kcal_pro_100g: number;
  eiweiss_dg_pro_100g: number;
  erstellt_am: string;
  geaendert_am: string;
}

function toEintrag(row: EintragRow): Eintrag {
  return {
    id: row.id,
    datum: row.datum,
    uhrzeit: row.uhrzeit,
    lebensmittel_id: row.lebensmittel_id,
    menge_gramm: row.menge_gramm,
    lebensmittel_name: row.lebensmittel_name,
    kcal: portionKcal(row.kcal_pro_100g, row.menge_gramm),
    eiweiss_dg: portionEiweissDg(row.eiweiss_dg_pro_100g, row.menge_gramm),
    erstellt_am: row.erstellt_am,
    geaendert_am: row.geaendert_am,
  };
}

const SELECT = `
  SELECT e.id, e.datum, e.uhrzeit, e.lebensmittel_id, e.menge_gramm,
         l.name AS lebensmittel_name, l.kcal_pro_100g, l.eiweiss_dg_pro_100g,
         e.erstellt_am, e.geaendert_am
    FROM eintraege e
    JOIN lebensmittel l ON l.id = e.lebensmittel_id
   WHERE e.mandant_id = @mandant`;

/** Alle Eintraege eines Tages, nach Uhrzeit sortiert. */
export function listEintraegeFuerTag(db: Database, datum: string): Eintrag[] {
  const rows = db
    .prepare(`${SELECT} AND e.datum = @datum ORDER BY e.uhrzeit, e.id`)
    .all({ mandant: aktuellerMandant(), datum }) as EintragRow[];
  return rows.map(toEintrag);
}

export function getEintrag(db: Database, id: number): Eintrag | undefined {
  const row = db
    .prepare(`${SELECT} AND e.id = @id`)
    .get({ mandant: aktuellerMandant(), id }) as EintragRow | undefined;
  return row ? toEintrag(row) : undefined;
}

/** Alle Tage (Datum) mit mindestens einem Eintrag, absteigend. */
export function listTageMitDaten(db: Database): string[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT datum FROM eintraege
        WHERE mandant_id = ? ORDER BY datum DESC`,
    )
    .all(aktuellerMandant()) as { datum: string }[];
  return rows.map((r) => r.datum);
}

const UHRZEIT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function pruefeEingabe(db: Database, input: EintragInput): void {
  if (!UHRZEIT_RE.test(input.uhrzeit)) {
    throw badRequest('Uhrzeit muss im Format HH:MM sein.');
  }
  if (!Number.isInteger(input.menge_gramm) || input.menge_gramm <= 0) {
    throw badRequest('Menge (g) muss eine positive Ganzzahl sein.');
  }
  const lm = db
    .prepare('SELECT id FROM lebensmittel WHERE id = ? AND mandant_id = ?')
    .get(input.lebensmittel_id, aktuellerMandant());
  if (!lm) throw badRequest('Unbekanntes Lebensmittel.');
}

export function createEintrag(db: Database, input: EintragInput): Eintrag {
  pruefeEingabe(db, input);
  const jetzt = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO eintraege
         (mandant_id, datum, uhrzeit, lebensmittel_id, menge_gramm,
          erstellt_am, geaendert_am)
       VALUES (@mandant, @datum, @uhrzeit, @lm, @menge, @jetzt, @jetzt)`,
    )
    .run({
      mandant: aktuellerMandant(),
      datum: input.datum,
      uhrzeit: input.uhrzeit,
      lm: input.lebensmittel_id,
      menge: input.menge_gramm,
      jetzt,
    });
  return getEintrag(db, Number(info.lastInsertRowid)) as Eintrag;
}

export function updateEintrag(
  db: Database,
  id: number,
  input: EintragInput,
): Eintrag {
  pruefeEingabe(db, input);
  const vorhanden = getEintrag(db, id);
  if (!vorhanden) throw notFound('Eintrag nicht gefunden.');
  db.prepare(
    `UPDATE eintraege
        SET datum = @datum, uhrzeit = @uhrzeit, lebensmittel_id = @lm,
            menge_gramm = @menge, geaendert_am = @jetzt
      WHERE id = @id AND mandant_id = @mandant`,
  ).run({
    id,
    mandant: aktuellerMandant(),
    datum: input.datum,
    uhrzeit: input.uhrzeit,
    lm: input.lebensmittel_id,
    menge: input.menge_gramm,
    jetzt: new Date().toISOString(),
  });
  return getEintrag(db, id) as Eintrag;
}

export function deleteEintrag(db: Database, id: number): void {
  const vorhanden = getEintrag(db, id);
  if (!vorhanden) throw notFound('Eintrag nicht gefunden.');
  db.prepare('DELETE FROM eintraege WHERE id = ? AND mandant_id = ?').run(
    id,
    aktuellerMandant(),
  );
}
