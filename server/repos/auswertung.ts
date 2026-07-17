import type { Database } from 'better-sqlite3';
import type {
  AbnehmFortschritt,
  DefizitFenster,
  DefizitReport,
  DefizitTag,
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
import { bewegungKcalProTag } from './bewegung.ts';
import { erstesGewichtAb, letztesGewichtBis } from './gewicht.ts';
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

/**
 * Tagessummen im Zeitraum [von, bis] – nur Tage mit Eintraegen. Tage in der
 * ZUKUNFT (datum > heute) werden ausgeschlossen; sie dienen nur der Planung und
 * fliessen in keine Statistik ein.
 */
export function getVerlauf(
  db: Database,
  von: string,
  bis: string,
  heute: string,
): Verlauf {
  const rows = db
    .prepare(
      `SELECT e.datum AS datum,
              SUM(${TAG_KCAL}) AS kcal,
              SUM(${TAG_EIW})  AS eiweiss_dg
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant
          AND e.datum BETWEEN @von AND @bis
          AND e.datum <= @heute
        GROUP BY e.datum
        ORDER BY e.datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis, heute }) as TagAggRow[];
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
  heute: string,
): DefizitFenster {
  const bereich =
    von !== null && bis !== null ? 'AND e.datum BETWEEN @von AND @bis' : '';
  // Zukunftstage (datum > heute) sind reine Planung und zaehlen nirgends.
  const rows = db
    .prepare(
      `SELECT e.datum AS datum, SUM(${TAG_KCAL}) AS kcal
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant AND e.datum <= @heute ${bereich}
        GROUP BY e.datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis, heute }) as TagKcalRow[];
  const bewegung = bewegungKcalProTag(db, von, bis);

  let tage = 0;
  let kcal_aufnahme = 0;
  let defizit = 0;
  for (const r of rows) {
    // Gesamtverbrauch des Tages = Gesamtumsatz + Aktivitaetskalorien.
    const umsatz =
      vorgabeFuerTag(versionenAsc, r.datum).gesamtumsatz +
      (bewegung.get(r.datum) ?? 0);
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
    tag: fenster(db, versionenAsc, heute, heute, heute),
    woche: fenster(db, versionenAsc, verschiebeDatum(heute, -6), heute, heute),
    monat: fenster(db, versionenAsc, verschiebeDatum(heute, -29), heute, heute),
    gesamt: fenster(db, versionenAsc, null, null, heute),
  };
}

/**
 * Tagesdefizit je Tag mit Eintraegen im Zeitraum (mit historischem Umsatz +
 * Aktivitaetskalorien), aufsteigend nach Datum. Zukunftstage sind ausgeschlossen.
 */
