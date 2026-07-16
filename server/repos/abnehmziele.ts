import type { Database } from 'better-sqlite3';
import type { Abnehmziel, AbnehmzielInput } from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import { conflict, notFound } from '../errors.ts';

/**
 * Zugriffsschicht fuer Abnehmziele (abzunehmendes Gewicht ab einem Stichtag).
 * Aktiv ist das juengste Ziel mit gueltig_ab <= heute.
 */

interface AbnehmzielRow {
  id: number;
  gueltig_ab: string;
  ziel_gramm: number;
}

const SELECT =
  'SELECT id, gueltig_ab, ziel_gramm FROM abnehmziele WHERE mandant_id = @mandant';

export function listAbnehmziele(db: Database): Abnehmziel[] {
  return db
    .prepare(`${SELECT} ORDER BY gueltig_ab DESC`)
    .all({ mandant: aktuellerMandant() }) as AbnehmzielRow[];
}

/** Das fuer `heute` aktive Ziel (juengstes mit gueltig_ab <= heute) oder null. */
export function aktivesAbnehmziel(
  db: Database,
  heute: string,
): Abnehmziel | null {
  const row = db
    .prepare(
      `${SELECT} AND gueltig_ab <= @heute ORDER BY gueltig_ab DESC LIMIT 1`,
    )
    .get({ mandant: aktuellerMandant(), heute }) as AbnehmzielRow | undefined;
  return row ?? null;
}

/** Legt ein Abnehmziel fuer den Stichtag an oder ersetzt das vorhandene. */
export function upsertAbnehmziel(
  db: Database,
  input: AbnehmzielInput,
): Abnehmziel {
  if (!Number.isInteger(input.ziel_gramm) || input.ziel_gramm <= 0) {
    throw conflict('Das Abnehmziel muss groesser als 0 sein.');
  }
  db.prepare(
    `INSERT INTO abnehmziele (mandant_id, gueltig_ab, ziel_gramm)
     VALUES (@mandant, @gueltig_ab, @gramm)
     ON CONFLICT(mandant_id, gueltig_ab)
       DO UPDATE SET ziel_gramm = excluded.ziel_gramm`,
  ).run({
    mandant: aktuellerMandant(),
    gueltig_ab: input.gueltig_ab,
    gramm: input.ziel_gramm,
  });
  return db.prepare(`${SELECT} AND gueltig_ab = @gueltig_ab`).get({
    mandant: aktuellerMandant(),
    gueltig_ab: input.gueltig_ab,
  }) as Abnehmziel;
}

export function deleteAbnehmziel(db: Database, id: number): void {
  const info = db
    .prepare('DELETE FROM abnehmziele WHERE id = ? AND mandant_id = ?')
    .run(id, aktuellerMandant());
  if (info.changes === 0) throw notFound('Abnehmziel nicht gefunden.');
}
