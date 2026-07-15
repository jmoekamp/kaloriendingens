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
