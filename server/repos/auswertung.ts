import type { Database } from 'better-sqlite3';
import type {
  AbnehmFortschritt,
  AllzeitTag,
  DetailBewegung,
  DetailMahlzeit,
  DetailTag,
  DefizitFenster,
  DefizitReport,
  DefizitTag,
  GewichtsMeilenstein,
  KalorienTag,
  TagesAuswertung,
  TagesZusammenfassung,
  Verlauf,
  VerlaufPunkt,
} from '../../shared/types.ts';
import { aktuellerMandant } from '../db/index.ts';
import {
  benoetigtesDefizitKcal,
  bewerteZiel,
  eiweissProKgKoerper,
  gleitenderMedian,
  lineareRegression,
} from '../../shared/naehrwerte.ts';
import {
  gesamtumsatzBerechnet,
  gesamtumsatzKatch,
  gewichtBeiBmi,
} from '../../shared/umsatz.ts';
import { listEintraegeFuerTag } from './eintraege.ts';
import { bewegungKcalProTag } from './bewegung.ts';
import {
  alleGewichteAsc,
  erstesGewichtAb,
  erstesGewichtGesamt,
  gewichteImTrendBis,
  letztesGewichtBis,
} from './gewicht.ts';
import {
  getKoerperdaten,
  koerperdatenVollstaendig,
  mifflinDatenVollstaendig,
} from './koerperdaten.ts';
import { aktivesAbnehmziel } from './abnehmziele.ts';
import { frierePrognosenEin } from './prognosen.ts';
import {
  getVorgabeFuerTag,
  ladeVersionenAsc,
  vorgabeFuerTag,
} from './vorgaben.ts';

/** Eine Funktion, die je Tag den geltenden Gesamtumsatz (kcal/Tag) liefert. */
type UmsatzFuerTag = (datum: string) => number;

/**
 * Gewicht (Gramm), das an einem Tag „gilt": die letzte Messung ≤ Tag
 * (Carry-forward). Vor der ersten Messung die frueheste. null, wenn keine.
 */
function gewichtFuerTag(
  gewichteAsc: { datum: string; gramm: number }[],
  datum: string,
): number | null {
  if (gewichteAsc.length === 0) return null;
  let wert = gewichteAsc[0].gramm; // Fallback: fruehestes Gewicht
  for (const g of gewichteAsc) {
    if (g.datum <= datum) wert = g.gramm;
    else break;
  }
  return wert;
}

/**
 * Fettanteil (Promille), der an einem Tag „gilt": die letzte Messung MIT
 * Fettwert ≤ Tag (Carry-forward). Anders als beim Gewicht gibt es KEINEN
 * Rueckgriff auf spaetere Messungen: fuer Tage vor der ersten Fettmessung
 * liefert die Funktion null (dort rechnet die Auswertung mit Mifflin weiter).
 */
function fettFuerTag(
  fetteAsc: { datum: string; fett_promille: number }[],
  datum: string,
): number | null {
  let wert: number | null = null;
  for (const f of fetteAsc) {
    if (f.datum <= datum) wert = f.fett_promille;
    else break;
  }
  return wert;
}

/**
 * Baut die Gesamtumsatz-Funktion: bei modus 'berechnet' + vollstaendigen
 * Koerperdaten aus dem tagesgueltigen Gewicht, sonst der manuelle,
 * versionierte Vorgabe-Wert. Formel je nach Einstellung: Katch-McArdle
 * (Magermasse aus Gewicht × (1 − tagesgueltiger Fettanteil)) oder
 * Mifflin-St Jeor. Fehlt an einem Tag der Fettwert, gilt der letzte davor
 * (Carry-forward); gibt es bis zu dem Tag noch keinen (oder nie einen),
 * faellt Katch auf Mifflin zurueck (sofern Groesse/Geburtsjahr gesetzt),
 * ohne Gewicht auf den manuellen Wert.
 */
