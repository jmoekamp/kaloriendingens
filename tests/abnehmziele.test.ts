import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../server/db/index.ts';
import { AppError } from '../server/errors.ts';
import {
  aktivesAbnehmziel,
  deleteAbnehmziel,
  listAbnehmziele,
  upsertAbnehmziel,
} from '../server/repos/abnehmziele.ts';
import { upsertVorgabe } from '../server/repos/vorgaben.ts';
import { upsertGewicht } from '../server/repos/gewicht.ts';
import { createLebensmittel } from '../server/repos/lebensmittel.ts';
import { createEintrag } from '../server/repos/eintraege.ts';
import {
  getAbnehmFortschritt,
  verschiebeDatum,
} from '../server/repos/auswertung.ts';

let db: Database;
beforeEach(() => {
  db = openDb({ file: ':memory:' });
});

describe('Abnehmziel-Verwaltung', () => {
  it('legt an, ersetzt denselben Stichtag und listet', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 5000 });
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 6000 });
    const liste = listAbnehmziele(db);
    expect(liste).toHaveLength(1);
    expect(liste[0].ziel_gramm).toBe(6000);
  });

  it('lehnt ein Ziel <= 0 ab', () => {
    expect(() =>
      upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 0 }),
    ).toThrow(AppError);
  });

  it('waehlt das aktive Ziel (juengstes mit gueltig_ab <= heute)', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 5000 });
    upsertAbnehmziel(db, { gueltig_ab: '2026-07-01', ziel_gramm: 3000 });
    expect(aktivesAbnehmziel(db, '2026-06-15')?.ziel_gramm).toBe(5000);
    expect(aktivesAbnehmziel(db, '2026-07-10')?.ziel_gramm).toBe(3000);
    // Vor dem ersten Stichtag ist kein Ziel aktiv.
    expect(aktivesAbnehmziel(db, '2026-05-01')).toBeNull();
  });

  it('loescht und meldet Unbekanntes', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 5000 });
    const z = listAbnehmziele(db)[0];
    deleteAbnehmziel(db, z.id);
    expect(listAbnehmziele(db)).toHaveLength(0);
    expect(() => deleteAbnehmziel(db, 999)).toThrow(AppError);
  });
});

