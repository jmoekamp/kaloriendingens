/**
 * Zentrale Naehrwert-Hilfsfunktionen. Einheiten wie in shared/types.ts:
 * kcal als ganze Kilokalorien, Eiweiss in Dezigramm (0,1 g), Mengen in Gramm.
 * Diese Datei ist die EINE Stelle fuer Portionsrechnung, Formatierung und
 * Zielbewertung – sie wird von Backend (Auswertung) und Frontend genutzt.
 */
import type { ZielTyp, Zielbewertung } from './types.ts';

/** kaufmaennisch auf die ganze Einheit runden (0,5 rundet auf). */
function runde(n: number): number {
  return Math.round(n);
}

/** kcal einer Portion: Wert-je-100g × Menge / 100, kaufmaennisch gerundet. */
export function portionKcal(kcalPro100g: number, mengeGramm: number): number {
  return runde((kcalPro100g * mengeGramm) / 100);
}

/** Eiweiss (dg) einer Portion: Wert-je-100g × Menge / 100, kaufmaennisch gerundet. */
export function portionEiweissDg(
  eiweissDgPro100g: number,
  mengeGramm: number,
): number {
  return runde((eiweissDgPro100g * mengeGramm) / 100);
}

/** Tausender-Gruppierung (deutsch: Punkt) ohne Locale-Abhaengigkeit. */
function gruppiere(ganzzahl: number): string {
  return ganzzahl.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formatiert ganze kcal deutsch, z. B. 1234 -> "1.234". */
export function formatKcal(kcal: number): string {
  const g = runde(kcal);
  return `${g < 0 ? '-' : ''}${gruppiere(Math.abs(g))}`;
}

/** Formatiert Dezigramm als Gramm mit einer Nachkommastelle, z. B. 125 -> "12,5". */
export function formatGramm(dg: number): string {
  const g = runde(dg);
  const negativ = g < 0;
  const abs = Math.abs(g);
  const ganz = Math.floor(abs / 10);
  const rest = abs % 10;
  return `${negativ ? '-' : ''}${gruppiere(ganz)},${rest}`;
}

/**
 * Parst eine Gramm-Eingabe (Eiweiss je 100 g) in Dezigramm. Akzeptiert Komma
 * und Punkt als Dezimaltrenner; rundet kaufmaennisch auf die erste Nachkomma-
 * stelle. Liefert null bei leerer/ungueltiger Eingabe.
 */
export function parseGrammToDg(eingabe: string): number | null {
  const t = eingabe.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d*(\.\d*)?$/.test(t) || t === '.') return null;
  const zahl = Number(t);
  if (!Number.isFinite(zahl) || zahl < 0) return null;
  return runde(zahl * 10);
}

/** Parst eine nicht-negative Ganzzahl-Eingabe (kcal, Gramm-Menge). */
export function parseGanzzahl(eingabe: string): number | null {
  const t = eingabe.trim();
  if (t === '' || !/^\d+$/.test(t)) return null;
  return Number(t);
}

/** Formatiert eine Dezimalzahl mit fester Nachkommastellenzahl (deutsch: Komma). */
export function formatDezimal(wert: number, stellen = 2): string {
  const faktor = 10 ** stellen;
  const gerundet = Math.round(wert * faktor) / faktor;
  // -0 vermeiden, damit nicht "-0,00" erscheint.
  const norm = gerundet === 0 ? 0 : gerundet;
  return norm.toFixed(stellen).replace('.', ',');
}

/** Formatiert einen Prozentwert mit fester Nachkommastellenzahl (deutsch: Komma). */
export function formatProzent(wert: number, stellen = 2): string {
  return formatDezimal(wert, stellen);
}

/**
 * Eiweiss (Gramm) je kcal – „Protein pro Kalorie", hoeher = eiweissreicher bei
 * gleicher Energie. null, wenn kcal je 100 g = 0.
 */
export function eiweissProKcal(
  kcalPro100g: number,
  eiweissDgPro100g: number,
): number | null {
  if (kcalPro100g <= 0) return null;
  return eiweissDgPro100g / 10 / kcalPro100g;
}

