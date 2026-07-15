import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../server/db/index.ts';
import { AppError } from '../server/errors.ts';
import {
  createLebensmittel,
  deleteLebensmittel,
  getLebensmittel,
  listLebensmittel,
  updateLebensmittel,
} from '../server/repos/lebensmittel.ts';
import { createEintrag } from '../server/repos/eintraege.ts';

let db: Database;
beforeEach(() => {
  db = openDb({ file: ':memory:' });
});

describe('Lebensmittel-CRUD', () => {
  it('legt an, liest und listet', () => {
    const l = createLebensmittel(db, {
      name: 'Magerquark',
      kcal_pro_100g: 67,
      eiweiss_dg_pro_100g: 120,
    });
    expect(l.id).toBeGreaterThan(0);
    expect(l.eintrag_anzahl).toBe(0);
    expect(getLebensmittel(db, l.id)?.name).toBe('Magerquark');
    expect(listLebensmittel(db)).toHaveLength(1);
  });

  it('aktualisiert Werte', () => {
    const l = createLebensmittel(db, {
      name: 'Haferflocken',
      kcal_pro_100g: 370,
      eiweiss_dg_pro_100g: 135,
    });
    const u = updateLebensmittel(db, l.id, {
      name: 'Haferflocken fein',
      kcal_pro_100g: 372,
      eiweiss_dg_pro_100g: 136,
    });
    expect(u.name).toBe('Haferflocken fein');
    expect(u.kcal_pro_100g).toBe(372);
  });

  it('lehnt doppelte Namen ab', () => {
    createLebensmittel(db, {
      name: 'Apfel',
      kcal_pro_100g: 52,
      eiweiss_dg_pro_100g: 3,
    });
    expect(() =>
      createLebensmittel(db, {
        name: 'Apfel',
        kcal_pro_100g: 52,
        eiweiss_dg_pro_100g: 3,
      }),
    ).toThrow(AppError);
  });

  it('loescht nur, wenn kein Eintrag darauf verweist (Loeschschutz)', () => {
    const l = createLebensmittel(db, {
      name: 'Banane',
      kcal_pro_100g: 89,
      eiweiss_dg_pro_100g: 11,
    });
    createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      lebensmittel_id: l.id,
      menge_gramm: 120,
    });
    expect(() => deleteLebensmittel(db, l.id)).toThrow(AppError);

    // Ohne Verweis loeschbar.
    const frei = createLebensmittel(db, {
      name: 'Birne',
      kcal_pro_100g: 57,
      eiweiss_dg_pro_100g: 4,
    });
    deleteLebensmittel(db, frei.id);
    expect(getLebensmittel(db, frei.id)).toBeUndefined();
  });
});
