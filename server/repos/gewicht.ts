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

interface GewichtRow {
  id: number;
  datum: string;
  gramm: number;
  aus_trend: number;
  erstellt_am: string;
  geaendert_am: string;
}

function toGewicht(row: GewichtRow): Gewicht {
  return {
    id: row.id,
    datum: row.datum,
    gramm: row.gramm,
    aus_trend: row.aus_trend === 1,
    erstellt_am: row.erstellt_am,
    geaendert_am: row.geaendert_am,
  };
}

const SELECT =
  'SELECT id, datum, gramm, aus_trend, erstellt_am, geaendert_am' +
  ' FROM gewicht WHERE mandant_id = @mandant';

export function getGewichtFuerTag(db: Database, datum: string): Gewicht | null {
  const row = db
    .prepare(`${SELECT} AND datum = @datum`)
    .get({ mandant: aktuellerMandant(), datum }) as GewichtRow | undefined;
  return row ? toGewicht(row) : null;
}

/**
 * Gewichtsverlauf im Zeitraum (nur Tage mit Eintrag), aufsteigend. Tage in der
 * Zukunft (datum > heute) werden ausgeschlossen – geplante Tage veraendern keine
 * Statistik/Kurve. aus_trend markiert Punkte, die nicht in die Trendlinie fliessen.
 */
export function listGewichtImZeitraum(
  db: Database,
  von: string,
  bis: string,
  heute: string,
): GewichtPunkt[] {
  const rows = db
    .prepare(
      `SELECT datum, gramm, aus_trend FROM gewicht
        WHERE mandant_id = @mandant
          AND datum BETWEEN @von AND @bis
          AND datum <= @heute
        ORDER BY datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis, heute }) as {
    datum: string;
    gramm: number;
    aus_trend: number;
  }[];
  return rows.map((r) => ({
    datum: r.datum,
    gramm: r.gramm,
    aus_trend: r.aus_trend === 1,
  }));
}

/**
 * Erste NICHT ausgeschlossene Messung im Bereich [ab, bis] (fuer das Startgewicht
 * bei Festlegung eines Abnehmziels). null, wenn keine vorhanden.
 */
export function erstesGewichtAb(
  db: Database,
  ab: string,
  bis: string,
): Gewicht | null {
  const row = db
    .prepare(
      `${SELECT} AND aus_trend = 0 AND datum >= @ab AND datum <= @bis
        ORDER BY datum ASC LIMIT 1`,
    )
    .get({ mandant: aktuellerMandant(), ab, bis }) as GewichtRow | undefined;
  return row ? toGewicht(row) : null;
}

/** Letzte NICHT ausgeschlossene Messung bis (inkl.) `bis`. null, wenn keine. */
export function letztesGewichtBis(db: Database, bis: string): Gewicht | null {
  const row = db
    .prepare(
      `${SELECT} AND aus_trend = 0 AND datum <= @bis ORDER BY datum DESC LIMIT 1`,
    )
    .get({ mandant: aktuellerMandant(), bis }) as GewichtRow | undefined;
  return row ? toGewicht(row) : null;
}

export function upsertGewicht(db: Database, input: GewichtInput): Gewicht {
  if (!Number.isInteger(input.gramm) || input.gramm <= 0) {
    throw badRequest('Gewicht muss groesser als 0 sein.');
  }
  const jetzt = new Date().toISOString();
  db.prepare(
    `INSERT INTO gewicht (mandant_id, datum, gramm, aus_trend, erstellt_am, geaendert_am)
     VALUES (@mandant, @datum, @gramm, @aus_trend, @jetzt, @jetzt)
     ON CONFLICT(mandant_id, datum)
       DO UPDATE SET gramm = excluded.gramm, aus_trend = excluded.aus_trend,
                     geaendert_am = excluded.geaendert_am`,
  ).run({
    mandant: aktuellerMandant(),
    datum: input.datum,
    gramm: input.gramm,
    aus_trend: input.aus_trend ? 1 : 0,
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