describe('Abnehmfortschritt', () => {
  beforeEach(() => {
    createLebensmittel(db, {
      name: 'Magerquark',
      kcal_pro_100g: 67,
      eiweiss_dg_pro_100g: 120,
      packung_gramm: null,
    });
  });

  it('rechnet benoetigtes Defizit (kg × 7000) und Prozent des erreichten', () => {
    upsertVorgabe(db, {
      gueltig_ab: '2000-01-01',
      kcal_ziel: 0,
      kcal_ziel_typ: 'max',
      eiweiss_ziel_dg: 0,
      eiweiss_ziel_typ: 'min',
      gesamtumsatz: 2400,
    });
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 5000 }); // 5 kg
    createEintrag(db, {
      datum: '2026-06-15',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 100, // 67 kcal -> Defizit 2333
    });
    const f = getAbnehmFortschritt(db, '2026-06-30');
    expect(f.hat_ziel).toBe(true);
    expect(f.benoetigt_kcal).toBe(35000); // 5 * 7000
    expect(f.erreicht_kcal).toBe(2400 - 67);
    // Ungerundet (Anzeige rundet auf zwei Nachkommastellen).
    expect(f.prozent).toBeCloseTo(((2400 - 67) / 35000) * 100, 6);
  });

  it('zaehlt nur Tage ab dem Stichtag des Ziels', () => {
    upsertVorgabe(db, {
      gueltig_ab: '2000-01-01',
      kcal_ziel: 0,
      kcal_ziel_typ: 'max',
      eiweiss_ziel_dg: 0,
      eiweiss_ziel_typ: 'min',
      gesamtumsatz: 2400,
    });
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-10', ziel_gramm: 5000 });
    // Ein Tag VOR dem Stichtag zaehlt nicht mit.
    createEintrag(db, {
      datum: '2026-06-05',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 100,
    });
    createEintrag(db, {
      datum: '2026-06-15',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 100,
    });
    const f = getAbnehmFortschritt(db, '2026-06-30');
    expect(f.erreicht_kcal).toBe(2400 - 67); // nur der 15.06.
  });

  it('meldet hat_ziel=false ohne Ziel', () => {
    expect(getAbnehmFortschritt(db, '2026-06-30').hat_ziel).toBe(false);
  });

  it('rechnet die Gewichtsabnahme seit Festlegung (ohne ausgeschlossene Messungen)', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 5000 }); // 5 kg
    // Wasser-Tag ausgeschlossen -> nicht als Startgewicht verwenden.
    upsertGewicht(db, { datum: '2026-06-01', gramm: 83000, aus_trend: true });
    upsertGewicht(db, { datum: '2026-06-03', gramm: 82000, aus_trend: false });
    upsertGewicht(db, { datum: '2026-06-20', gramm: 81000, aus_trend: false });
    const f = getAbnehmFortschritt(db, '2026-06-30');
    expect(f.start_gewicht_gramm).toBe(82000); // 06-03, nicht der Wasser-Tag
    expect(f.aktuell_gewicht_gramm).toBe(81000);
    expect(f.abgenommen_gramm).toBe(1000);
    expect(f.gewicht_prozent).toBeCloseTo((1000 / 5000) * 100, 6); // 20 %
  });

  it('liefert null-Gewichte, wenn seit Festlegung nichts gewogen wurde', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 5000 });
    const f = getAbnehmFortschritt(db, '2026-06-30');
    expect(f.start_gewicht_gramm).toBeNull();
    expect(f.abgenommen_gramm).toBe(0);
  });

  it('prognostiziert Zieltermine (Median seit Festlegung und wie Vortag)', () => {
    upsertVorgabe(db, {
      gueltig_ab: '2000-01-01',
      kcal_ziel: 0,
      kcal_ziel_typ: 'max',
      eiweiss_ziel_dg: 0,
      eiweiss_ziel_typ: 'min',
      gesamtumsatz: 2400,
    });
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-16', ziel_gramm: 5000 });
    createEintrag(db, {
      datum: '2026-06-20',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 100, // 67 kcal -> Defizit 2333
    });
    createEintrag(db, {
      datum: '2026-06-21',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 250, // 168 kcal -> Defizit 2232
    });
    const f = getAbnehmFortschritt(db, '2026-06-22');
    const rest = 35000 - (2333 + 2232);
    expect(f.rest_kcal).toBe(rest);
    expect(f.ziel_erreicht).toBe(false);
    expect(f.median_defizit).toBe((2333 + 2232) / 2); // 2282,5
    expect(f.vortag_defizit).toBe(2232); // Vortag = 2026-06-21
    expect(f.prognose_median).toBe(
      verschiebeDatum('2026-06-22', Math.ceil(rest / 2282.5)),
    );
    expect(f.prognose_vortag).toBe(
      verschiebeDatum('2026-06-22', Math.ceil(rest / 2232)),
    );
  });

  it('meldet Ziel erreicht und ohne Vortagsdaten keine Vortagsprognose', () => {
    upsertVorgabe(db, {
      gueltig_ab: '2000-01-01',
      kcal_ziel: 0,
      kcal_ziel_typ: 'max',
      eiweiss_ziel_dg: 0,
      eiweiss_ziel_typ: 'min',
      gesamtumsatz: 2400,
    });
    // Kleines Ziel (0,5 kg -> 3500 kcal), an einem Tag uebererfuellt.
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-16', ziel_gramm: 500 });
    createEintrag(db, {
      datum: '2026-06-20',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 100, // Defizit 2333
    });
    createEintrag(db, {
      datum: '2026-06-21',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 100, // Defizit 2333 -> Summe 4666 >= 3500
    });
    const erreicht = getAbnehmFortschritt(db, '2026-06-22');
    expect(erreicht.ziel_erreicht).toBe(true);
    expect(erreicht.rest_kcal).toBe(0);
    expect(erreicht.prognose_median).toBeNull();

    // Zweites Szenario: Ziel offen, aber am Vortag nichts erfasst.
    const db2 = openDb({ file: ':memory:' });
    createLebensmittel(db2, {
      name: 'Magerquark',
      kcal_pro_100g: 67,
      eiweiss_dg_pro_100g: 120,
      packung_gramm: null,
    });
    upsertVorgabe(db2, {
      gueltig_ab: '2000-01-01',
      kcal_ziel: 0,
      kcal_ziel_typ: 'max',
      eiweiss_ziel_dg: 0,
      eiweiss_ziel_typ: 'min',
      gesamtumsatz: 2400,
    });
    upsertAbnehmziel(db2, { gueltig_ab: '2026-06-16', ziel_gramm: 5000 });
    createEintrag(db2, {
      datum: '2026-06-20',
      uhrzeit: '08:00',
      lebensmittel_id: 1,
      menge_gramm: 100,
    });
    const f2 = getAbnehmFortschritt(db2, '2026-06-22'); // Vortag 06-21 leer
    expect(f2.vortag_defizit).toBeNull();
    expect(f2.prognose_vortag).toBeNull();
    expect(f2.median_defizit).toBe(2333);
    expect(f2.prognose_median).not.toBeNull();
  });
});
