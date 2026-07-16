import type { Database } from 'better-sqlite3';
import type {
  Einstellungen,
  Vorgabe,
  VorgabeInput,
} from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import { notFound } from '../errors.ts';

/**
 * Zugriffsschicht fuer die zeitversionierten Vorgaben (Ziele + Gesamtumsatz).
 * Jede Vorgabe gilt ab ihrem Stichtag (gueltig_ab). Fuer einen Tag gilt die
 * juengste Vorgabe mit gueltig_ab <= Tag; fuer Tage vor der ersten Vorgabe die
 * aelteste (so ist jeder erfasste Tag bewertbar).
 */
export const VORGABE_DEFAULTS: Einstellungen = {
  kcal_ziel: 0,
  kcal_ziel_typ: 'max',
  eiweiss_ziel_dg: 0,
  eiweiss_ziel_typ: 'min',
  gesamtumsatz: 0,
};

interface VorgabeRow {
  id: number;
  gueltig_ab: string;
  kcal_ziel: number;
  kcal_ziel_typ: string;
  eiweiss_ziel_dg: number;
  eiweiss_ziel_typ: string;
  gesamtumsatz: number;
}

function toVorgabe(row: VorgabeRow): Vorgabe {
  return {
    id: row.id,
    gueltig_ab: row.gueltig_ab,
    kcal_ziel: row.kcal_ziel,
    kcal_ziel_typ: row.kcal_ziel_typ === 'min' ? 'min' : 'max',
    eiweiss_ziel_dg: row.eiweiss_ziel_dg,
    eiweiss_ziel_typ: row.eiweiss_ziel_typ === 'max' ? 'max' : 'min',
    gesamtumsatz: row.gesamtumsatz,
  };
}

const SELECT = `SELECT id, gueltig_ab, kcal_ziel, kcal_ziel_typ,
       eiweiss_ziel_dg, eiweiss_ziel_typ, gesamtumsatz
  FROM vorgaben WHERE mandant_id = @mandant`;

/** Alle Vorgaben des Mandanten, absteigend nach Stichtag (neueste zuerst). */
export function listVorgaben(db: Database): Vorgabe[] {
  const rows = db
    .prepare(`${SELECT} ORDER BY gueltig_ab DESC`)
    .all({ mandant: aktuellerMandant() }) as VorgabeRow[];
  return rows.map(toVorgabe);
}

/** Vorgaben aufsteigend nach Stichtag (fuer die Tages-Zuordnung). */
export function ladeVersionenAsc(db: Database): Vorgabe[] {
  const rows = db
    .prepare(`${SELECT} ORDER BY gueltig_ab ASC`)
    .all({ mandant: aktuellerMandant() }) as VorgabeRow[];
  return rows.map(toVorgabe);
}

/**
 * Waehlt aus aufsteigend sortierten Versionen die fuer `datum` gueltige aus:
 * die juengste mit gueltig_ab <= datum; gibt es keine, die aelteste. Ohne
 * Versionen die Defaults (kein Ziel/Umsatz).
 */
export function vorgabeFuerTag(
  versionenAsc: Vorgabe[],
  datum: string,
): Einstellungen {
  if (versionenAsc.length === 0) return VORGABE_DEFAULTS;
  let gewaehlt = versionenAsc[0]; // aelteste als Fallback fuer fruehe Tage
  for (const v of versionenAsc) {
    if (v.gueltig_ab <= datum) gewaehlt = v;
    else break;
  }
  return {
    kcal_ziel: gewaehlt.kcal_ziel,
    kcal_ziel_typ: gewaehlt.kcal_ziel_typ,
    eiweiss_ziel_dg: gewaehlt.eiweiss_ziel_dg,
    eiweiss_ziel_typ: gewaehlt.eiweiss_ziel_typ,
    gesamtumsatz: gewaehlt.gesamtumsatz,
  };
}

/** Die fuer `datum` gueltige Vorgabe (laedt die Versionen selbst). */
export function getVorgabeFuerTag(db: Database, datum: string): Einstellungen {
  return vorgabeFuerTag(ladeVersionenAsc(db), datum);
}

/**
 * Legt eine Vorgabe fuer den Stichtag an oder ersetzt die vorhandene desselben
 * Stichtags (ein Eintrag je gueltig_ab und Mandant).
 */
export function upsertVorgabe(db: Database, input: VorgabeInput): Vorgabe {
  db.prepare(
    `INSERT INTO vorgaben
       (mandant_id, gueltig_ab, kcal_ziel, kcal_ziel_typ,
        eiweiss_ziel_dg, eiweiss_ziel_typ, gesamtumsatz)
     VALUES (@mandant, @gueltig_ab, @kz, @kzt, @ez, @ezt, @gu)
     ON CONFLICT(mandant_id, gueltig_ab) DO UPDATE SET
       kcal_ziel = excluded.kcal_ziel,
       kcal_ziel_typ = excluded.kcal_ziel_typ,
       eiweiss_ziel_dg = excluded.eiweiss_ziel_dg,
       eiweiss_ziel_typ = excluded.eiweiss_ziel_typ,
       gesamtumsatz = excluded.gesamtumsatz`,
  ).run({
    mandant: aktuellerMandant(),
    gueltig_ab: input.gueltig_ab,
    kz: input.kcal_ziel,
    kzt: input.kcal_ziel_typ,
    ez: input.eiweiss_ziel_dg,
    ezt: input.eiweiss_ziel_typ,
    gu: input.gesamtumsatz,
  });
  const row = db
    .prepare(`${SELECT} AND gueltig_ab = @gueltig_ab`)
    .get({ mandant: aktuellerMandant(), gueltig_ab: input.gueltig_ab }) as
    VorgabeRow | undefined;
  return toVorgabe(row as VorgabeRow);
}

export function deleteVorgabe(db: Database, id: number): void {
  const info = db
    .prepare('DELETE FROM vorgaben WHERE id = ? AND mandant_id = ?')
    .run(id, aktuellerMandant());
  if (info.changes === 0) throw notFound('Vorgabe nicht gefunden.');
}
