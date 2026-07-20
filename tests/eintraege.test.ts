import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../server/db/index.ts';
import { AppError } from '../server/errors.ts';
import { createLebensmittel } from '../server/repos/lebensmittel.ts';
import {
  createEintrag,
  deleteEintrag,
  listEintraegeFuerTag,
  listTageMitDaten,
  markiereGegessenBis,
  setEintragGegessen,
  updateEintrag,
} from '../server/repos/eintraege.ts';

let db: Database;
let quarkId: number;
beforeEach(() => {
  db = openDb({ file: ':memory:' });
  quarkId = createLebensmittel(db, {
    name: 'Magerquark',
    kcal_pro_100g: 67,
    eiweiss_dg_pro_100g: 120, // 12,0 g / 100 g
    packung_gramm: null,
  }).id;
});

describe('Eintraege', () => {
  it('berechnet kcal/Eiweiss live aus Menge und Lebensmittel', () => {
    const e = createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '08:30',
      lebensmittel_id: quarkId,
      menge_gramm: 250,
    });
    expect(e.kcal).toBe(168); // 67*2,5 = 167,5 -> 168
    expect(e.eiweiss_dg).toBe(300); // 120*2,5 = 300 (30,0 g)
    expect(e.lebensmittel_name).toBe('Magerquark');
  });

  it('liefert Eintraege eines Tages nach Uhrzeit sortiert', () => {
    createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '12:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100,
    });
    createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '07:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100,
    });
    const liste = listEintraegeFuerTag(db, '2026-07-15');
    expect(liste.map((e) => e.uhrzeit)).toEqual(['07:00', '12:00']);
  });

  it('listet Tage mit Daten absteigend', () => {
    for (const d of ['2026-07-10', '2026-07-15', '2026-07-12']) {
      createEintrag(db, {
        datum: d,
        uhrzeit: '08:00',
        lebensmittel_id: quarkId,
        menge_gramm: 100,
      });
    }
    expect(listTageMitDaten(db)).toEqual([
      '2026-07-15',
      '2026-07-12',
      '2026-07-10',
    ]);
  });

  it('aktualisiert und loescht', () => {
    const e = createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100,
    });
    const u = updateEintrag(db, e.id, {
      datum: '2026-07-15',
      uhrzeit: '09:00',
      lebensmittel_id: quarkId,
      menge_gramm: 200,
    });
    expect(u.uhrzeit).toBe('09:00');
    expect(u.kcal).toBe(134);
    deleteEintrag(db, e.id);
    expect(listEintraegeFuerTag(db, '2026-07-15')).toHaveLength(0);
  });

  it('setzt und schaltet das gegessen-Flag', () => {
    // Ohne Angabe gilt ein Eintrag als gegessen (programmatischer Standard).
    const a = createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100,
    });
    expect(a.gegessen).toBe(true);
    // Explizit als nicht gegessen anlegbar (so legt die API neue Eintraege an).
    const b = createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '09:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100,
      gegessen: false,
    });
    expect(b.gegessen).toBe(false);
    expect(setEintragGegessen(db, b.id, true).gegessen).toBe(true);
    expect(setEintragGegessen(db, a.id, false).gegessen).toBe(false);
  });

  it('setzt beim Ankreuzen optional die Uhrzeit mit', () => {
    const e = createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100,
      gegessen: false,
    });
    const g = setEintragGegessen(db, e.id, true, '13:37');
    expect(g.gegessen).toBe(true);
    expect(g.uhrzeit).toBe('13:37');
    // Ohne Uhrzeit-Angabe bleibt die vorhandene Uhrzeit erhalten.
    expect(setEintragGegessen(db, e.id, false).uhrzeit).toBe('13:37');
    // Ungueltige Uhrzeit wird abgewiesen.
    expect(() => setEintragGegessen(db, e.id, true, '25:99')).toThrow(AppError);
  });

  it('markiert per Migration alle Eintraege bis zu einem Datum als gegessen', () => {
    const mk = (datum: string) =>
      createEintrag(db, {
        datum,
        uhrzeit: '08:00',
        lebensmittel_id: quarkId,
        menge_gramm: 100,
        gegessen: false,
      });
    mk('2026-07-13');
    mk('2026-07-14');
    mk('2026-07-15');
    const anzahl = markiereGegessenBis(db, '2026-07-14');
    expect(anzahl).toBe(2); // 13. + 14., nicht der 15.
    expect(listEintraegeFuerTag(db, '2026-07-13')[0].gegessen).toBe(true);
    expect(listEintraegeFuerTag(db, '2026-07-14')[0].gegessen).toBe(true);
    expect(listEintraegeFuerTag(db, '2026-07-15')[0].gegessen).toBe(false);
    // Erneuter Lauf aendert nichts mehr (idempotent, nur gegessen=0 wird gesetzt).
    expect(markiereGegessenBis(db, '2026-07-14')).toBe(0);
  });

  it('weist ungueltige Eingaben ab', () => {
    expect(() =>
      createEintrag(db, {
        datum: '2026-07-15',
        uhrzeit: '25:99',
        lebensmittel_id: quarkId,
        menge_gramm: 100,
      }),
    ).toThrow(AppError);
    expect(() =>
      createEintrag(db, {
        datum: '2026-07-15',
        uhrzeit: '08:00',
        lebensmittel_id: quarkId,
        menge_gramm: 0,
      }),
    ).toThrow(AppError);
    expect(() =>
      createEintrag(db, {
        datum: '2026-07-15',
        uhrzeit: '08:00',
        lebensmittel_id: 9999,
        menge_gramm: 100,
      }),
    ).toThrow(AppError);
  });
});
