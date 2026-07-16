import type { Database } from 'better-sqlite3';
import type {
  Gewicht,
  GewichtInput,
  GewichtPunkt,
} from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import { badRequest, notFound } from '../errors.ts';

/**
 * Zugriffsschicht fuer das Tagesgewicht (eine Waage-Eingabe je Tag, in Gramm).
 * Pro Tag und Mandant genau ein Eintrag (Upsert auf datum).
 */

const SELECT =
  'SELECT id, datum, gramm, erstellt_am, geaendert_am' +
  ' FROM gewicht WHERE mandant_id = @mandant';

export function getGewichtFuerTag(db: Database, datum: string): Gewicht | null {
  const row = db
    .prepare(`${SELECT} AND datum = @datum`)
    .get({ mandant: aktuellerMandant(), datum }) as Gewicht | undefined;
  return row ?? null;
}

/** Gewichtsverlauf im Zeitraum (nur Tage mit Eintrag), aufsteigend. */
export function listGewichtImZeitraum(
  db: Database,
  von: string,
  bis: string,
): GewichtPunkt[] {
  return db
    .prepare(
      `SELECT datum, gramm FROM gewicht
        WHERE mandant_id = @mandant AND datum BETWEEN @von AND @bis
        ORDER BY datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis }) as GewichtPunkt[];
}

export function upsertGewicht(db: Database, input: GewichtInput): Gewicht {
  if (!Number.isInteger(input.gramm) || input.gramm <= 0) {
    throw badRequest('Gewicht muss groesser als 0 sein.');
  }
  const jetzt = new Date().toISOString();
  db.prepare(
    `INSERT INTO gewicht (mandant_id, datum, gramm, erstellt_am, geaendert_am)
     VALUES (@mandant, @datum, @gramm, @jetzt, @jetzt)
     ON CONFLICT(mandant_id, datum)
       DO UPDATE SET gramm = excluded.gramm, geaendert_am = excluded.geaendert_am`,
  ).run({
    mandant: aktuellerMandant(),
    datum: input.datum,
    gramm: input.gramm,
    jetzt,
  });
  return getGewichtFuerTag(db, input.datum) as Gewicht;
}

export function deleteGewicht(db: Database, datum: string): void {
  const info = db
    .prepare('DELETE FROM gewicht WHERE datum = ? AND mandant_id = ?')
    .run(datum, aktuellerMandant());
  if (info.changes === 0) throw notFound('Kein Gewicht fuer diesen Tag.');
}