/** Gramm des Lebensmittels je kcal (100 g / kcal). null, wenn kcal = 0. */
export function grammProKcal(kcalPro100g: number): number | null {
  return kcalPro100g > 0 ? 100 / kcalPro100g : null;
}

/** Gramm des Lebensmittels je Gramm Eiweiss (100 g / Eiweiss-g). null, wenn kein Eiweiss. */
export function grammProGrammEiweiss(eiweissDgPro100g: number): number | null {
  return eiweissDgPro100g > 0 ? 1000 / eiweissDgPro100g : null;
}

/**
 * Eiweiss (g) je kg Koerpergewicht: eiweissDg (Dezigramm) und gewichtGramm.
 * null, wenn kein Gewicht vorliegt. Formel: (eiweissDg/10) / (gewichtGramm/1000).
 */
export function eiweissProKgKoerper(
  eiweissDg: number,
  gewichtGramm: number | null,
): number | null {
  if (gewichtGramm === null || gewichtGramm <= 0) return null;
  return (eiweissDg * 100) / gewichtGramm;
}

/** Median einer nicht-leeren Zahlenreihe (Kopie wird sortiert). */
function medianVon(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Gleitender (nachlaufender) Median: fuer jeden Index i der Median der Werte im
 * Fenster [i-fenster+1 .. i] (am Anfang entsprechend kuerzer). `fenster` wird auf
 * mindestens 1 begrenzt. Leere Eingabe liefert eine leere Ausgabe.
 */
export function gleitenderMedian(werte: number[], fenster: number): number[] {
  const w = Math.max(1, Math.floor(fenster));
  return werte.map((_, i) =>
    medianVon(werte.slice(Math.max(0, i - w + 1), i + 1)),
  );
}

/** Tagesnummer (Tage seit Epoche, UTC) fuer Fenster-/Regressionsrechnung. */
function tagesNummer(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Gleitender (nachlaufender) Durchschnitt einer Gewichtsreihe ueber ein
 * KALENDER-Fenster: je Messpunkt der Mittelwert aller Messungen der letzten
 * `fensterTage` Kalendertage (inkl. des Tages selbst). So werden Luecken korrekt
 * behandelt – ein fehlender Tag zaehlt nicht als 0, sondern faellt aus dem
 * Mittel. Es werden nur echte Messtage als Stuetzstellen ausgegeben.
 */
export function gleitenderTagesdurchschnitt(
  punkte: { datum: string; gramm: number }[],
  fensterTage = 7,
): { datum: string; gramm: number }[] {
  const sortiert = [...punkte].sort((a, b) =>
    a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0,
  );
  return sortiert.map((p) => {
    const bis = tagesNummer(p.datum);
    const von = bis - fensterTage + 1;
    const fenster = sortiert.filter((q) => {
      const t = tagesNummer(q.datum);
      return t >= von && t <= bis;
    });
    const summe = fenster.reduce((s, q) => s + q.gramm, 0);
    return { datum: p.datum, gramm: summe / fenster.length };
  });
}

/** Ein Punkt der Steigungs-Abweichung (gemessen vs. Defizit-Erwartung). */
export interface SteigungsAbweichungPunkt {
  datum: string;
  /**
   * Gemessene Trend-Steigung minus aus dem Defizit erwartete Steigung, in
   * Gramm/Tag. Positiv = Abnahme LANGSAMER als das Defizit erwarten liesse
   * (oder Zunahme), negativ = schneller.
   */
  abweichung_gramm_pro_tag: number;
}

/**
 * Abweichung der Gewichts-Steigung von der Defizit-Erwartung, gleitend je
 * Messtag: Fuer jeden nicht ausgeschlossenen Messpunkt wird ueber die letzten
 * `fensterTage` Tage die Regressions-Steigung (a) der Messungen und (b) der
 * PROJIZIERTEN Gewichtskurve aus dem kumulierten Defizit (−kum/7,
 * 7000 kcal/kg) berechnet – bewusst mit DEMSELBEN Schaetzer an DENSELBEN
 * Stuetzstellen (Messtage), damit eine Defizit-Aenderung beide Seiten synchron
 * durchlaeuft und KEINEN Uebergangs-Artefakt erzeugt. Die Differenz (a − b)
 * ist der Punktwert. Tage ohne mindestens zwei Messungen bzw. ohne
 * Defizit-Tag im Fenster werden uebersprungen.
 */
export function steigungsAbweichung(
  gewichte: { datum: string; gramm: number; aus_trend: boolean }[],
  defizitTage: { datum: string; defizit: number }[],
  fensterTage = 14,
): SteigungsAbweichungPunkt[] {
  const messungen = gewichte
    .filter((g) => !g.aus_trend)
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  const defSortiert = [...defizitTage].sort((a, b) =>
    a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0,
  );
  // Kumuliertes Defizit je Defizit-Tag (Praefixsummen).
  let acc = 0;
  const kum = defSortiert.map((d) => ({
    datum: d.datum,
    kum: (acc += d.defizit),
  }));
  // Kumuliertes Defizit bis einschliesslich `datum` (Carry-forward, 0 davor).
  const kumBis = (datum: string): number => {
    let wert = 0;
    for (const k of kum) {
      if (k.datum <= datum) wert = k.kum;
      else break;
    }
    return wert;
  };

  const punkte: SteigungsAbweichungPunkt[] = [];
  for (const m of messungen) {
    const bis = tagesNummer(m.datum);
    const von = bis - fensterTage + 1;
    const fensterMessungen = messungen.filter((w) => {
      const t = tagesNummer(w.datum);
      return t >= von && t <= bis;
    });
    if (fensterMessungen.length < 2) continue;
    const xs = fensterMessungen.map((w) => tagesNummer(w.datum));
    const regMess = lineareRegression(
      xs,
      fensterMessungen.map((w) => w.gramm),
    );
    if (!regMess) continue;
    // Ohne Defizit-Tag im Fenster waere die Erwartung inhaltsleer (Steigung 0).
    const hatDefizit = defSortiert.some((d) => {
      const t = tagesNummer(d.datum);
      return t >= von && t <= bis;
    });
    if (!hatDefizit) continue;
    // Erwartung: dieselbe Regression ueber die projizierte Kurve −kum/7 an den
    // Messtagen (der konstante Offset kuerzt sich in der Steigung heraus).
    const regProj = lineareRegression(
      xs,
      fensterMessungen.map((w) => -kumBis(w.datum) / 7),
    );
    if (!regProj) continue;
    punkte.push({
      datum: m.datum,
      abweichung_gramm_pro_tag: regMess.steigung - regProj.steigung,
    });
  }
  return punkte;
}

/** Ein kumulierter Abnahme-Wert (Gramm Verlust ab dem Startpunkt) an einem Tag. */
export interface AbnahmePunkt {
  datum: string;
  /** Kumulierter Gewichtsverlust in Gramm (positiv = abgenommen). */
  verlust_gramm: number;
}

/**
 * Kumulierter Gewichtsverlust – erwartet (aus dem Defizit) vs. gemessen.
 *
 * Ausgangspunkt ist die erste NICHT ausgeschlossene Messung (Anker); dort ist
 * der Verlust in beiden Reihen 0. `erwartet` addiert ab dem Tag nach dem Anker
 * je Tag das Tagesdefizit auf und rechnet es ueber 7000 kcal/kg in Gramm um
 * (Gramm = Defizit_kcal / 7). `gemessen` ist je nicht ausgeschlossener Messung
 * ab dem Anker die Differenz Anker − Messung. So lassen sich beide Reihen direkt
 * vergleichen (voraus/hinterher gegenueber dem 7000-kcal/kg-Modell). Ohne
 * verwertbare Messung sind beide Reihen leer.
 */
export function kumulierteAbnahme(
  gewichte: { datum: string; gramm: number; aus_trend: boolean }[],
  defizitTage: { datum: string; defizit: number }[],
): { erwartet: AbnahmePunkt[]; gemessen: AbnahmePunkt[] } {
  const messungen = gewichte
    .filter((g) => !g.aus_trend)
    .sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
  if (messungen.length === 0) return { erwartet: [], gemessen: [] };

  const anker = messungen[0];
  const gemessen: AbnahmePunkt[] = messungen.map((m) => ({
    datum: m.datum,
    verlust_gramm: anker.gramm - m.gramm,
  }));

  const erwartet: AbnahmePunkt[] = [{ datum: anker.datum, verlust_gramm: 0 }];
  let kumDefizit = 0;
  for (const d of [...defizitTage].sort((a, b) =>
    a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0,
  )) {
    if (d.datum <= anker.datum) continue; // erst ab dem Tag NACH dem Anker
    kumDefizit += d.defizit;
    erwartet.push({ datum: d.datum, verlust_gramm: kumDefizit / 7 });
  }
  return { erwartet, gemessen };
}

/**
 * Lineare Regression (kleinste Quadrate) ueber Wertepaare (xs, ys). Liefert
 * Steigung und Achsenabschnitt der Ausgleichsgeraden y = steigung·x + abschnitt,
 * oder null, wenn zu wenige Punkte oder die x-Werte alle gleich sind.
 */
export function lineareRegression(
  xs: number[],
  ys: number[],
): { steigung: number; achsenabschnitt: number } | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
    sxy += xs[i] * ys[i];
    sxx += xs[i] * xs[i];
  }
  const nenner = n * sxx - sx * sx;
  if (nenner === 0) return null;
  const steigung = (n * sxy - sx * sy) / nenner;
  const achsenabschnitt = (sy - steigung * sx) / n;
  return { steigung, achsenabschnitt };
}

