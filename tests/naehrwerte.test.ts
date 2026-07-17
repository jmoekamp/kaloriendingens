import { describe, it, expect } from 'vitest';
import {
  benoetigtesDefizitKcal,
  bewerteZiel,
  eiweissGrammProGramm,
  formatDezimal,
  formatGramm,
  formatKcal,
  formatKg,
  formatProzent,
  kcalProGramm,
  lineareRegression,
  parseGanzzahl,
  parseGrammToDg,
  parseKgToGramm,
  portionEiweissDg,
  portionKcal,
} from '../shared/naehrwerte.ts';

describe('Portionsrechnung', () => {
  it('rechnet kcal je 100 g auf eine Menge um', () => {
    expect(portionKcal(250, 100)).toBe(250);
    expect(portionKcal(250, 150)).toBe(375);
    expect(portionKcal(64, 30)).toBe(19); // 19,2 -> 19
    expect(portionKcal(0, 200)).toBe(0);
  });

  it('rundet kaufmaennisch (0,5 auf)', () => {
    expect(portionKcal(50, 51)).toBe(26); // 25,5 -> 26
  });

  it('rechnet Eiweiss (dg) je 100 g auf eine Menge um', () => {
    expect(portionEiweissDg(125, 100)).toBe(125); // 12,5 g
    expect(portionEiweissDg(125, 200)).toBe(250); // 25,0 g
    expect(portionEiweissDg(120, 50)).toBe(60); // 6,0 g
  });
});

describe('Formatierung', () => {
  it('formatiert kcal deutsch mit Tausenderpunkt', () => {
    expect(formatKcal(0)).toBe('0');
    expect(formatKcal(1234)).toBe('1.234');
    expect(formatKcal(-500)).toBe('-500');
  });

  it('formatiert Dezigramm als Gramm mit einer Nachkommastelle', () => {
    expect(formatGramm(0)).toBe('0,0');
    expect(formatGramm(125)).toBe('12,5');
    expect(formatGramm(1205)).toBe('120,5');
    expect(formatGramm(-125)).toBe('-12,5');
  });
});

describe('Eingabe-Parser', () => {
  it('parst Gramm mit Komma oder Punkt in Dezigramm', () => {
    expect(parseGrammToDg('12,5')).toBe(125);
    expect(parseGrammToDg('12.5')).toBe(125);
    expect(parseGrammToDg('120')).toBe(1200);
    expect(parseGrammToDg('0')).toBe(0);
    expect(parseGrammToDg('')).toBeNull();
    expect(parseGrammToDg('abc')).toBeNull();
    expect(parseGrammToDg('-3')).toBeNull();
  });

  it('parst nicht-negative Ganzzahlen', () => {
    expect(parseGanzzahl('250')).toBe(250);
    expect(parseGanzzahl('0')).toBe(0);
    expect(parseGanzzahl('')).toBeNull();
    expect(parseGanzzahl('12,5')).toBeNull();
    expect(parseGanzzahl('-1')).toBeNull();
  });
});

describe('Zielbewertung', () => {
  it('bewertet ein Maximum-Ziel', () => {
    const unter = bewerteZiel(1500, 1800, 'max');
    expect(unter.erfuellt).toBe(true);
    expect(unter.abweichung).toBe(-300);
    const ueber = bewerteZiel(2000, 1800, 'max');
    expect(ueber.erfuellt).toBe(false);
    expect(ueber.abweichung).toBe(200);
  });

  it('bewertet ein Minimum-Ziel', () => {
    expect(bewerteZiel(1300, 1200, 'min').erfuellt).toBe(true);
    expect(bewerteZiel(1000, 1200, 'min').erfuellt).toBe(false);
  });

  it('gilt bei Ziel 0 als nicht gesetzt (immer erfuellt)', () => {
    const b = bewerteZiel(500, 0, 'max');
    expect(b.hat_ziel).toBe(false);
    expect(b.erfuellt).toBe(true);
  });
});

describe('Gewicht / Abnehmziel', () => {
  it('rechnet kg in Gramm und zurueck', () => {
    expect(parseKgToGramm('5')).toBe(5000);
    expect(parseKgToGramm('5,5')).toBe(5500);
    expect(parseKgToGramm('0')).toBeNull(); // muss > 0 sein
    expect(parseKgToGramm('')).toBeNull();
    expect(formatKg(5500)).toBe('5,5');
    expect(formatKg(5000)).toBe('5,0');
  });

  it('rechnet das noetige Defizit als Gewicht × 7000 kcal/kg', () => {
    expect(benoetigtesDefizitKcal(5000)).toBe(35000); // 5 kg
    expect(benoetigtesDefizitKcal(500)).toBe(3500); // 0,5 kg
  });
});

describe('Lineare Regression', () => {
  it('findet Steigung und Achsenabschnitt einer Geraden', () => {
    // y = 2x + 3
    const r = lineareRegression([0, 1, 2, 3], [3, 5, 7, 9]);
    expect(r).not.toBeNull();
    expect(r!.steigung).toBeCloseTo(2, 9);
    expect(r!.achsenabschnitt).toBeCloseTo(3, 9);
  });

  it('erkennt einen fallenden Trend (Gewicht)', () => {
    // Tag 0..3, Gewicht faellt um 100 g/Tag ab 82.000 g
    const r = lineareRegression([0, 1, 2, 3], [82000, 81900, 81800, 81700]);
    expect(r!.steigung).toBeCloseTo(-100, 6);
  });

  it('liefert null bei zu wenigen Punkten oder konstantem x', () => {
    expect(lineareRegression([1], [2])).toBeNull();
    expect(lineareRegression([5, 5, 5], [1, 2, 3])).toBeNull();
  });

  it('formatiert Prozent mit zwei Nachkommastellen (Komma)', () => {
    expect(formatProzent((4565 / 35000) * 100)).toBe('13,04');
    expect(formatProzent(0)).toBe('0,00');
    expect(formatProzent(100)).toBe('100,00');
    expect(formatProzent(13.239)).toBe('13,24');
    expect(formatProzent(-0.001)).toBe('0,00'); // kein "-0,00"
  });

  it('rechnet und formatiert Naehrwerte je Gramm', () => {
    expect(kcalProGramm(250)).toBe(2.5);
    expect(eiweissGrammProGramm(120)).toBeCloseTo(0.12, 6);
    expect(formatDezimal(kcalProGramm(250))).toBe('2,50');
    expect(formatDezimal(eiweissGrammProGramm(120))).toBe('0,12');
  });
});
