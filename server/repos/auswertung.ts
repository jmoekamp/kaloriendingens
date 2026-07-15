import type { Database } from 'better-sqlite3';
import type {
  DefizitFenster,
  DefizitReport,
  TagesAuswertung,
  TagesZusammenfassung,
  Verlauf,
  VerlaufPunkt,
} from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import { bewerteZiel } from '../../shared/naehrwerte.ts';
import { listEintraegeFuerTag } from './eintraege.ts';
import { getEinstellungen } from './einstellungen.ts';

/**
 * Auswertungen: Tagesauswertung (mit Zielabweichung), Langzeit-Verlauf,
 * „letzte Tage"-Liste und Kaloriendefizit. Alle Summen rechnen mit derselben
 * kaufmaennischen Rundung je Eintrag wie die Einzelanzeige (ROUND je Zeile,
 * dann Summe).
 */

// kcal/Eiweiss je Eintragszeile, kaufmaennisch gerundet (wie portionKcal/-EiweissDg).
const TAG_KCAL =
  'CAST(ROUND(l.kcal_pro_100g * e.menge_gramm / 100.0) AS INTEGER)';
const TAG_EIW =
  'CAST(ROUND(l.eiweiss_dg_pro_100g * e.menge_gramm / 100.0) AS INTEGER)';

interface TagAggRow {
  datum: string;
  kcal: number;
  eiweiss_dg: number;
}

/** Verschiebt ein ISO-Datum (YYYY-MM-DD) um n Tage (UTC-basiert, stabil). */
export function verschiebeDatum(iso: string, tage: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Tagesauswertung inkl. Zielbewertung fuer kcal und Eiweiss. */
export function getTagesAuswertung(
  db: Database,
  datum: string,
): TagesAuswertung {
  const eintraege = listEintraegeFuerTag(db, datum);
  const summe_kcal = eintraege.reduce((s, e) => s + (e.kcal ?? 0), 0);
  const summe_eiweiss_dg = eintraege.reduce(
    (s, e) => s + (e.eiweiss_dg ?? 0),
    0,
  );
  const cfg = getEinstellungen(db);
  return {
    datum,
    eintraege,
    summe_kcal,
    summe_eiweiss_dg,
    kcal: bewerteZiel(summe_kcal, cfg.kcal_ziel, cfg.kcal_ziel_typ),
    eiweiss: bewerteZiel(
      summe_eiweiss_dg,
      cfg.eiweiss_ziel_dg,
      cfg.eiweiss_ziel_typ,
    ),
  };
}

/** Tagessummen im Zeitraum [von, bis] – nur Tage mit Eintraegen. */
export function getVerlauf(db: Database, von: string, bis: string): Verlauf {
  const rows = db
    .prepare(
      `SELECT e.datum AS datum,
              SUM(${TAG_KCAL}) AS kcal,
              SUM(${TAG_EIW})  AS eiweiss_dg
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant AND e.datum BETWEEN @von AND @bis
        GROUP BY e.datum
        ORDER BY e.datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis }) as TagAggRow[];
  const punkte: VerlaufPunkt[] = rows.map((r) => ({
    datum: r.datum,
    kcal: r.kcal,
    eiweiss_dg: r.eiweiss_dg,
  }));
  return { von, bis, punkte };
}

/** Liste der letzten n Kalendertage ab (inkl.) heute, absteigend. */
export function getLetzteTage(
  db: Database,
  heute: string,
  n: number,
): TagesZusammenfassung[] {
  const von = verschiebeDatum(heute, -(n - 1));
  const agg = new Map<string, TagAggRow>();
  for (const r of db
    .prepare(
      `SELECT e.datum AS datum,
              SUM(${TAG_KCAL}) AS kcal,
              SUM(${TAG_EIW})  AS eiweiss_dg
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant AND e.datum BETWEEN @von AND @bis
        GROUP BY e.datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis: heute }) as TagAggRow[]) {
    agg.set(r.datum, r);
  }

  const ergebnis: TagesZusammenfassung[] = [];
  for (let i = 0; i < n; i++) {
    const datum = verschiebeDatum(heute, -i);
    const r = agg.get(datum);
    ergebnis.push({
      datum,
      kcal: r?.kcal ?? 0,
      eiweiss_dg: r?.eiweiss_dg ?? 0,
      hat_daten: r !== undefined,
    });
  }
  return ergebnis;
}

interface FensterRow {
  tage: number;
  kcal: number;
}

/**
 * Defizit fuer ein Zeitfenster: Nur Tage mit Eintraegen zaehlen. bis/von = null
 * bedeutet „gesamter Zeitraum" (keine Datumsgrenze). Defizit = gesamtumsatz ×
 * Tage − Aufnahme (bei gesamtumsatz 0 also die negative Aufnahme – das Frontend
 * weist dann auf den fehlenden Gesamtumsatz hin).
 */
function fenster(
  db: Database,
  gesamtumsatz: number,
  von: string | null,
  bis: string | null,
): DefizitFenster {
  const bereich =
    von !== null && bis !== null ? 'AND e.datum BETWEEN @von AND @bis' : '';
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT e.datum) AS tage,
              COALESCE(SUM(${TAG_KCAL}), 0) AS kcal
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant ${bereich}`,
    )
    .get({ mandant: aktuellerMandant(), von, bis }) as FensterRow;
  const defizit = gesamtumsatz * row.tage - row.kcal;
  return { tage: row.tage, kcal_aufnahme: row.kcal, defizit };
}

/** Kaloriendefizit fuer heute, letzte 7 Tage, letzte 30 Tage und gesamt. */
export function getDefizitReport(db: Database, heute: string): DefizitReport {
  const gesamtumsatz = getEinstellungen(db).gesamtumsatz;
  return {
    gesamtumsatz,
    tag: fenster(db, gesamtumsatz, heute, heute),
    woche: fenster(db, gesamtumsatz, verschiebeDatum(heute, -6), heute),
    monat: fenster(db, gesamtumsatz, verschiebeDatum(heute, -29), heute),
    gesamt: fenster(db, gesamtumsatz, null, null),
  };
}