/** Energiegehalt von Koerperfett: ca. 7000 kcal je Kilogramm. */
export const KCAL_PRO_KG_FETT = 7000;

/** Noetiges Defizit (kcal) fuer ein Abnehmziel in Gramm: Gramm/1000 × 7000. */
export function benoetigtesDefizitKcal(zielGramm: number): number {
  return runde((zielGramm * KCAL_PRO_KG_FETT) / 1000);
}

/** Formatiert Gramm als Kilogramm mit einer Nachkommastelle, z. B. 5500 -> "5,5". */
export function formatKg(gramm: number): string {
  const zehntelKg = runde(gramm / 100); // in 0,1-kg-Schritten
  const negativ = zehntelKg < 0;
  const abs = Math.abs(zehntelKg);
  return `${negativ ? '-' : ''}${Math.floor(abs / 10)},${abs % 10}`;
}

/** Parst eine Kilogramm-Eingabe (Komma/Punkt) in Gramm. Muss > 0 sein. */
export function parseKgToGramm(eingabe: string): number | null {
  const t = eingabe.trim().replace(',', '.');
  if (t === '' || !/^\d*(\.\d*)?$/.test(t) || t === '.') return null;
  const kg = Number(t);
  if (!Number.isFinite(kg) || kg <= 0) return null;
  return runde(kg * 1000);
}

/**
 * Bewertet eine Summe gegen ein Ziel. abweichung = summe - ziel (vorzeichen-
 * behaftet). Bei Zieltyp 'max' ist das Ziel eine Obergrenze (erfuellt, solange
 * summe <= ziel), bei 'min' eine Untergrenze (erfuellt, solange summe >= ziel).
 * Ein Ziel von 0 gilt als „nicht gesetzt" – dann ist erfuellt = true.
 */
export function bewerteZiel(
  summe: number,
  ziel: number,
  typ: ZielTyp,
): Zielbewertung {
  const hat_ziel = ziel > 0;
  const abweichung = summe - ziel;
  let erfuellt = true;
  if (hat_ziel) {
    erfuellt = typ === 'max' ? summe <= ziel : summe >= ziel;
  }
  return { summe, ziel, typ, abweichung, erfuellt, hat_ziel };
}