function ladeUmsatzKontext(db: Database): UmsatzFuerTag {
  const versionenAsc = ladeVersionenAsc(db);
  const manuell: UmsatzFuerTag = (datum) =>
    vorgabeFuerTag(versionenAsc, datum).gesamtumsatz;

  const kd = getKoerperdaten(db);
  if (kd.modus !== 'berechnet' || !koerperdatenVollstaendig(kd)) {
    return manuell;
  }
  const gewichteAsc = alleGewichteAsc(db);
  const fetteAsc = gewichteAsc.filter(
    (g): g is { datum: string; gramm: number; fett_promille: number } =>
      g.fett_promille !== null,
  );
  return (datum) => {
    const gramm = gewichtFuerTag(gewichteAsc, datum);
    if (gramm === null) return manuell(datum);
    if (kd.formel === 'katch') {
      const fett = fettFuerTag(fetteAsc, datum);
      if (fett !== null) {
        return gesamtumsatzKatch(gramm, fett, kd.aktivitaetsfaktor);
      }
      // Kein Fettwert: Fallback Mifflin, wenn dessen Daten vorliegen.
      if (!mifflinDatenVollstaendig(kd)) return manuell(datum);
    }
    const alter = Number(datum.slice(0, 4)) - kd.geburtsjahr;
    return gesamtumsatzBerechnet(
      gramm,
      kd.groesse_cm,
      alter,
      kd.geschlecht,
      kd.aktivitaetsfaktor,
    );
  };
}

/** Der fuer `datum` geltende Gesamtumsatz (berechnet oder manuell). */
export function gesamtumsatzFuerTag(db: Database, datum: string): number {
  return ladeUmsatzKontext(db)(datum);
}

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

/** Tagesnummer (Tage seit Epoche, UTC) fuer die Regression. */
function tagNummer(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Umkehrung: Tagesnummer -> YYYY-MM-DD. */
function fromTag(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** Tagesauswertung inkl. Zielbewertung fuer kcal und Eiweiss. */
export function getTagesAuswertung(
  db: Database,
  datum: string,
): TagesAuswertung {
  const eintraege = listEintraegeFuerTag(db, datum);
  // Nur gegessene Eintraege zaehlen in Summen/Ziele/Defizit; die Liste selbst
  // zeigt weiterhin alle Eintraege des Tages (auch noch nicht gegessene).
  const gegessene = eintraege.filter((e) => e.gegessen);
  const summe_kcal = gegessene.reduce((s, e) => s + (e.kcal ?? 0), 0);
  const summe_eiweiss_dg = gegessene.reduce(
    (s, e) => s + (e.eiweiss_dg ?? 0),
    0,
  );
  // Die fuer diesen Tag gueltige Vorgabe (nicht die aktuelle) bewerten.
  const cfg = getVorgabeFuerTag(db, datum);
  // Zusammenfassung: Leistungs-/Gesamtumsatz + Bewegung − Aufnahme = Defizit.
  const gesamtumsatz = ladeUmsatzKontext(db)(datum);
  const bewegung = bewegungKcalProTag(db, datum, datum).get(datum) ?? 0;
  // Am Tag gueltiges Gewicht (Carry-forward) fuer Eiweiss je kg Koerpergewicht.
  const gewicht_gramm = gewichtFuerTag(alleGewichteAsc(db), datum);
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
    gesamtumsatz,
    bewegung,
    defizit: gesamtumsatz + bewegung - summe_kcal,
    gewicht_gramm,
    eiweiss_pro_kg: eiweissProKgKoerper(summe_eiweiss_dg, gewicht_gramm),
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
          AND e.gegessen = 1
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
        WHERE e.mandant_id = @mandant AND e.gegessen = 1
          AND e.datum BETWEEN @von AND @bis
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
  umsatz: UmsatzFuerTag,
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
        WHERE e.mandant_id = @mandant AND e.gegessen = 1
          AND e.datum <= @heute ${bereich}
        GROUP BY e.datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis, heute }) as TagKcalRow[];
  const bewegung = bewegungKcalProTag(db, von, bis);

  let tage = 0;
  let kcal_aufnahme = 0;
  let defizit = 0;
  for (const r of rows) {
    // Gesamtverbrauch des Tages = Gesamtumsatz + Aktivitaetskalorien.
    const verbrauch = umsatz(r.datum) + (bewegung.get(r.datum) ?? 0);
    tage += 1;
    kcal_aufnahme += r.kcal;
    defizit += verbrauch - r.kcal;
  }
  return { tage, kcal_aufnahme, defizit };
}

