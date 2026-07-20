import { describe, it, expect } from 'vitest';
import { mapOffProdukt } from '../server/off.ts';

describe('Open-Food-Facts-Mapping', () => {
  it('mappt kcal, Eiweiss (in dg) und Packungsgroesse', () => {
    const t = mapOffProdukt({
      code: '4000000000000',
      product_name: 'Magerquark',
      brands: 'Marke A, Marke B',
      product_quantity: '500',
      nutriments: { 'energy-kcal_100g': 67, proteins_100g: 12 },
    });
    expect(t.code).toBe('4000000000000');
    expect(t.name).toBe('Marke A Magerquark'); // Marke zuerst, dann Produkt
    expect(t.kcal_pro_100g).toBe(67);
    expect(t.eiweiss_dg_pro_100g).toBe(120); // 12 g -> 120 dg
    expect(t.packung_gramm).toBe(500);
  });

  it('rechnet kJ in kcal um, wenn keine kcal vorliegen', () => {
    // 280 kJ / 4,184 = 66,9 -> 67
    const t = mapOffProdukt({
      product_name: 'Testprodukt',
      nutriments: { energy_100g: 280, proteins_100g: 5.5 },
    });
    expect(t.kcal_pro_100g).toBe(67);
    expect(t.eiweiss_dg_pro_100g).toBe(55); // 5,5 g -> 55 dg
  });

  it('parst die Packungsgroesse aus einer Textangabe (g/kg)', () => {
    expect(
      mapOffProdukt({ product_name: 'A', quantity: '250 g' }).packung_gramm,
    ).toBe(250);
    expect(
      mapOffProdukt({ product_name: 'B', quantity: '1,5 kg' }).packung_gramm,
    ).toBe(1500);
    // Fluessigkeiten (ml/l) werden nicht uebernommen.
    expect(
      mapOffProdukt({ product_name: 'C', quantity: '500 ml' }).packung_gramm,
    ).toBeNull();
  });

  it('verarbeitet Search-a-licious-Treffer (brands als Array, energy-kj)', () => {
    const t = mapOffProdukt({
      code: '7613404824306',
      product_name: 'Magerquark',
      brands: ['Migros Bio', 'Migros'],
      nutriments: { 'energy-kj_100g': 280, proteins_100g: 9.5 },
    });
    expect(t.name).toBe('Migros Bio Magerquark'); // erste Marke aus dem Array, zuerst
    expect(t.kcal_pro_100g).toBe(67); // 280 kJ -> 67 kcal
    expect(t.eiweiss_dg_pro_100g).toBe(95);
    expect(t.packung_gramm).toBeNull();
  });

  it('liefert null-Werte, wenn Naehrwerte fehlen, und haengt Marke nicht doppelt an', () => {
    const t = mapOffProdukt({
      product_name: 'Marke A Joghurt',
      brands: 'Marke A',
      nutriments: {},
    });
    expect(t.name).toBe('Marke A Joghurt'); // Marke schon im Namen -> nicht doppelt
    expect(t.kcal_pro_100g).toBeNull();
    expect(t.eiweiss_dg_pro_100g).toBeNull();
    expect(t.packung_gramm).toBeNull();
  });
});
