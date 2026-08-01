import type { Database } from 'better-sqlite3';
import { aktuellerMandant } from '../db/index.ts';

/**
 * Festgehaltene ("eingefrorene") Meilenstein-Prognosen.
 *
 * Problem: Trend- und Median-Prognosen wandern mit jeder neuen Messung – der
 * vorhergesagte Termin verschiebt sich dauernd und taugt nicht als
 * Vergleichsbasis. Loesung: Die Prognosen werden festgehalten und NUR dann neu
 * berechnet, wenn ein Zwischenziel erreicht wird (oder sich die
 * Meilenstein-Liste aendert, z. B. durch ein neues Abnehmziel). Erreichte
 * Meilensteine behalten ihre damals festgehaltene Prognose dauerhaft – gegen
 * sie wird "frueher/spaeter" gerechnet.
 */

export interface PrognoseKandidat {
  gramm: number;
  erreicht: boolean;
  /** Aktuell (live) berechnete Prognose oder null (nicht absehbar). */
  live: string | null;
}

export interface FestgehaltenePrognosen {
  /** Wirksame (festgehaltene) Prognose je Meilenstein-Gramm. */
  prognosen: Map<number, string | null>;
  /** Juengster Festhalte-Zeitpunkt (ISO-Datum) oder null ohne Eintraege. */
  stand: string | null;
}

interface PrognoseRow {
  gramm: number;
  prognose: string | null;
  erreicht: number;
  festgehalten_am: string;
}

/**
 * Gleicht die festgehaltenen Prognosen einer Quelle mit dem aktuellen Stand ab
 * und liefert die wirksamen Werte:
 * - Fehlt fuer einen aktuellen Meilenstein eine Zeile (Erstlauf/geaendertes
 *   Ziel) ODER ist seit dem letzten Festhalten ein Meilenstein NEU erreicht
 *   worden, werden die Prognosen aller noch offenen Meilensteine neu
 *   festgehalten.
 * - Erreichte Meilensteine behalten ihre gespeicherte Prognose unveraendert
 *   (nur der Status wird nachgezogen); ohne gespeicherte Zeile wird einmalig
 *   die live-Prognose uebernommen.
 * - Zeilen zu nicht mehr existierenden Meilensteinen werden entfernt.
 */
export function frierePrognosenEin(
  db: Database,
  quelle: 'trend' | 'median',
  heute: string,
  kandidaten: PrognoseKandidat[],
): FestgehaltenePrognosen {
  const mandant = aktuellerMandant();
  const lesen = () =>
    db
      .prepare(
        `SELECT gramm, prognose, erreicht, festgehalten_am
           FROM meilenstein_prognosen
          WHERE mandant_id = ? AND quelle = ?`,
      )
      .all(mandant, quelle) as PrognoseRow[];

  const vorher = new Map(lesen().map((r) => [r.gramm, r]));
  const neuErreicht = kandidaten.some(
    (k) =>
      k.erreicht && vorher.has(k.gramm) && vorher.get(k.gramm)!.erreicht === 0,
  );
  const fehltZeile = kandidaten.some((k) => !vorher.has(k.gramm));

  if (kandidaten.length > 0 && (neuErreicht || fehltZeile)) {
    const upsert = db.prepare(
      `INSERT INTO meilenstein_prognosen
         (mandant_id, quelle, gramm, prognose, erreicht, festgehalten_am)
       VALUES (@mandant, @quelle, @gramm, @prognose, @erreicht, @heute)
       ON CONFLICT(mandant_id, quelle, gramm) DO UPDATE SET
         prognose = excluded.prognose, erreicht = excluded.erreicht,
         festgehalten_am = excluded.festgehalten_am`,
    );
    const nurStatus = db.prepare(
      `UPDATE meilenstein_prognosen SET erreicht = 1
        WHERE mandant_id = ? AND quelle = ? AND gramm = ?`,
    );
    const loeschen = db.prepare(
      `DELETE FROM meilenstein_prognosen
        WHERE mandant_id = ? AND quelle = ? AND gramm = ?`,
    );
    const tx = db.transaction(() => {
      for (const k of kandidaten) {
        const alt = vorher.get(k.gramm);
        if (k.erreicht && alt) {
          // Vergleichsbasis bewahren: Prognose unangetastet, nur Status setzen.
          if (alt.erreicht === 0) nurStatus.run(mandant, quelle, k.gramm);
        } else {
          // Offene Meilensteine (und erreichte ohne Zeile) neu festhalten.
          upsert.run({
            mandant,
            quelle,
            gramm: k.gramm,
            prognose: k.live,
            erreicht: k.erreicht ? 1 : 0,
            heute,
          });
        }
      }
      const aktuelle = new Set(kandidaten.map((k) => k.gramm));
      for (const g of vorher.keys()) {
        if (!aktuelle.has(g)) loeschen.run(mandant, quelle, g);
      }
    });
    tx();
  }

  const rows = lesen();
  const stand = rows.reduce<string | null>(
    (max, r) =>
      max === null || r.festgehalten_am > max ? r.festgehalten_am : max,
    null,
  );
  return {
    prognosen: new Map(rows.map((r) => [r.gramm, r.prognose])),
    stand,
  };
}
