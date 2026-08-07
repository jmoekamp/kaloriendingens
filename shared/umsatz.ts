/**
 * Gesamtumsatz-Berechnung. Grundumsatz nach Mifflin-St Jeor, Gesamtumsatz
 * (TDEE) = Grundumsatz × Aktivitaetsfaktor (PAL). Zentral und getestet.
 */
import type { BmiFormel, Geschlecht } from './types.ts';

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

/**
 * Grundumsatz (kcal/Tag) nach Katch-McArdle: 370 + 21,6 × Magermasse (kg).
 * Magermasse = Gewicht × (1 − Fettanteil); Fettanteil in Promille (25,4 % = 254).
 * Geschlecht/Alter/Groesse gehen hier nicht ein – die Koerperkomposition steckt
 * im Fettanteil.
 */
export function grundumsatzKatchMcArdle(
  gewichtGramm: number,
  fettPromille: number,
): number {
  const magermasseKg = (gewichtGramm / 1000) * (1 - fettPromille / 1000);
  return 370 + 21.6 * magermasseKg;
}

/**
 * Gewicht (Gramm), bei dem ein bestimmter BMI erreicht ist.
 * - 'standard' (WHO): BMI = kg / m²        -> kg = BMI × m²
 * - 'trefethen' (Nick Trefethen, 2013): BMI = 1,3 × kg / m^2,5
 *                                          -> kg = BMI × m^2,5 / 1,3
 * Die Trefethen-Korrektur gleicht aus, dass der klassische BMI grosse Menschen
 * zu dick und kleine zu duenn rechnet.
 */
export function gewichtBeiBmi(
  bmi: number,
  groesseCm: number,
  formel: BmiFormel,
): number {
  const m = groesseCm / 100;
  const kg =
    formel === 'trefethen' ? (bmi * Math.pow(m, 2.5)) / 1.3 : bmi * m * m;
  return Math.round(kg * 1000);
}

/**
 * Alpert-Grenze: maximale Energie (kcal), die je Tag aus dem Koerperfett
 * mobilisiert werden kann. Alpert (2005) leitet eine spezifische Obergrenze von
 * ~290 kJ je kg Fettmasse und Tag ab (≈ 69,3 kcal/kg/Tag). Ein Tagesdefizit
 * oberhalb dieses Werts kann NICHT rein aus Fett gedeckt werden – der Rest geht
 * zu Lasten der Magermasse.
 */
export const ALPERT_KCAL_PRO_KG_FETT_TAG = 290 / 4.184; // ≈ 69,31 kcal/kg/Tag

/** Max. Fett-Energie je Tag (kcal) nach Alpert aus der Fettmasse (Gramm). */
export function maxFettverbrennungKcal(fettMasseGramm: number): number {
  return (fettMasseGramm / 1000) * ALPERT_KCAL_PRO_KG_FETT_TAG;
}

/**
 * BMI aus Gewicht (Gramm) und Groesse (cm) nach der gewaehlten Formel –
 * Umkehrung von `gewichtBeiBmi`:
 * - 'standard' (WHO): BMI = kg / m²
 * - 'trefethen' (2013): BMI = 1,3 × kg / m^2,5
 * null, wenn keine Groesse vorliegt.
 */
export function bmiWert(
  gewichtGramm: number,
  groesseCm: number,
  formel: BmiFormel,
): number | null {
  if (groesseCm <= 0) return null;
  const m = groesseCm / 100;
  const kg = gewichtGramm / 1000;
  return formel === 'trefethen' ? (1.3 * kg) / Math.pow(m, 2.5) : kg / (m * m);
}

/** Gesamtumsatz (kcal/Tag, gerundet) nach Katch-McArdle × Aktivitaetsfaktor. */
export function gesamtumsatzKatch(
  gewichtGramm: number,
  fettPromille: number,
  aktivitaetsfaktor: number,
): number {
  return Math.round(
    grundumsatzKatchMcArdle(gewichtGramm, fettPromille) * aktivitaetsfaktor,
  );
}
