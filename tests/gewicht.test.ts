import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../server/db/index.ts';
import { AppError } from '../server/errors.ts';
import {
  deleteGewicht,
  getGewichtFuerTag,
  listGewichtImZeitraum,
  upsertGewicht,
} from '../server/repos/gewicht.ts';

let db: Database;
beforeEach(() => {
  db = openDb({ file: ':memory:' });
});

describe('Tagesgewicht', () => {
  it('setzt ein Gewicht und ersetzt denselben Tag (Upsert)', () => {
    upsertGewicht(db, { datum: '2026-07-15', gramm: 82500, aus_trend: false });
    expect(getGewichtFuerTag(db, '2026-07-15')?.gramm).toBe(82500);
    upsertGewicht(db, { datum: '2026-07-15', gramm: 82100, aus_trend: false });
    expect(getGewichtFuerTag(db, '2026-07-15')?.gramm).toBe(82100);
  });

  it('liefert null ohne Eintrag', () => {
    expect(getGewichtFuerTag(db, '2026-07-15')).toBeNull();
  });

  it('lehnt ein Gewicht <= 0 ab', () => {
    expect(() =>
      upsertGewicht(db, { datum: '2026-07-15', gramm: 0, aus_trend: false }),
    ).toThrow(AppError);
  });

  it('liefert den Verlauf im Zeitraum aufsteigend (ohne Zukunft)', () => {
    upsertGewicht(db, { datum: '2026-07-15', gramm: 82500, aus_trend: false });
    upsertGewicht(db, { datum: '2026-07-10', gramm: 83000, aus_trend: false });
    upsertGewicht(db, { datum: '2026-07-20', gramm: 81500, aus_trend: false }); // Zukunft
    upsertGewicht(db, { datum: '2026-08-01', gramm: 81000, aus_trend: false }); // ausserhalb
    const v = listGewichtImZeitraum(
      db,
      '2026-07-01',
      '2026-07-31',
      '2026-07-16',
    );
    expect(v.map((p) => p.datum)).toEqual(['2026-07-10', '2026-07-15']);
    expect(v[0].gramm).toBe(83000);
  });

  it('speichert und liefert das aus_trend-Flag (Upsert aktualisiert es)', () => {
    upsertGewicht(db, { datum: '2026-07-10', gramm: 83000, aus_trend: true });
    upsertGewicht(db, { datum: '2026-07-11', gramm: 82800, aus_trend: false });
    expect(getGewichtFuerTag(db, '2026-07-10')?.aus_trend).toBe(true);
    expect(getGewichtFuerTag(db, '2026-07-11')?.aus_trend).toBe(false);
    const v = listGewichtImZeitraum(
      db,
      '2026-07-01',
      '2026-07-31',
      '2026-07-16',
    );
    expect(v.map((p) => p.aus_trend)).toEqual([true, false]);
    // Upsert kann das Flag aendern.
    upsertGewicht(db, { datum: '2026-07-10', gramm: 83000, aus_trend: false });
    expect(getGewichtFuerTag(db, '2026-07-10')?.aus_trend).toBe(false);
  });

  it('loescht ein Tagesgewicht und meldet Unbekanntes', () => {
    upsertGewicht(db, { datum: '2026-07-15', gramm: 82500, aus_trend: false });
    deleteGewicht(db, '2026-07-15');
    expect(getGewichtFuerTag(db, '2026-07-15')).toBeNull();
    expect(() => deleteGewicht(db, '2026-07-15')).toThrow(AppError);
  });
});
