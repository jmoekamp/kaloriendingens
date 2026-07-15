import type { Database } from 'better-sqlite3';
import type { Lebensmittel, LebensmittelInput } from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import { conflict, isUniqueViolation, notFound } from '../errors.ts';

/**
 * Zugriffsschicht fuer Lebensmittel (Stammdaten). Naehrwerte je 100 g:
 * kcal als ganze kcal, Eiweiss in Dezigramm. Alle Operationen sind auf den
 * aktuellen Mandanten (aktuellerMandant()) beschraenkt.
 */

interface LebensmittelRow {
  id: number;
  name: string;
  kcal_pro_100g: number;
  eiweiss_dg_pro_100g: number;
  erstellt_am: string;
  geaendert_am: string;
  eintrag_anzahl: number;
}

function toLebensmittel(row: LebensmittelRow): Lebensmittel {
  return {
    id: row.id,
    name: row.name,
    kcal_pro_100g: row.kcal_pro_100g,
    eiweiss_dg_pro_100g: row.eiweiss_dg_pro_100g,
    erstellt_am: row.erstellt_am,
    geaendert_am: row.geaendert_am,
    eintrag_anzahl: row.eintrag_anzahl,
  };
}

const SELECT = `
  SELECT l.id, l.name, l.kcal_pro_100g, l.eiweiss_dg_pro_100g,
         l.erstellt_am, l.geaendert_am,
         (SELECT COUNT(*) FROM eintraege e WHERE e.lebensmittel_id = l.id)
           AS eintrag_anzahl
    FROM lebensmittel l
   WHERE l.mandant_id = @mandant`;

export function listLebensmittel(db: Database): Lebensmittel[] {
  const rows = db
    .prepare(`${SELECT} ORDER BY l.name COLLATE NOCASE`)
    .all({ mandant: aktuellerMandant() }) as LebensmittelRow[];
  return rows.map(toLebensmittel);
}

export function getLebensmittel(
  db: Database,
  id: number,
): Lebensmittel | undefined {
  const row = db
    .prepare(`${SELECT} AND l.id = @id`)
    .get({ mandant: aktuellerMandant(), id }) as LebensmittelRow | undefined;
  return row ? toLebensmittel(row) : undefined;
}

function pruefeEingabe(input: LebensmittelInput): void {
  if (input.name.trim() === '') {
    throw conflict('Name darf nicht leer sein.');
  }
  if (!Number.isInteger(input.kcal_pro_100g) || input.kcal_pro_100g < 0) {
    throw conflict('kcal je 100 g muss eine nicht-negative Ganzzahl sein.');
  }
  if (
    !Number.isInteger(input.eiweiss_dg_pro_100g) ||
    input.eiweiss_dg_pro_100g < 0
  ) {
    throw conflict('Eiweiss je 100 g muss eine nicht-negative Zahl sein.');
  }
}

export function createLebensmittel(
  db: Database,
  input: LebensmittelInput,
): Lebensmittel {
  pruefeEingabe(input);
  const jetzt = new Date().toISOString();
  try {
    const info = db
      .prepare(
        `INSERT INTO lebensmittel
           (mandant_id, name, kcal_pro_100g, eiweiss_dg_pro_100g,
            erstellt_am, geaendert_am)
         VALUES (@mandant, @name, @kcal, @eiweiss, @jetzt, @jetzt)`,
      )
      .run({
        mandant: aktuellerMandant(),
        name: input.name.trim(),
        kcal: input.kcal_pro_100g,
        eiweiss: input.eiweiss_dg_pro_100g,
        jetzt,
      });
    return getLebensmittel(db, Number(info.lastInsertRowid)) as Lebensmittel;
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict(
        `Das Lebensmittel "${input.name.trim()}" gibt es bereits.`,
      );
    }
    throw e;
  }
}

export function updateLebensmittel(
  db: Database,
  id: number,
  input: LebensmittelInput,
): Lebensmittel {
  pruefeEingabe(input);
  const vorhanden = getLebensmittel(db, id);
  if (!vorhanden) throw notFound('Lebensmittel nicht gefunden.');
  try {
    db.prepare(
      `UPDATE lebensmittel
          SET name = @name, kcal_pro_100g = @kcal,
              eiweiss_dg_pro_100g = @eiweiss, geaendert_am = @jetzt
        WHERE id = @id AND mandant_id = @mandant`,
    ).run({
      id,
      mandant: aktuellerMandant(),
      name: input.name.trim(),
      kcal: input.kcal_pro_100g,
      eiweiss: input.eiweiss_dg_pro_100g,
      jetzt: new Date().toISOString(),
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict(
        `Das Lebensmittel "${input.name.trim()}" gibt es bereits.`,
      );
    }
    throw e;
  }
  return getLebensmittel(db, id) as Lebensmittel;
}

/**
 * Loescht ein Lebensmittel. Loeschschutz: solange es noch in Eintraegen
 * verwendet wird, wird das Loeschen strikt abgewiesen (Schutz vor verwaisten
 * Eintraegen) – mit Angabe, wie viele Eintraege es nutzen.
 */
export function deleteLebensmittel(db: Database, id: number): void {
  const vorhanden = getLebensmittel(db, id);
  if (!vorhanden) throw notFound('Lebensmittel nicht gefunden.');
  if ((vorhanden.eintrag_anzahl ?? 0) > 0) {
    throw conflict(
      `Das Lebensmittel wird von ${vorhanden.eintrag_anzahl} Eintrag/Eintraegen ` +
        'verwendet und kann nicht geloescht werden.',
    );
  }
  db.prepare('DELETE FROM lebensmittel WHERE id = ? AND mandant_id = ?').run(
    id,
    aktuellerMandant(),
  );
}
