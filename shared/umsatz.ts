/**
 * Gesamtumsatz-Berechnung. Grundumsatz nach Mifflin-St Jeor, Gesamtumsatz
 * (TDEE) = Grundumsatz × Aktivitaetsfaktor (PAL). Zentral und getestet.
 */
import type { Geschlecht } from './types.ts';

/**
 * Aktivitaetsstufen (PAL) nach den Referenzwerten der Deutschen Gesellschaft
 * fuer Ernaehrung (DGE). Die DGE nennt Bereiche; die 0,1-Schritte innerhalb der
 * Bereiche stehen zur Auswahl.
 */
const SITZEND_BUERO =
  'sitzende Tätigkeit, wenig Freizeitaktivität (z. B. Büro)';
const SITZEND_GEHEND =
  'sitzend mit zeitweise Gehen/Stehen (z. B. Laborant, Kraftfahrer)';
const GEHEND_STEHEND =
  'überwiegend gehend/stehend (z. B. Handwerker, Pflege, Kellner)';
const ANSTRENGEND =
  'körperlich anstrengende Arbeit (z. B. Bau, Landwirt, Leistungssport)';
export const AKTIVITAETSSTUFEN: { faktor: number; label: string }[] = [
  { faktor: 1.2, label: 'sitzende/liegende Lebensweise (z. B. bettlägerig)' },
  { faktor: 1.4, label: SITZEND_BUERO },
  { faktor: 1.5, label: SITZEND_BUERO },
  { faktor: 1.6, label: SITZEND_GEHEND },
  { faktor: 1.7, label: SITZEND_GEHEND },
  { faktor: 1.8, label: GEHEND_STEHEND },
  { faktor: 1.9, label: GEHEND_STEHEND },
  { faktor: 2.0, label: ANSTRENGEND },
  { faktor: 2.1, label: ANSTRENGEND },
  { faktor: 2.2, label: ANSTRENGEND },
  { faktor: 2.3, label: ANSTRENGEND },
  { faktor: 2.4, label: ANSTRENGEND },
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
