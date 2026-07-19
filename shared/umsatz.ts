/**
 * Gesamtumsatz-Berechnung. Grundumsatz nach Mifflin-St Jeor, Gesamtumsatz
 * (TDEE) = Grundumsatz × Aktivitaetsfaktor (PAL). Zentral und getestet.
 */
import type { Geschlecht } from './types.ts';

/** Vordefinierte Aktivitaetsstufen (PAL). */
export const AKTIVITAETSSTUFEN: { faktor: number; label: string }[] = [
  { faktor: 1.2, label: 'sitzend (kaum Bewegung)' },
  { faktor: 1.375, label: 'leicht aktiv (leichter Sport 1–3×/Woche)' },
  { faktor: 1.55, label: 'mäßig aktiv (Sport 3–5×/Woche)' },
  { faktor: 1.725, label: 'aktiv (Sport 6–7×/Woche)' },
  { faktor: 1.9, label: 'sehr aktiv (harter Sport / körperliche Arbeit)' },
];

/**
 * Grundumsatz (kcal/Tag) nach Mifflin-St Jeor.
 * Mann: 10·kg + 6,25·cm − 5·Alter + 5; Frau: … − 161.
 */
export function grundumsatzMifflin(
  gewichtGramm: number,
  groesseCm: number,
  alterJahre: number,
  geschlecht: Geschlecht,
): number {
  const kg = gewichtGramm / 1000;
  const basis = 10 * kg + 6.25 * groesseCm - 5 * alterJahre;
  return basis + (geschlecht === 'm' ? 5 : -161);
}

/** Gesamtumsatz (kcal/Tag, gerundet) = Grundumsatz × Aktivitaetsfaktor. */
export function gesamtumsatzBerechnet(
  gewichtGramm: number,
  groesseCm: number,
  alterJahre: number,
  geschlecht: Geschlecht,
  aktivitaetsfaktor: number,
): number {
  const bmr = grundumsatzMifflin(
    gewichtGramm,
    groesseCm,
    alterJahre,
    geschlecht,
  );
  return Math.round(bmr * aktivitaetsfaktor);
}