/** Kaloriendefizit fuer heute, letzte 7 Tage, letzte 30 Tage und gesamt. */
export function getDefizitReport(db: Database, heute: string): DefizitReport {
  const umsatz = ladeUmsatzKontext(db);
  return {
    // Zur Anzeige/Hinweis: der heute geltende Gesamtumsatz.
    gesamtumsatz: umsatz(heute),
    tag: fenster(db, umsatz, heute, heute, heute),
    woche: fenster(db, umsatz, verschiebeDatum(heute, -6), heute, heute),
    monat: fenster(db, umsatz, verschiebeDatum(heute, -29), heute, heute),
    gesamt: fenster(db, umsatz, null, null, heute),
  };
}

/**
 * Tagesdefizit je Tag mit Eintraegen im Zeitraum (Umsatz je Tag +
 * Aktivitaetskalorien), aufsteigend nach Datum. Zukunftstage sind ausgeschlossen.
 */
function tagesDefiziteMitDatum(
  db: Database,
  umsatz: UmsatzFuerTag,
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
          AND e.gegessen = 1
          AND e.datum BETWEEN @von AND @bis
          AND e.datum <= @heute
        GROUP BY e.datum
        ORDER BY e.datum`,
    )
    .all({ mandant: aktuellerMandant(), von, bis, heute }) as TagKcalRow[];
  const bewegung = bewegungKcalProTag(db, von, bis);
  return rows.map((r) => ({
    datum: r.datum,
    defizit: umsatz(r.datum) + (bewegung.get(r.datum) ?? 0) - r.kcal,
  }));
}

/** Nur die Defizitwerte (fuer Median/Summe der Fortschrittsrechnung). */
function tagesDefizite(
  db: Database,
  umsatz: UmsatzFuerTag,
  von: string,
  bis: string,
  heute: string,
): number[] {
  return tagesDefiziteMitDatum(db, umsatz, von, bis, heute).map(
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
  return tagesDefiziteMitDatum(db, ladeUmsatzKontext(db), von, bis, heute);
}

/**
 * Kalorien-Verlauf je Tag (fuer das Diagramm): Gesamtumsatz (berechnet oder
 * vorgegeben – je Tag mit dem an dem Tag gueltigen Gewicht), Aufnahme (kcal aus
 * Eintraegen, null wenn keiner) und Aufnahme + erfasste Bewegung. Ein Punkt je
 * Kalendertag im Zeitraum bis heute (Zukunft ausgeschlossen).
 */
export function getKalorienVerlauf(
  db: Database,
  von: string,
  bis: string,
  heute: string,
): KalorienTag[] {
  const effektivBis = bis <= heute ? bis : heute;
  if (von > effektivBis) return [];

  const umsatz = ladeUmsatzKontext(db);
  const aufnahmeRows = db
    .prepare(
      `SELECT e.datum AS datum, SUM(${TAG_KCAL}) AS kcal
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant AND e.gegessen = 1
          AND e.datum BETWEEN @von AND @bis
        GROUP BY e.datum`,
    )
    .all({
      mandant: aktuellerMandant(),
      von,
      bis: effektivBis,
    }) as TagKcalRow[];
  const aufnahmeMap = new Map(aufnahmeRows.map((r) => [r.datum, r.kcal]));
  const bewegung = bewegungKcalProTag(db, von, effektivBis);

  const ergebnis: KalorienTag[] = [];
  for (let d = von; d <= effektivBis; d = verschiebeDatum(d, 1)) {
    const aufnahme = aufnahmeMap.has(d) ? (aufnahmeMap.get(d) as number) : null;
    const g = umsatz(d);
    ergebnis.push({
      datum: d,
      gesamtumsatz: g,
      gesamtumsatz_plus_bewegung: g + (bewegung.get(d) ?? 0),
      aufnahme,
    });
  }
  return ergebnis;
}

/**
 * Allzeitreport: eine Zeile je Kalendertag von der ERSTEN Erfassung (Eintrag,
 * Bewegung oder Gewicht) bis heute – gemessenes Gewicht, Gesamtumsatz,
 * Bewegung, Verbrauch sowie Kalorien-/Eiweissaufnahme (nur gegessene
 * Eintraege). Fuer Copy & Paste in Tabellenkalkulationen gedacht.
 */
export function getAllzeitReport(db: Database, heute: string): AllzeitTag[] {
  const mandant = aktuellerMandant();
  const start = db
    .prepare(
      `SELECT MIN(d) AS von FROM (
         SELECT MIN(datum) AS d FROM eintraege WHERE mandant_id = @mandant
         UNION ALL
         SELECT MIN(datum) FROM bewegung WHERE mandant_id = @mandant
         UNION ALL
         SELECT MIN(datum) FROM gewicht WHERE mandant_id = @mandant
       )`,
    )
    .get({ mandant }) as { von: string | null };
  if (!start.von || start.von > heute) return [];
  const von = start.von;

  const umsatz = ladeUmsatzKontext(db);
  const bewegung = bewegungKcalProTag(db, von, heute);
  const gewichtMap = new Map(
    alleGewichteAsc(db).map((g) => [g.datum, g.gramm]),
  );
  // Fett/KH/Ballaststoffe wie Eiweiss summieren; NULL-Werte (Naehrwert beim
  // Lebensmittel nicht erfasst) fallen aus der Summe, ein Tag ganz ohne Werte
  // liefert NULL (SQLite-SUM ueber lauter NULLs).
  const TAG_FETT =
    'CAST(ROUND(l.fett_dg_pro_100g * e.menge_gramm / 100.0) AS INTEGER)';
  const TAG_KH =
    'CAST(ROUND(l.kohlenhydrate_dg_pro_100g * e.menge_gramm / 100.0) AS INTEGER)';
  const TAG_BALLAST =
    'CAST(ROUND(l.ballaststoffe_dg_pro_100g * e.menge_gramm / 100.0) AS INTEGER)';
  const aufnahmeRows = db
    .prepare(
      `SELECT e.datum AS datum, SUM(${TAG_KCAL}) AS kcal,
              SUM(${TAG_EIW}) AS eiweiss_dg,
              SUM(${TAG_FETT}) AS fett_dg,
              SUM(${TAG_KH}) AS kohlenhydrate_dg,
              SUM(${TAG_BALLAST}) AS ballaststoffe_dg
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant AND e.gegessen = 1
          AND e.datum BETWEEN @von AND @bis
        GROUP BY e.datum`,
    )
    .all({ mandant, von, bis: heute }) as {
    datum: string;
    kcal: number;
    eiweiss_dg: number;
    fett_dg: number | null;
    kohlenhydrate_dg: number | null;
    ballaststoffe_dg: number | null;
  }[];
  const aufnahmeMap = new Map(aufnahmeRows.map((r) => [r.datum, r]));

  const zeilen: AllzeitTag[] = [];
  for (let d = von; d <= heute; d = verschiebeDatum(d, 1)) {
    const auf = aufnahmeMap.get(d);
    const bew = bewegung.get(d) ?? 0;
    const g = umsatz(d);
    zeilen.push({
      datum: d,
      gewicht_gramm: gewichtMap.get(d) ?? null,
      gesamtumsatz: g,
      bewegung: bew,
      verbrauch: g + bew,
      aufnahme_kcal: auf ? auf.kcal : null,
      // App-Konvention: Defizit = Verbrauch − Aufnahme (positiv = Defizit).
      defizit_kcal: auf ? g + bew - auf.kcal : null,
      eiweiss_dg: auf ? auf.eiweiss_dg : null,
      fett_dg: auf ? auf.fett_dg : null,
      kohlenhydrate_dg: auf ? auf.kohlenhydrate_dg : null,
      ballaststoffe_dg: auf ? auf.ballaststoffe_dg : null,
    });
  }
  return zeilen;
}

/**
 * Detailreport: wie der Allzeitreport, aber je Tag zusaetzlich alle Mahlzeiten
 * (inkl. geplanter, markiert ueber `gegessen`) und Bewegungseintraege – ein
 * Report, in dem alles steht.
 */
export function getDetailReport(db: Database, heute: string): DetailTag[] {
  const tage = getAllzeitReport(db, heute);
  if (tage.length === 0) return [];
  const mandant = aktuellerMandant();
  const von = tage[0].datum;

  const mahlzeitRows = db
    .prepare(
      `SELECT e.datum AS datum, e.uhrzeit AS uhrzeit,
              l.name AS lebensmittel_name, e.menge_gramm AS menge_gramm,
              e.gegessen AS gegessen,
              ${TAG_KCAL} AS kcal, ${TAG_EIW} AS eiweiss_dg
         FROM eintraege e
         JOIN lebensmittel l ON l.id = e.lebensmittel_id
        WHERE e.mandant_id = @mandant AND e.datum BETWEEN @von AND @bis
        ORDER BY e.datum, e.uhrzeit, e.id`,
    )
    .all({ mandant, von, bis: heute }) as {
    datum: string;
    uhrzeit: string;
    lebensmittel_name: string;
    menge_gramm: number;
    gegessen: number;
    kcal: number;
    eiweiss_dg: number;
  }[];
  const bewegungRows = db
    .prepare(
      `SELECT datum, uhrzeit, beschreibung, kcal FROM bewegung
        WHERE mandant_id = @mandant AND datum BETWEEN @von AND @bis
        ORDER BY datum, uhrzeit, id`,
    )
    .all({ mandant, von, bis: heute }) as (DetailBewegung & {
    datum: string;
  })[];

  const mahlzeitenJeTag = new Map<string, DetailMahlzeit[]>();
  for (const r of mahlzeitRows) {
    const liste = mahlzeitenJeTag.get(r.datum) ?? [];
    liste.push({
      uhrzeit: r.uhrzeit,
      lebensmittel_name: r.lebensmittel_name,
      menge_gramm: r.menge_gramm,
      kcal: r.kcal,
      eiweiss_dg: r.eiweiss_dg,
      gegessen: r.gegessen === 1,
    });
    mahlzeitenJeTag.set(r.datum, liste);
  }
  const bewegungenJeTag = new Map<string, DetailBewegung[]>();
  for (const r of bewegungRows) {
    const liste = bewegungenJeTag.get(r.datum) ?? [];
    liste.push({
      uhrzeit: r.uhrzeit,
      beschreibung: r.beschreibung,
      kcal: r.kcal,
    });
    bewegungenJeTag.set(r.datum, liste);
  }

  return tage.map((tag) => ({
    tag,
    mahlzeiten: mahlzeitenJeTag.get(tag.datum) ?? [],
    bewegungen: bewegungenJeTag.get(tag.datum) ?? [],
  }));
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
      erst_gewicht_gramm: null,
      abgenommen_gesamt_gramm: 0,
      ziel_gesamt_gramm: 0,
      gewicht_prozent_gesamt: 0,
      trend_gramm_pro_woche: null,
      prognose_gewichtstrend: null,
      meilensteine: [],
      defizit_median_kcal: null,
      defizit_median_gramm_pro_woche: null,
      prognose_defizit_median: null,
      meilensteine_defizit_median: [],
      prognosen_stand_trend: null,
      prognosen_stand_median: null,
    };
  }
  const umsatz = ladeUmsatzKontext(db);
  const defizite = tagesDefizite(db, umsatz, ziel.gueltig_ab, heute, heute);
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
  const vortagWin = fenster(db, umsatz, vortag, vortag, heute);
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

  // Zusaetzlich: Gesamtabnahme ab der ALLERERSTEN Messung (inkl. Wasser-Tage).
  const erstG = erstesGewichtGesamt(db, heute);
  const erst_gewicht_gramm = erstG ? erstG.gramm : null;
  const abgenommen_gesamt_gramm =
    erstG && aktuellG ? erstG.gramm - aktuellG.gramm : 0;
  // Liegt die erste Messung ueber der ersten NICHT ausgeschlossenen Messung, wird
  // diese anfaengliche Abnahme aufs Ziel draufgelegt (sie steckt sonst nur im
  // Zaehler dieses Balkens, nicht im Nenner).
  const anfangsabnahme =
    erstG && startG && erstG.gramm > startG.gramm
      ? erstG.gramm - startG.gramm
      : 0;
  const ziel_gesamt_gramm = ziel.ziel_gramm + anfangsabnahme;
  const gewicht_prozent_gesamt =
    ziel_gesamt_gramm > 0
      ? (abgenommen_gesamt_gramm / ziel_gesamt_gramm) * 100
      : 0;

  // Zieltermin aus dem Gewichtstrend (Regression ueber nicht ausgeschlossene
  // Messungen bis heute): Wann trifft die Trendgerade das Zielgewicht?
  const trendW = gewichteImTrendBis(db, heute);
  const reg = lineareRegression(
    trendW.map((w) => tagNummer(w.datum)),
    trendW.map((w) => w.gramm),
  );
  const trend_gramm_pro_woche = reg ? reg.steigung * 7 : null;
  // Prognosedatum aus dem Trend fuer ein beliebiges Zielgewicht (Gramm).
  const trendDatumFuer = (zielgewicht: number): string | null => {
    if (!reg || reg.steigung >= 0) return null;
    const x = (zielgewicht - reg.achsenabschnitt) / reg.steigung;
    return Number.isFinite(x) ? fromTag(Math.round(x)) : null;
  };
  // Meilensteine: durch 5 teilbare ganze Kilo unter dem Startgewicht bis zum
  // Ziel. Die PROGNOSEN dazu werden festgehalten (frierePrognosenEin) und
  // aendern sich nur, wenn ein Zwischenziel erreicht wird – so bleibt der
  // vorhergesagte Termin als Vergleichsbasis stehen, statt mit jeder Messung
  // zu wandern.
  const meilensteinGramms: number[] = [];
  if (start_gewicht_gramm !== null) {
    const zielgewicht = start_gewicht_gramm - ziel.ziel_gramm;
    for (
      let m = Math.floor(start_gewicht_gramm / 5000) * 5000;
      m >= zielgewicht;
      m -= 5000
    ) {
      if (m >= start_gewicht_gramm) continue; // Startgewicht selbst ist kein Meilenstein
      meilensteinGramms.push(m);
    }
  }
  // Zusatz-Meilenstein: Gewicht bei BMI 25 (Obergrenze Normalgewicht) nach
  // der in den Koerperdaten gewaehlten BMI-Formel (Standard kg/m² oder
  // Trefethen 1,3·kg/m^2,5) – sofern die Groesse gesetzt ist und der Wert
  // unter dem Startgewicht liegt. Er wird unabhaengig vom Zielgewicht
  // einsortiert (kann also auch hinter dem Ziel liegen) und laeuft wie alle
  // Meilensteine durch die Prognose-Einfrierung.
  const koerper = getKoerperdaten(db);
  const bmi25_gramm =
    koerper.groesse_cm > 0
      ? gewichtBeiBmi(25, koerper.groesse_cm, koerper.bmi_formel)
      : null;
  if (
    bmi25_gramm !== null &&
    start_gewicht_gramm !== null &&
    bmi25_gramm < start_gewicht_gramm &&
    !meilensteinGramms.includes(bmi25_gramm)
  ) {
    meilensteinGramms.push(bmi25_gramm);
    meilensteinGramms.sort((a, b) => b - a); // absteigend halten
  }
  // Erste (nicht ausgeschlossene) Messung <= m gilt als erreicht.
  const erreichtAm = (m: number): string | null =>
    trendW.find((w) => w.gramm <= m)?.datum ?? null;
  const baueMeilensteine = (
    fest: Map<number, string | null>,
  ): GewichtsMeilenstein[] =>
    meilensteinGramms.map((m) => {
      const erreicht_am = erreichtAm(m);
      const prognose = fest.get(m) ?? null;
      return {
        gramm: m,
        ist_bmi25: m === bmi25_gramm,
        erreicht: erreicht_am !== null,
        erreicht_am,
        prognose,
        differenz_tage:
          erreicht_am && prognose
            ? tagNummer(erreicht_am) - tagNummer(prognose)
            : null,
      };
    });

  let prognose_gewichtstrend: string | null = null;
  let prognosen_stand_trend: string | null = null;
  let meilensteine: GewichtsMeilenstein[] = [];
  if (start_gewicht_gramm !== null) {
    const zielgewicht = start_gewicht_gramm - ziel.ziel_gramm;
    // Das Zielgewicht laeuft als zusaetzlicher "Meilenstein" mit, damit auch
    // der Zieltermin eingefroren wird (sofern nicht ohnehin ein 5-kg-Schritt).
    const alleGramm = meilensteinGramms.includes(zielgewicht)
      ? meilensteinGramms
      : [...meilensteinGramms, zielgewicht];
    const fest = frierePrognosenEin(
      db,
      'trend',
      heute,
      alleGramm.map((g) => ({
        gramm: g,
        erreicht: erreichtAm(g) !== null,
        live: trendDatumFuer(g),
      })),
    );
    meilensteine = baueMeilensteine(fest.prognosen);
    prognose_gewichtstrend = fest.prognosen.get(zielgewicht) ?? null;
    prognosen_stand_trend = fest.stand;
  }

  // Prognose auf Basis des gleitenden 7-Tage-Medians des Tagesdefizits: die
  // tagesweise Abnahmerate ist Median_kcal / 7 (7000 kcal/kg). Vergangene Tage
  // werden aufsummiert, fuer die Zukunft wird mit der aktuellen Medianrate
  // linear extrapoliert.
  const MEDIAN_FENSTER = 7;
  let defizit_median_kcal: number | null = null;
  let prognose_defizit_median: string | null = null;
  let prognosen_stand_median: string | null = null;
  let meilensteine_defizit_median: GewichtsMeilenstein[] = [];
  if (startG) {
    const anker = startG;
    const defz = tagesDefiziteMitDatum(db, umsatz, anker.datum, heute, heute);
    const medians = gleitenderMedian(
      defz.map((d) => d.defizit),
      MEDIAN_FENSTER,
    );
    defizit_median_kcal = medians.length ? medians[medians.length - 1] : null;
    // Kumulierter projizierter Verlust (Gramm) je Tag nach dem Anker.
    const kum: { datum: string; verlust: number }[] = [];
    let acc = 0;
    defz.forEach((d, i) => {
      if (d.datum <= anker.datum) return; // ab dem Tag NACH dem Anker
      acc += medians[i] / 7;
      kum.push({ datum: d.datum, verlust: acc });
    });
    const lossHeute = acc;
    const rateProTag =
      defizit_median_kcal !== null ? defizit_median_kcal / 7 : 0;
    // Datum, an dem die Median-Projektion ein Zielgewicht (Gramm) erreicht.
    const medianDatumFuer = (zielgewicht: number): string | null => {
      const noetig = anker.gramm - zielgewicht; // noch abzunehmende Gramm
      if (noetig <= 0) return anker.datum;
      const treffer = kum.find((k) => k.verlust >= noetig);
      if (treffer) return treffer.datum; // in der Vergangenheit erreicht
      if (rateProTag <= 0) return null; // ohne Abnahmerate nicht absehbar
      return verschiebeDatum(
        heute,
        Math.ceil((noetig - lossHeute) / rateProTag),
      );
    };
    // Wie beim Trend: Prognosen einfrieren, Zieltermin laeuft als
    // zusaetzlicher "Meilenstein" mit.
    const zielgewicht = anker.gramm - ziel.ziel_gramm;
    const alleGramm = meilensteinGramms.includes(zielgewicht)
      ? meilensteinGramms
      : [...meilensteinGramms, zielgewicht];
    const fest = frierePrognosenEin(
      db,
      'median',
      heute,
      alleGramm.map((g) => ({
        gramm: g,
        erreicht: erreichtAm(g) !== null,
        live: medianDatumFuer(g),
      })),
    );
    meilensteine_defizit_median = baueMeilensteine(fest.prognosen);
    prognose_defizit_median = fest.prognosen.get(zielgewicht) ?? null;
    prognosen_stand_median = fest.stand;
  }
  const defizit_median_gramm_pro_woche =
    defizit_median_kcal !== null ? -defizit_median_kcal : null;

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
    erst_gewicht_gramm,
    abgenommen_gesamt_gramm,
    ziel_gesamt_gramm,
    gewicht_prozent_gesamt,
    trend_gramm_pro_woche,
    prognose_gewichtstrend,
    meilensteine,
    defizit_median_kcal,
    defizit_median_gramm_pro_woche,
    prognose_defizit_median,
    meilensteine_defizit_median,
    prognosen_stand_trend,
    prognosen_stand_median,
  };
}
