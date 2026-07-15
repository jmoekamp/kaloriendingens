import type { Database } from 'better-sqlite3';
import type {
  Einstellungen,
  EinstellungenInput,
  ZielTyp,
} from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';

/**
 * Zugriffsschicht fuer die Einstellungen (Key-Value-Tabelle je Mandant):
 * Kalorien- und Eiweissziel (je mit Zieltyp min/max) sowie der taegliche
 * Gesamtumsatz fuer die Defizitrechnung. Hier findet KEIN Aussenkontakt statt.
 */
export const EINSTELLUNGEN_DEFAULTS: Einstellungen = {
  kcal_ziel: 0,
  kcal_ziel_typ: 'max',
  eiweiss_ziel_dg: 0,
  eiweiss_ziel_typ: 'min',
  gesamtumsatz: 0,
};

function ganzzahl(wert: string | null | undefined, def: number): number {
  if (wert == null || wert.trim() === '') return def;
  const n = Number(wert);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function zielTyp(wert: string | null | undefined, def: ZielTyp): ZielTyp {
  return wert === 'min' || wert === 'max' ? wert : def;
}

export function getEinstellungen(db: Database): Einstellungen {
  const rows = db
    .prepare('SELECT schluessel, wert FROM einstellungen WHERE mandant_id = ?')
    .all(aktuellerMandant()) as { schluessel: string; wert: string | null }[];
  const map = new Map(rows.map((r) => [r.schluessel, r.wert]));

  return {
    kcal_ziel: ganzzahl(map.get('kcal_ziel'), EINSTELLUNGEN_DEFAULTS.kcal_ziel),
    kcal_ziel_typ: zielTyp(
      map.get('kcal_ziel_typ'),
      EINSTELLUNGEN_DEFAULTS.kcal_ziel_typ,
    ),
    eiweiss_ziel_dg: ganzzahl(
      map.get('eiweiss_ziel_dg'),
      EINSTELLUNGEN_DEFAULTS.eiweiss_ziel_dg,
    ),
    eiweiss_ziel_typ: zielTyp(
      map.get('eiweiss_ziel_typ'),
      EINSTELLUNGEN_DEFAULTS.eiweiss_ziel_typ,
    ),
    gesamtumsatz: ganzzahl(
      map.get('gesamtumsatz'),
      EINSTELLUNGEN_DEFAULTS.gesamtumsatz,
    ),
  };
}

export function updateEinstellungen(
  db: Database,
  input: EinstellungenInput,
): Einstellungen {
  const upsert = db.prepare(
    `INSERT INTO einstellungen (mandant_id, schluessel, wert)
     VALUES (?, ?, ?)
     ON CONFLICT(mandant_id, schluessel)
       DO UPDATE SET wert = excluded.wert`,
  );
  const setze = (schluessel: string, wert: string) =>
    upsert.run(aktuellerMandant(), schluessel, wert);

  const tx = db.transaction(() => {
    if (input.kcal_ziel !== undefined)
      setze('kcal_ziel', String(input.kcal_ziel));
    if (input.kcal_ziel_typ !== undefined)
      setze('kcal_ziel_typ', input.kcal_ziel_typ);
    if (input.eiweiss_ziel_dg !== undefined)
      setze('eiweiss_ziel_dg', String(input.eiweiss_ziel_dg));
    if (input.eiweiss_ziel_typ !== undefined)
      setze('eiweiss_ziel_typ', input.eiweiss_ziel_typ);
    if (input.gesamtumsatz !== undefined)
      setze('gesamtumsatz', String(input.gesamtumsatz));
  });
  tx();

  return getEinstellungen(db);
}
