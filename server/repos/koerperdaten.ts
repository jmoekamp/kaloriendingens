import type { Database } from 'better-sqlite3';
import type {
  Geschlecht,
  GesamtumsatzModus,
  Koerperdaten,
  KoerperdatenInput,
} from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';

/**
 * Zugriffsschicht fuer die Koerperdaten (Gesamtumsatz-Berechnung). Abgelegt als
 * Key-Value je Mandant in der Tabelle `einstellungen`. Nicht versioniert.
 */
export const KOERPERDATEN_DEFAULTS: Koerperdaten = {
  groesse_cm: 0,
  geschlecht: 'm',
  geburtsjahr: 0,
  aktivitaetsfaktor: 1.5,
  modus: 'manuell',
};

export function getKoerperdaten(db: Database): Koerperdaten {
  const rows = db
    .prepare('SELECT schluessel, wert FROM einstellungen WHERE mandant_id = ?')
    .all(aktuellerMandant()) as { schluessel: string; wert: string | null }[];
  const map = new Map(rows.map((r) => [r.schluessel, r.wert]));

  const ganz = (k: string, def: number) => {
    const n = Number(map.get(k));
    return Number.isFinite(n) ? Math.trunc(n) : def;
  };
  const zahl = (k: string, def: number) => {
    const n = Number(map.get(k));
    return Number.isFinite(n) ? n : def;
  };
  const geschlecht: Geschlecht =
    map.get('koerper_geschlecht') === 'w' ? 'w' : 'm';
  const modus: GesamtumsatzModus =
    map.get('gesamtumsatz_modus') === 'berechnet' ? 'berechnet' : 'manuell';

  return {
    groesse_cm: ganz('koerper_groesse_cm', KOERPERDATEN_DEFAULTS.groesse_cm),
    geschlecht,
    geburtsjahr: ganz('koerper_geburtsjahr', KOERPERDATEN_DEFAULTS.geburtsjahr),
    aktivitaetsfaktor: zahl(
      'koerper_aktivitaetsfaktor',
      KOERPERDATEN_DEFAULTS.aktivitaetsfaktor,
    ),
    modus,
  };
}

export function updateKoerperdaten(
  db: Database,
  input: KoerperdatenInput,
): Koerperdaten {
  const upsert = db.prepare(
    `INSERT INTO einstellungen (mandant_id, schluessel, wert)
     VALUES (?, ?, ?)
     ON CONFLICT(mandant_id, schluessel) DO UPDATE SET wert = excluded.wert`,
  );
  const setze = (schluessel: string, wert: string) =>
    upsert.run(aktuellerMandant(), schluessel, wert);

  const tx = db.transaction(() => {
    if (input.groesse_cm !== undefined)
      setze('koerper_groesse_cm', String(input.groesse_cm));
    if (input.geschlecht !== undefined)
      setze('koerper_geschlecht', input.geschlecht);
    if (input.geburtsjahr !== undefined)
      setze('koerper_geburtsjahr', String(input.geburtsjahr));
    if (input.aktivitaetsfaktor !== undefined)
      setze('koerper_aktivitaetsfaktor', String(input.aktivitaetsfaktor));
    if (input.modus !== undefined) setze('gesamtumsatz_modus', input.modus);
  });
  tx();

  return getKoerperdaten(db);
}

/** Sind alle fuer die Berechnung noetigen Werte gesetzt? */
export function koerperdatenVollstaendig(kd: Koerperdaten): boolean {
  return kd.groesse_cm > 0 && kd.geburtsjahr > 0 && kd.aktivitaetsfaktor > 0;
}
