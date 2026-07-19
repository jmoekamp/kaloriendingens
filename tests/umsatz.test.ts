import { describe, it, expect } from 'vitest';
import { gesamtumsatzBerechnet, grundumsatzMifflin } from '../shared/umsatz.ts';

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
});
