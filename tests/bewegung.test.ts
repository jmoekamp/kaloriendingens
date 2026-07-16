import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../server/db/index.ts';
import { AppError } from '../server/errors.ts';
import {
  bewegungKcalProTag,
  createBewegung,
  deleteBewegung,
  listBewegungFuerTag,
  updateBewegung,
} from '../server/repos/bewegung.ts';
import { createLebensmittel } from '../server/repos/lebensmittel.ts';
import { createEintrag } from '../server/repos/eintraege.ts';
import { upsertVorgabe } from '../server/repos/vorgaben.ts';
import { getDefizitReport } from '../server/repos/auswertung.ts';

let db: Database;
beforeEach(() => {
  db = openDb({ file: ':memory:' });
});

describe('Bewegung-CRUD', () => {
  it('legt an, listet nach Uhrzeit, aktualisiert und loescht', () => {
    createBewegung(db, {
      datum: '2026-07-15',
      uhrzeit: '18:00',
      beschreibung: 'Laufen',
      kcal: 400,
    });
    const b = createBewegung(db, {
      datum: '2026-07-15',
      uhrzeit: '07:30',
      beschreibung: 'Radfahren',
      kcal: 250,
    });
    const liste = listBewegungFuerTag(db, '2026-07-15');
    expect(liste.map((x) => x.uhrzeit)).toEqual(['07:30', '18:00']);

    const u = updateBewegung(db, b.id, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      beschreibung: 'Radfahren zügig',
      kcal: 300,
    });
    expect(u.kcal).toBe(300);
    expect(u.beschreibung).toBe('Radfahren zügig');

    deleteBewegung(db, b.id);
    expect(listBewegungFuerTag(db, '2026-07-15')).toHaveLength(1);
    expect(() => deleteBewegung(db, 999)).toThrow(AppError);
  });

  it('weist ungueltige Eingaben ab', () => {
    const basis = {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      beschreibung: 'Test',
      kcal: 100,
    };
    expect(() => createBewegung(db, { ...basis, uhrzeit: '99:99' })).toThrow(
      AppError,
    );
    expect(() => createBewegung(db, { ...basis, beschreibung: '  ' })).toThrow(
      AppError,
    );
    expect(() => createBewegung(db, { ...basis, kcal: 0 })).toThrow(AppError);
  });

  it('summiert Aktivitaetskalorien je Tag', () => {
    createBewegung(db, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      beschreibung: 'A',
      kcal: 200,
    });
    createBewegung(db, {
      datum: '2026-07-15',
      uhrzeit: '18:00',
      beschreibung: 'B',
      kcal: 150,
    });
    const map = bewegungKcalProTag(db, null, null);
    expect(map.get('2026-07-15')).toBe(350);
  });
});

describe('Bewegung erhoeht das Tagesdefizit', () => {
  it('addiert Aktivitaetskalorien zum Gesamtverbrauch', () => {
    createLebensmittel(db, {
      name: 'Magerquark',
      kcal_pro_100g: 67,
      eiweiss_dg_pro_100g: 120,
      packung_gramm: null,
    });
    upsertVorgabe(db, {
      gueltig_ab: '2000-01-01',
      kcal_ziel: 0,
      kcal_ziel_typ: 'max',
      eiweiss_ziel_dg: 0,
      eiweiss_ziel_typ: 'min',
      gesamtumsatz: 2400,
    });
    createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 250, // 168 kcal
    });
    createBewegung(db, {
      datum: '2026-07-15',
      uhrzeit: '18:00',
      beschreibung: 'Laufen',
      kcal: 300,
    });
    const r = getDefizitReport(db, '2026-07-15');
    // Gesamtverbrauch 2400 + 300, Aufnahme 168 -> Defizit 2532.
    expect(r.tag.defizit).toBe(2400 + 300 - 168);
    expect(r.tag.kcal_aufnahme).toBe(168);
  });
});
