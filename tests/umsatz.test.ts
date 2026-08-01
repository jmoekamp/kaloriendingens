import { describe, it, expect } from 'vitest';
import {
  gesamtumsatzBerechnet,
  gesamtumsatzKatch,
  gewichtBeiBmi,
  grundumsatzKatchMcArdle,
  grundumsatzMifflin,
} from '../shared/umsatz.ts';

describe('Grundumsatz (Mifflin-St Jeor)', () => {
  it('rechnet fuer einen Mann', () => {
    // 80 kg, 180 cm, 40 Jahre: 10*80 + 6,25*180 − 5*40 + 5 = 1730
    expect(grundumsatzMifflin(80000, 180, 40, 'm')).toBeCloseTo(1730, 6);
  });

  it('rechnet fuer eine Frau', () => {
    // 65 kg, 168 cm, 35 Jahre: 650 + 1050 − 175 − 161 = 1364
    expect(grundumsatzMifflin(65000, 168, 35, 'w')).toBeCloseTo(1364, 6);
  });
});

describe('Grundumsatz (Katch-McArdle)', () => {
  it('rechnet aus der Magermasse (370 + 21,6 × LBM)', () => {
    // 80 kg, 25,0 % Fett -> Magermasse 60 kg -> 370 + 21,6*60 = 1666
    expect(grundumsatzKatchMcArdle(80000, 250)).toBeCloseTo(1666, 6);
    // 80 kg, 25,4 % Fett -> LBM 59,68 kg -> 370 + 1289,088 = 1659,088
    expect(grundumsatzKatchMcArdle(80000, 254)).toBeCloseTo(1659.088, 6);
  });

  it('sinkt mit steigendem Fettanteil (weniger Magermasse)', () => {
    expect(grundumsatzKatchMcArdle(80000, 300)).toBeLessThan(
      grundumsatzKatchMcArdle(80000, 200),
    );
  });
});

describe('Gewicht bei BMI (Standard vs. Trefethen)', () => {
  it('rechnet Standard: BMI × m² (in Gramm)', () => {
    // 25 × 1,8² = 81,0 kg
    expect(gewichtBeiBmi(25, 180, 'standard')).toBe(81000);
    // 25 × 1,6² = 64,0 kg
    expect(gewichtBeiBmi(25, 160, 'standard')).toBe(64000);
  });

  it('rechnet Trefethen: BMI × m^2,5 / 1,3', () => {
    // 25 × 1,8^2,5 / 1,3 = 83,594... kg -> 83595 g
    expect(gewichtBeiBmi(25, 180, 'trefethen')).toBe(83595);
    // Trefethen erlaubt Grossen mehr Gewicht als der Standard-BMI ...
    expect(gewichtBeiBmi(25, 190, 'trefethen')).toBeGreaterThan(
      gewichtBeiBmi(25, 190, 'standard'),
    );
    // ... und Kleinen weniger.
    expect(gewichtBeiBmi(25, 150, 'trefethen')).toBeLessThan(
      gewichtBeiBmi(25, 150, 'standard'),
    );
  });
});

describe('Gesamtumsatz', () => {
  it('multipliziert mit dem Aktivitaetsfaktor und rundet', () => {
    // BMR 1730 × 1,55 = 2681,5 -> 2682
    expect(gesamtumsatzBerechnet(80000, 180, 40, 'm', 1.55)).toBe(2682);
  });

  it('sinkt mit sinkendem Gewicht', () => {
    const schwer = gesamtumsatzBerechnet(90000, 180, 40, 'm', 1.5);
    const leicht = gesamtumsatzBerechnet(80000, 180, 40, 'm', 1.5);
    expect(leicht).toBeLessThan(schwer);
  });

  it('rechnet Katch-McArdle × Aktivitaetsfaktor gerundet', () => {
    // BMR 1666 × 1,5 = 2499
    expect(gesamtumsatzKatch(80000, 250, 1.5)).toBe(2499);
  });
});
