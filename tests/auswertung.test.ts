import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../server/db/index.ts';
import { createLebensmittel } from '../server/repos/lebensmittel.ts';
import { createEintrag } from '../server/repos/eintraege.ts';
import { upsertVorgabe } from '../server/repos/vorgaben.ts';
import type { VorgabeInput } from '../shared/types.ts';
import {
  getDefizitReport,
  getDefizitVerlauf,
  getLetzteTage,
  getTagesAuswertung,
  getVerlauf,
  verschiebeDatum,
} from '../server/repos/auswertung.ts';

let db: Database;
let quarkId: number;

beforeEach(() => {
  db = openDb({ file: ':memory:' });
  quarkId = createLebensmittel(db, {
    name: 'Magerquark',
    kcal_pro_100g: 67,
    eiweiss_dg_pro_100g: 120,
    packung_gramm: null,
  }).id;
});

function iss(datum: string, menge: number, uhrzeit = '08:00') {
  createEintrag(db, {
    datum,
    uhrzeit,
    lebensmittel_id: quarkId,
    menge_gramm: menge,
  });
}

/** Legt eine Vorgabe ab einem Stichtag an (Standard: sehr frueh). */
function vorgabe(werte: Partial<VorgabeInput> & { gueltig_ab?: string } = {}) {
  upsertVorgabe(db, {
    gueltig_ab: werte.gueltig_ab ?? '2000-01-01',
    kcal_ziel: werte.kcal_ziel ?? 0,
    kcal_ziel_typ: werte.kcal_ziel_typ ?? 'max',
    eiweiss_ziel_dg: werte.eiweiss_ziel_dg ?? 0,
    eiweiss_ziel_typ: werte.eiweiss_ziel_typ ?? 'min',
    gesamtumsatz: werte.gesamtumsatz ?? 0,
  });
}

describe('verschiebeDatum', () => {
  it('rechnet ueber Monatsgrenzen korrekt', () => {
    expect(verschiebeDatum('2026-07-01', -1)).toBe('2026-06-30');
    expect(verschiebeDatum('2026-07-15', 5)).toBe('2026-07-20');
  });
});

describe('Tagesauswertung', () => {
  it('summiert und bewertet gegen die Ziele', () => {
    vorgabe({ kcal_ziel: 200, eiweiss_ziel_dg: 500 });
    iss('2026-07-15', 250); // 168 kcal, 300 dg
    iss('2026-07-15', 100, '12:00'); // 67 kcal, 120 dg
    const a = getTagesAuswertung(db, '2026-07-15');
    expect(a.summe_kcal).toBe(235);
    expect(a.summe_eiweiss_dg).toBe(420);
    expect(a.kcal.erfuellt).toBe(false); // 235 > 200 (max)
    expect(a.eiweiss.erfuellt).toBe(false); // 420 < 500 (min)
    expect(a.eintraege).toHaveLength(2);
  });
});

describe('Verlauf', () => {
  it('liefert nur Tage mit Daten, aufsteigend', () => {
    iss('2026-07-10', 100);
    iss('2026-07-12', 200);
    const v = getVerlauf(db, '2026-07-01', '2026-07-15', '2026-07-15');
    expect(v.punkte.map((p) => p.datum)).toEqual(['2026-07-10', '2026-07-12']);
    expect(v.punkte[1].kcal).toBe(134);
  });

  it('schliesst Zukunftstage (datum > heute) aus', () => {
    iss('2026-07-10', 100);
    iss('2026-07-20', 200); // liegt in der Zukunft
    const v = getVerlauf(db, '2026-07-01', '2026-07-31', '2026-07-15');
    expect(v.punkte.map((p) => p.datum)).toEqual(['2026-07-10']);
  });
});

describe('Letzte Tage', () => {
  it('fuellt alle n Kalendertage, markiert Tage ohne Daten', () => {
    iss('2026-07-15', 100);
    const tage = getLetzteTage(db, '2026-07-15', 7);
    expect(tage).toHaveLength(7);
    expect(tage[0].datum).toBe('2026-07-15');
    expect(tage[0].hat_daten).toBe(true);
    expect(tage[1].hat_daten).toBe(false);
    expect(tage[6].datum).toBe('2026-07-09');
  });
});

describe('Defizit', () => {
  it('zaehlt nur Tage mit Eintraegen (Gesamtumsatz x Tage - Aufnahme)', () => {
    vorgabe({ gesamtumsatz: 2400 });
    iss('2026-07-15', 250); // 168 kcal
    iss('2026-07-14', 100); // 67 kcal
    const r = getDefizitReport(db, '2026-07-15');
    expect(r.gesamtumsatz).toBe(2400);
    expect(r.tag.tage).toBe(1);
    expect(r.tag.defizit).toBe(2400 - 168);
    expect(r.gesamt.tage).toBe(2);
    expect(r.gesamt.defizit).toBe(2400 * 2 - (168 + 67));
    expect(r.woche.defizit).toBe(2400 * 2 - 235);
  });

  it('liefert 0-Defizit, wenn kein Gesamtumsatz gesetzt ist', () => {
    iss('2026-07-15', 250);
    const r = getDefizitReport(db, '2026-07-15');
    expect(r.gesamtumsatz).toBe(0);
    expect(r.gesamt.defizit).toBe(-168); // 0*Tage - Aufnahme
    expect(r.tag.tage).toBe(1);
  });

  it('ignoriert Zukunftstage im gesamten Zeitraum', () => {
    vorgabe({ gesamtumsatz: 2400 });
    iss('2026-07-14', 100); // Defizit 2333
    iss('2026-07-20', 100); // Zukunft -> zaehlt nicht
    const r = getDefizitReport(db, '2026-07-15');
    expect(r.gesamt.tage).toBe(1);
    expect(r.gesamt.defizit).toBe(2400 - 67);
  });
});

describe('Defizit-Verlauf (je Tag)', () => {
  it('liefert das Tagesdefizit je Tag, ohne Zukunft', () => {
    vorgabe({ gesamtumsatz: 2400 });
    iss('2026-07-14', 100); // 67 kcal -> Defizit 2333
    iss('2026-07-15', 250); // 168 kcal -> Defizit 2232
    iss('2026-07-20', 100); // Zukunft
    const v = getDefizitVerlauf(db, '2026-07-01', '2026-07-31', '2026-07-16');
    expect(v).toEqual([
      { datum: '2026-07-14', defizit: 2400 - 67 },
      { datum: '2026-07-15', defizit: 2400 - 168 },
    ]);
  });
});
