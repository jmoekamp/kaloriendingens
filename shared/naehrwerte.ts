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
