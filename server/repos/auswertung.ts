import type { Database } from 'better-sqlite3';
import type {
  AbnehmFortschritt,
  DefizitFenster,
  DefizitReport,
  TagesAuswertung,
  TagesZusammenfassung,
  Verlauf,
  VerlaufPunkt,
  Vorgabe,
} from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import {
  benoetigtesDefizitKcal,
  bewerteZiel,
} from '../../shared/naehrwerte.ts';
import { listEintraegeFuerTag } from './eintraege.ts';
import { aktivesAbnehmziel } from './abnehmziele.ts';
import {
  getVorgabeFuerTag,
  ladeVersionenAsc,
  vorgabeFuerTag,
} from './vorgaben.ts';

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
  // Die fuer diesen Tag gueltige Vorgabe (nicht die aktuelle) bewerten.
  const cfg = getVorgabeFuerTag(db, datum);
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

interface TagKcalRow {
  datum: string;
  kcal: number;
}

/**
 * Defizit fuer ein Zeitfenster: Nur Tage mit Eintraegen zaehlen. bis/von = null
 * bedeutet „gesamter Zeitraum" (keine Datumsgrenze). Je Tag wird der DAMALS
 * gueltige Gesamtumsatz herangezogen (aus den Vorgaben-Versionen) und das
 * Defizit als Summe (Gesamtumsatz(Tag) − Aufnahme(Tag)) gebildet. So bleibt ein
 * frueherer, hoeherer Gesamtumsatz fuer vergangene Tage erhalten.
 */
function fenster(
  db: Database,
  versionenAsc: Vorgabe[],
  von: string | null,
  bis: string | null,
): DefizitFenster {
  const bereich =
    von !== null && bis !== null ? 'AND e.datum BETWEEN @von AND @bis' : '';
  const rows = db
    .prepare(
      `SELECT e.datum AS datum, SUM(${TAG_KCAL}) AS kcal
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant ${bereich}
        GROUP BY e.datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis }) as TagKcalRow[];

  let tage = 0;
  let kcal_aufnahme = 0;
  let defizit = 0;
  for (const r of rows) {
    const umsatz = vorgabeFuerTag(versionenAsc, r.datum).gesamtumsatz;
    tage += 1;
    kcal_aufnahme += r.kcal;
    defizit += umsatz - r.kcal;
  }
  return { tage, kcal_aufnahme, defizit };
}

/** Kaloriendefizit fuer heute, letzte 7 Tage, letzte 30 Tage und gesamt. */
export function getDefizitReport(db: Database, heute: string): DefizitReport {
  const versionenAsc = ladeVersionenAsc(db);
  return {
    // Zur Anzeige/Hinweis: der heute gueltige Gesamtumsatz.
    gesamtumsatz: vorgabeFuerTag(versionenAsc, heute).gesamtumsatz,
    tag: fenster(db, versionenAsc, heute, heute),
    woche: fenster(db, versionenAsc, verschiebeDatum(heute, -6), heute),
    monat: fenster(db, versionenAsc, verschiebeDatum(heute, -29), heute),
    gesamt: fenster(db, versionenAsc, null, null),
  };
}

/**
 * Fortschritt des aktiven Abnehmziels: erreichtes Defizit seit dem Stichtag des
 * Ziels (nur Tage mit Eintraegen, je Tag mit dem damals gueltigen Gesamtumsatz)
 * im Verhaeltnis zum noetigen Defizit (Gewicht × 7000 kcal/kg).
 */
export function getAbnehmFortschritt(
  db: Database,
  heute: string,
): AbnehmFortschritt {
  const ziel = aktivesAbnehmziel(db, heute);
  if (!ziel) {
    return {
      hat_ziel: false,
      gueltig_ab: null,
      ziel_gramm: 0,
      benoetigt_kcal: 0,
      erreicht_kcal: 0,
      prozent: 0,
    };
  }
  const versionenAsc = ladeVersionenAsc(db);
  const erreicht_kcal = fenster(
    db,
    versionenAsc,
    ziel.gueltig_ab,
    heute,
  ).defizit;
  const benoetigt_kcal = benoetigtesDefizitKcal(ziel.ziel_gramm);
  // Ungerundet zurueckgeben; die Anzeige formatiert auf zwei Nachkommastellen.
  const prozent =
    benoetigt_kcal > 0 ? (erreicht_kcal / benoetigt_kcal) * 100 : 0;
  return {
    hat_ziel: true,
    gueltig_ab: ziel.gueltig_ab,
    ziel_gramm: ziel.ziel_gramm,
    benoetigt_kcal,
    erreicht_kcal,
    prozent,
  };
}
