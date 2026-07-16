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
    upsertGewicht(db, { datum: '2026-07-15', gramm: 82500 });
    expect(getGewichtFuerTag(db, '2026-07-15')?.gramm).toBe(82500);
    upsertGewicht(db, { datum: '2026-07-15', gramm: 82100 });
    expect(getGewichtFuerTag(db, '2026-07-15')?.gramm).toBe(82100);
  });

  it('liefert null ohne Eintrag', () => {
    expect(getGewichtFuerTag(db, '2026-07-15')).toBeNull();
  });

  it('lehnt ein Gewicht <= 0 ab', () => {
    expect(() => upsertGewicht(db, { datum: '2026-07-15', gramm: 0 })).toThrow(
      AppError,
    );
  });

  it('liefert den Verlauf im Zeitraum aufsteigend', () => {
    upsertGewicht(db, { datum: '2026-07-15', gramm: 82500 });
    upsertGewicht(db, { datum: '2026-07-10', gramm: 83000 });
    upsertGewicht(db, { datum: '2026-08-01', gramm: 81000 }); // ausserhalb
    const v = listGewichtImZeitraum(db, '2026-07-01', '2026-07-31');
    expect(v.map((p) => p.datum)).toEqual(['2026-07-10', '2026-07-15']);
    expect(v[0].gramm).toBe(83000);
  });

  it('loescht ein Tagesgewicht und meldet Unbekanntes', () => {
    upsertGewicht(db, { datum: '2026-07-15', gramm: 82500 });
    deleteGewicht(db, '2026-07-15');
    expect(getGewichtFuerTag(db, '2026-07-15')).toBeNull();
    expect(() => deleteGewicht(db, '2026-07-15')).toThrow(AppError);
  });
});
