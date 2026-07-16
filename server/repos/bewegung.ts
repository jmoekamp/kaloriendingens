import type { Database } from 'better-sqlite3';
import type { Bewegung, BewegungInput } from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import { badRequest, notFound } from '../errors.ts';

/**
 * Zugriffsschicht fuer Bewegung/Aktivitaet. Die Aktivitaetskalorien werden je Tag
 * zum Gesamtverbrauch hinzugezaehlt (siehe Defizit-/Fortschrittsrechnung).
 */

const UHRZEIT_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const SELECT =
  'SELECT id, datum, uhrzeit, beschreibung, kcal, erstellt_am, geaendert_am' +
  ' FROM bewegung WHERE mandant_id = @mandant';

export function listBewegungFuerTag(db: Database, datum: string): Bewegung[] {
  return db
    .prepare(`${SELECT} AND datum = @datum ORDER BY uhrzeit, id`)
    .all({ mandant: aktuellerMandant(), datum }) as Bewegung[];
}

export function getBewegung(db: Database, id: number): Bewegung | undefined {
  return db.prepare(`${SELECT} AND id = @id`).get({
    mandant: aktuellerMandant(),
    id,
  }) as Bewegung | undefined;
}

/**
 * Aktivitaetskalorien je Tag (Summe) im Zeitraum. von/bis = null bedeutet ohne
 * Datumsgrenze. Rueckgabe als Map datum -> kcal fuer die Defizitrechnung.
 */
export function bewegungKcalProTag(
  db: Database,
  von: string | null,
  bis: string | null,
): Map<string, number> {
  const bereich =
    von !== null && bis !== null ? 'AND datum BETWEEN @von AND @bis' : '';
  const rows = db
    .prepare(
      `SELECT datum, SUM(kcal) AS kcal FROM bewegung
        WHERE mandant_id = @mandant ${bereich}
        GROUP BY datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis }) as {
    datum: string;
    kcal: number;
  }[];
  return new Map(rows.map((r) => [r.datum, r.kcal]));
}

function pruefeEingabe(input: BewegungInput): void {
  if (!UHRZEIT_RE.test(input.uhrzeit)) {
    throw badRequest('Uhrzeit muss im Format HH:MM sein.');
  }
  if (input.beschreibung.trim() === '') {
    throw badRequest('Beschreibung darf nicht leer sein.');
  }
  if (!Number.isInteger(input.kcal) || input.kcal <= 0) {
    throw badRequest(
      'Aktivitaetskalorien muessen eine positive Ganzzahl sein.',
    );
  }
}

export function createBewegung(db: Database, input: BewegungInput): Bewegung {
  pruefeEingabe(input);
  const jetzt = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO bewegung
         (mandant_id, datum, uhrzeit, beschreibung, kcal, erstellt_am, geaendert_am)
       VALUES (@mandant, @datum, @uhrzeit, @beschreibung, @kcal, @jetzt, @jetzt)`,
    )
    .run({
      mandant: aktuellerMandant(),
      datum: input.datum,
      uhrzeit: input.uhrzeit,
      beschreibung: input.beschreibung.trim(),
      kcal: input.kcal,
      jetzt,
    });
  return getBewegung(db, Number(info.lastInsertRowid)) as Bewegung;
}

export function updateBewegung(
  db: Database,
  id: number,
  input: BewegungInput,
): Bewegung {
  pruefeEingabe(input);
  if (!getBewegung(db, id)) throw notFound('Bewegung nicht gefunden.');
  db.prepare(
    `UPDATE bewegung
        SET datum = @datum, uhrzeit = @uhrzeit, beschreibung = @beschreibung,
            kcal = @kcal, geaendert_am = @jetzt
      WHERE id = @id AND mandant_id = @mandant`,
  ).run({
    id,
    mandant: aktuellerMandant(),
    datum: input.datum,
    uhrzeit: input.uhrzeit,
    beschreibung: input.beschreibung.trim(),
    kcal: input.kcal,
    jetzt: new Date().toISOString(),
  });
  return getBewegung(db, id) as Bewegung;
}

export function deleteBewegung(db: Database, id: number): void {
  const info = db
    .prepare('DELETE FROM bewegung WHERE id = ? AND mandant_id = ?')
    .run(id, aktuellerMandant());
  if (info.changes === 0) throw notFound('Bewegung nicht gefunden.');
}