function tagesDefiziteMitDatum(
  db: Database,
  versionenAsc: Vorgabe[],
  von: string,
  bis: string,
  heute: string,
): DefizitTag[] {
  const rows = db
    .prepare(
      `SELECT e.datum AS datum, SUM(${TAG_KCAL}) AS kcal
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant
          AND e.datum BETWEEN @von AND @bis
          AND e.datum <= @heute
        GROUP BY e.datum
        ORDER BY e.datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis, heute }) as TagKcalRow[];
  const bewegung = bewegungKcalProTag(db, von, bis);
  return rows.map((r) => ({
    datum: r.datum,
    defizit:
      vorgabeFuerTag(versionenAsc, r.datum).gesamtumsatz +
      (bewegung.get(r.datum) ?? 0) -
      r.kcal,
  }));
}

/** Nur die Defizitwerte (fuer Median/Summe der Fortschrittsrechnung). */
function tagesDefizite(
  db: Database,
  versionenAsc: Vorgabe[],
  von: string,
  bis: string,
  heute: string,
): number[] {
  return tagesDefiziteMitDatum(db, versionenAsc, von, bis, heute).map(
    (t) => t.defizit,
  );
}

/** Tagesdefizit je Tag im Zeitraum (fuer die Gewichtsprognose auf Defizitbasis). */
export function getDefizitVerlauf(
  db: Database,
  von: string,
  bis: string,
  heute: string,
): DefizitTag[] {
  return tagesDefiziteMitDatum(db, ladeVersionenAsc(db), von, bis, heute);
}

/** Median einer nicht-leeren Zahlenliste. */
function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Prognose-Datum, an dem das Restdefizit bei einem konstanten Tagesdefizit
 * `rate` erreicht ist. null, wenn nicht absehbar (kein Rest, keine positive Rate).
 */
function prognoseDatum(
  heute: string,
  rest: number,
  rate: number | null,
): string | null {
  if (rate === null || rate <= 0 || rest <= 0) return null;
  return verschiebeDatum(heute, Math.ceil(rest / rate));
}

/**
 * Fortschritt des aktiven Abnehmziels: erreichtes Defizit seit dem Stichtag des
 * Ziels (nur Tage mit Eintraegen, je Tag mit dem damals gueltigen Gesamtumsatz)
 * im Verhaeltnis zum noetigen Defizit (Gewicht × 7000 kcal/kg). Zusaetzlich zwei
 * Prognosen fuer das Erreichen des Restdefizits: beim Median-Tagesdefizit seit
 * Festlegung und beim Defizit des Vortags.
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
      rest_kcal: 0,
      ziel_erreicht: false,
      median_defizit: null,
      prognose_median: null,
      vortag_defizit: null,
      prognose_vortag: null,
      start_gewicht_gramm: null,
      aktuell_gewicht_gramm: null,
      abgenommen_gramm: 0,
      gewicht_prozent: 0,
    };
  }
  const versionenAsc = ladeVersionenAsc(db);
  const defizite = tagesDefizite(
    db,
    versionenAsc,
    ziel.gueltig_ab,
    heute,
    heute,
  );
  const erreicht_kcal = defizite.reduce((a, b) => a + b, 0);
  const benoetigt_kcal = benoetigtesDefizitKcal(ziel.ziel_gramm);
  // Ungerundet zurueckgeben; die Anzeige formatiert auf zwei Nachkommastellen.
  const prozent =
    benoetigt_kcal > 0 ? (erreicht_kcal / benoetigt_kcal) * 100 : 0;
  const rest_kcal = Math.max(0, benoetigt_kcal - erreicht_kcal);
  const ziel_erreicht = benoetigt_kcal > 0 && erreicht_kcal >= benoetigt_kcal;

  const median_defizit = defizite.length > 0 ? median(defizite) : null;

  // Defizit des Vortags (heute − 1); null, wenn dort keine Eintraege liegen.
  const vortag = verschiebeDatum(heute, -1);
  const vortagWin = fenster(db, versionenAsc, vortag, vortag, heute);
  const vortag_defizit = vortagWin.tage > 0 ? vortagWin.defizit : null;

  // Tatsaechliche Gewichtsabnahme seit Festlegung (nur nicht ausgeschlossene
  // Messungen): Startgewicht ab gueltig_ab gegen das aktuelle Gewicht.
  const startG = erstesGewichtAb(db, ziel.gueltig_ab, heute);
  const aktuellG = letztesGewichtBis(db, heute);
  const start_gewicht_gramm = startG ? startG.gramm : null;
  const aktuell_gewicht_gramm = aktuellG ? aktuellG.gramm : null;
  const abgenommen_gramm =
    startG && aktuellG ? startG.gramm - aktuellG.gramm : 0;
  const gewicht_prozent =
    ziel.ziel_gramm > 0 ? (abgenommen_gramm / ziel.ziel_gramm) * 100 : 0;

  return {
    hat_ziel: true,
    gueltig_ab: ziel.gueltig_ab,
    ziel_gramm: ziel.ziel_gramm,
    benoetigt_kcal,
    erreicht_kcal,
    prozent,
    rest_kcal,
    ziel_erreicht,
    median_defizit,
    prognose_median: prognoseDatum(heute, rest_kcal, median_defizit),
    vortag_defizit,
    prognose_vortag: prognoseDatum(heute, rest_kcal, vortag_defizit),
    start_gewicht_gramm,
    aktuell_gewicht_gramm,
    abgenommen_gramm,
    gewicht_prozent,
  };
}
