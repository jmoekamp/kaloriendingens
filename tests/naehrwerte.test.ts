import { describe, it, expect } from 'vitest';
import {
  benoetigtesDefizitKcal,
  bewerteZiel,
  eiweissProKcal,
  eiweissProKgKoerper,
  formatGramm,
  formatKcal,
  formatKg,
  formatProzent,
  grammProGrammEiweiss,
  grammProKcal,
  kumulierteAbnahme,
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

  it('rechnet Kennzahlen je kcal / je Gramm Eiweiss', () => {
    // 100 g = 67 kcal, 12,0 g Eiweiss (120 dg).
    expect(eiweissProKcal(67, 120)).toBeCloseTo(12 / 67, 9); // g Eiweiss je kcal
    expect(grammProKcal(67)).toBeCloseTo(100 / 67, 9); // g je kcal
    expect(grammProGrammEiweiss(120)).toBeCloseTo(100 / 12, 9); // g je g Eiweiss
  });

  it('liefert null bei Division durch 0', () => {
    expect(eiweissProKcal(0, 120)).toBeNull();
    expect(grammProKcal(0)).toBeNull();
    expect(grammProGrammEiweiss(0)).toBeNull();
    expect(eiweissProKcal(67, 0)).toBe(0); // kein Eiweiss -> 0 je kcal
  });

  it('rechnet Eiweiss je kg Koerpergewicht', () => {
    // 1200 dg (120 g) bei 80 kg -> 1,5 g/kg
    expect(eiweissProKgKoerper(1200, 80000)).toBeCloseTo(1.5, 9);
    expect(eiweissProKgKoerper(1200, null)).toBeNull();
    expect(eiweissProKgKoerper(1200, 0)).toBeNull();
  });
});

describe('Kumulierte Abnahme (erwartet vs. gemessen)', () => {
  const gewichte = [
    { datum: '2026-07-10', gramm: 82000, aus_trend: true }, // Wasser-Tag: raus
    { datum: '2026-07-11', gramm: 80000, aus_trend: false }, // Anker
    { datum: '2026-07-13', gramm: 79300, aus_trend: false },
  ];
  const defizite = [
    { datum: '2026-07-11', defizit: 7000 }, // = Ankertag, zaehlt NICHT
    { datum: '2026-07-12', defizit: 3500 }, // -> 500 g erwartet
    { datum: '2026-07-13', defizit: 3500 }, // kumuliert 7000 -> 1000 g erwartet
  ];

  it('ankert am ersten nicht ausgeschlossenen Gewicht (Verlust 0)', () => {
    const { erwartet, gemessen } = kumulierteAbnahme(gewichte, defizite);
    expect(erwartet[0]).toEqual({ datum: '2026-07-11', verlust_gramm: 0 });
    expect(gemessen[0]).toEqual({ datum: '2026-07-11', verlust_gramm: 0 });
  });

  it('summiert das Defizit ab dem Tag nach dem Anker (Gramm = kcal/7)', () => {
    const { erwartet } = kumulierteAbnahme(gewichte, defizite);
    expect(erwartet.map((p) => p.datum)).toEqual([
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
    ]);
    expect(erwartet[1].verlust_gramm).toBeCloseTo(500, 6); // 3500/7
    expect(erwartet[2].verlust_gramm).toBeCloseTo(1000, 6); // 7000/7
  });

  it('misst den Verlust als Anker − Messung, ohne ausgeschlossene Tage', () => {
    const { gemessen } = kumulierteAbnahme(gewichte, defizite);
    expect(gemessen).toEqual([
      { datum: '2026-07-11', verlust_gramm: 0 },
      { datum: '2026-07-13', verlust_gramm: 700 },
    ]);
  });

  it('liefert leere Reihen ohne verwertbare Messung', () => {
    const nurAus = [{ datum: '2026-07-10', gramm: 82000, aus_trend: true }];
    expect(kumulierteAbnahme(nurAus, defizite)).toEqual({
      erwartet: [],
      gemessen: [],
    });
  });
});
