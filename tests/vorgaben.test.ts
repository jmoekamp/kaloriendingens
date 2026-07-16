import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../server/db/index.ts';
import { AppError } from '../server/errors.ts';
import {
  deleteVorgabe,
  getVorgabeFuerTag,
  listVorgaben,
  upsertVorgabe,
} from '../server/repos/vorgaben.ts';
import { createLebensmittel } from '../server/repos/lebensmittel.ts';
import { createEintrag } from '../server/repos/eintraege.ts';
import {
  getDefizitReport,
  getTagesAuswertung,
} from '../server/repos/auswertung.ts';

let db: Database;
beforeEach(() => {
  db = openDb({ file: ':memory:' });
});

function vorgabe(gueltig_ab: string, gesamtumsatz: number, kcal_ziel = 0) {
  upsertVorgabe(db, {
    gueltig_ab,
    kcal_ziel,
    kcal_ziel_typ: 'max',
    eiweiss_ziel_dg: 0,
    eiweiss_ziel_typ: 'min',
    gesamtumsatz,
  });
}

describe('Vorgaben-Versionierung', () => {
  it('waehlt fuer einen Tag die juengste Vorgabe mit gueltig_ab <= Tag', () => {
    vorgabe('2026-06-01', 2400);
    vorgabe('2026-07-01', 2200);
    expect(getVorgabeFuerTag(db, '2026-06-15').gesamtumsatz).toBe(2400);
    expect(getVorgabeFuerTag(db, '2026-07-10').gesamtumsatz).toBe(2200);
    // Tag vor der ersten Vorgabe -> aelteste Vorgabe.
    expect(getVorgabeFuerTag(db, '2026-05-01').gesamtumsatz).toBe(2400);
  });

  it('ersetzt eine Vorgabe desselben Stichtags (Upsert)', () => {
    vorgabe('2026-07-01', 2200);
    vorgabe('2026-07-01', 2100);
    const alle = listVorgaben(db);
    expect(alle).toHaveLength(1);
    expect(alle[0].gesamtumsatz).toBe(2100);
  });

  it('loescht eine Vorgabe und meldet Unbekanntes', () => {
    vorgabe('2026-07-01', 2200);
    const v = listVorgaben(db)[0];
    deleteVorgabe(db, v.id);
    expect(listVorgaben(db)).toHaveLength(0);
    expect(() => deleteVorgabe(db, 999)).toThrow(AppError);
  });
});

describe('Historische Bewertung', () => {
  beforeEach(() => {
    createLebensmittel(db, {
      name: 'Magerquark',
      kcal_pro_100g: 67,
      eiweiss_dg_pro_100g: 120,
      packung_gramm: null,
    });
  });

  function iss(datum: string, menge: number) {
    createEintrag(db, {
      datum,
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: menge,
    });
  }

  it('bewertet einen Tag gegen das damals gueltige Ziel', () => {
    vorgabe('2026-06-01', 2400, 2000);
    vorgabe('2026-07-01', 2200, 1800);
    iss('2026-06-15', 100); // 67 kcal
    iss('2026-07-10', 100); // 67 kcal
    expect(getTagesAuswertung(db, '2026-06-15').kcal.ziel).toBe(2000);
    expect(getTagesAuswertung(db, '2026-07-10').kcal.ziel).toBe(1800);
  });

  it('rechnet das Defizit je Tag mit dem damals gueltigen Gesamtumsatz', () => {
    vorgabe('2026-06-01', 2400);
    vorgabe('2026-07-01', 2200);
    iss('2026-06-15', 100); // 67 kcal, Umsatz 2400
    iss('2026-07-10', 250); // 168 kcal, Umsatz 2200
    const r = getDefizitReport(db, '2026-07-10');
    // Gesamt: (2400-67) + (2200-168)
    expect(r.gesamt.tage).toBe(2);
    expect(r.gesamt.kcal_aufnahme).toBe(235);
    expect(r.gesamt.defizit).toBe(2400 - 67 + (2200 - 168));
    // Heute (2026-07-10) nur der eine Tag mit Umsatz 2200.
    expect(r.tag.defizit).toBe(2200 - 168);
    expect(r.gesamtumsatz).toBe(2200);
  });
});
