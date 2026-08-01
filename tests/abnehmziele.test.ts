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
    // Ab erster Messung (inkl. Wasser-Tag 83000): 83000 -> 81000 = 2000 g.
    // Ziel wird um die Anfangsabnahme (83000-82000=1000) erweitert -> 6000 g.
    expect(f.erst_gewicht_gramm).toBe(83000);
    expect(f.abgenommen_gesamt_gramm).toBe(2000);
    expect(f.ziel_gesamt_gramm).toBe(6000);
    expect(f.gewicht_prozent_gesamt).toBeCloseTo((2000 / 6000) * 100, 6); // 33,3 %
  });

  it('prognostiziert den Zieltermin aus dem Gewichtstrend', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 5000 });
    // −1000 g in 14 Tagen -> −500 g/Woche; Zielgewicht 82000−5000=77000.
    upsertGewicht(db, { datum: '2026-06-01', gramm: 82000, aus_trend: false });
    upsertGewicht(db, { datum: '2026-06-15', gramm: 81000, aus_trend: false });
    const f = getAbnehmFortschritt(db, '2026-06-30');
    expect(f.trend_gramm_pro_woche).toBeCloseTo(-500, 6);
    // Steigung −1000/14 g/Tag; 5000 g brauchen 70 Tage ab dem Startpunkt.
    expect(f.prognose_gewichtstrend).toBe(verschiebeDatum('2026-06-01', 70));
  });

  it('listet 5-kg-Meilensteine mit Trend-Prognose', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 10000 });
    upsertGewicht(db, { datum: '2026-06-01', gramm: 82000, aus_trend: false });
    upsertGewicht(db, { datum: '2026-06-15', gramm: 81000, aus_trend: false });
    const f = getAbnehmFortschritt(db, '2026-06-30');
    expect(f.meilensteine.map((m) => m.gramm)).toEqual([80000, 75000]);
    const m80 = f.meilensteine[0];
    expect(m80.erreicht).toBe(false);
    // −1000 g/14 Tage -> 2000 g brauchen 28 Tage ab Start.
    expect(m80.prognose).toBe(verschiebeDatum('2026-06-01', 28));
  });

  it('markiert erreichte Meilensteine mit Datum und Differenz', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 10000 });
    upsertGewicht(db, { datum: '2026-06-01', gramm: 82000, aus_trend: false });
    upsertGewicht(db, { datum: '2026-06-10', gramm: 79500, aus_trend: false });
    const f = getAbnehmFortschritt(db, '2026-06-30');
    const m80 = f.meilensteine.find((m) => m.gramm === 80000);
    expect(m80?.erreicht).toBe(true);
    expect(m80?.erreicht_am).toBe('2026-06-10');
    expect(typeof m80?.differenz_tage).toBe('number');
  });

  it('gibt keine Trendprognose ohne Abnehmtrend', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 5000 });
    upsertGewicht(db, { datum: '2026-06-01', gramm: 82000, aus_trend: false });
    upsertGewicht(db, { datum: '2026-06-15', gramm: 82500, aus_trend: false }); // steigt
    const f = getAbnehmFortschritt(db, '2026-06-30');
    expect(f.prognose_gewichtstrend).toBeNull();
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

  it('prognostiziert Meilensteine aus dem gleitenden Defizit-Median', () => {
    upsertVorgabe(db, {
      gueltig_ab: '2000-01-01',
      kcal_ziel: 0,
      kcal_ziel_typ: 'max',
      eiweiss_ziel_dg: 0,
      eiweiss_ziel_typ: 'min',
      gesamtumsatz: 2000,
    });
    // Lebensmittel mit 100 kcal/100 g -> menge_gramm entspricht kcal.
    const kcal100 = createLebensmittel(db, {
      name: 'Testfutter',
      kcal_pro_100g: 100,
      eiweiss_dg_pro_100g: 0,
      packung_gramm: null,
    }).id;
    upsertAbnehmziel(db, { gueltig_ab: '2026-07-01', ziel_gramm: 10000 }); // 90 kg -> 80 kg
    upsertGewicht(db, { datum: '2026-07-01', gramm: 90000, aus_trend: false });
    // 10 Tage je 1300 kcal -> Tagesdefizit konstant 700; gleitender Median 700.
    for (let i = 6; i <= 15; i++) {
      createEintrag(db, {
        datum: `2026-07-${String(i).padStart(2, '0')}`,
        uhrzeit: '08:00',
        lebensmittel_id: kcal100,
        menge_gramm: 1300,
      });
    }
    const f = getAbnehmFortschritt(db, '2026-07-15');
    expect(f.defizit_median_kcal).toBe(700);
    expect(f.defizit_median_gramm_pro_woche).toBe(-700);
    expect(f.meilensteine_defizit_median.map((m) => m.gramm)).toEqual([
      85000, 80000,
    ]);
    // Rate 700/7 = 100 g/Tag; bis heute bereits 10 × 100 = 1000 g projiziert.
    const m85 = f.meilensteine_defizit_median[0];
    expect(m85.erreicht).toBe(false);
    expect(m85.prognose).toBe(verschiebeDatum('2026-07-15', 40)); // (5000−1000)/100
    // Zielgewicht 80 kg: (10000−1000)/100 = 90 Tage.
    expect(f.prognose_defizit_median).toBe(verschiebeDatum('2026-07-15', 90));
  });

  it('friert Prognosen ein und aktualisiert sie erst beim Zwischenziel', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-06-01', ziel_gramm: 10000 });
    // -1000 g in 14 Tagen: m80 (2 kg) in 28 Tagen ab 01.06. -> 29.06.
    upsertGewicht(db, { datum: '2026-06-01', gramm: 82000, aus_trend: false });
    upsertGewicht(db, { datum: '2026-06-15', gramm: 81000, aus_trend: false });
    const f1 = getAbnehmFortschritt(db, '2026-06-20');
    const p80 = verschiebeDatum('2026-06-01', 28);
    expect(f1.meilensteine.find((m) => m.gramm === 80000)?.prognose).toBe(p80);
    const p75v1 = f1.meilensteine.find((m) => m.gramm === 75000)?.prognose;
    expect(f1.prognosen_stand_trend).toBe('2026-06-20');

    // Neue Messung veraendert die Regression – die Prognosen bleiben aber
    // eingefroren (kein Zwischenziel erreicht).
    upsertGewicht(db, { datum: '2026-06-19', gramm: 81600, aus_trend: false });
    const f2 = getAbnehmFortschritt(db, '2026-06-22');
    expect(f2.meilensteine.find((m) => m.gramm === 80000)?.prognose).toBe(p80);
    expect(f2.meilensteine.find((m) => m.gramm === 75000)?.prognose).toBe(
      p75v1,
    );
    expect(f2.prognose_gewichtstrend).toBe(f1.prognose_gewichtstrend);
    expect(f2.prognosen_stand_trend).toBe('2026-06-20'); // unveraendert

    // Zwischenziel 80 kg erreicht: der erreichte Meilenstein behaelt seine
    // festgehaltene Prognose (Vergleichsbasis), die offenen werden neu
    // festgehalten.
    upsertGewicht(db, { datum: '2026-06-25', gramm: 79800, aus_trend: false });
    const f3 = getAbnehmFortschritt(db, '2026-06-26');
    const m80 = f3.meilensteine.find((m) => m.gramm === 80000);
    expect(m80?.erreicht).toBe(true);
    expect(m80?.erreicht_am).toBe('2026-06-25');
    expect(m80?.prognose).toBe(p80); // alte Prognose als Vergleichsbasis
    expect(m80?.differenz_tage).toBe(-4); // 25.06. vs. 29.06. -> 4 Tage frueher
    const p75v2 = f3.meilensteine.find((m) => m.gramm === 75000)?.prognose;
    expect(p75v2).not.toBeNull();
    expect(p75v2).not.toBe(p75v1); // neu festgehalten
    expect(f3.prognosen_stand_trend).toBe('2026-06-26');

    // Und wieder stabil, bis das naechste Zwischenziel faellt.
    upsertGewicht(db, { datum: '2026-06-27', gramm: 79900, aus_trend: false });
    const f4 = getAbnehmFortschritt(db, '2026-06-28');
    expect(f4.meilensteine.find((m) => m.gramm === 75000)?.prognose).toBe(
      p75v2,
    );
  });

  it('liefert keinen Defizit-Median ohne Tagesdaten', () => {
    upsertAbnehmziel(db, { gueltig_ab: '2026-07-01', ziel_gramm: 5000 });
    upsertGewicht(db, { datum: '2026-07-01', gramm: 90000, aus_trend: false });
    const f = getAbnehmFortschritt(db, '2026-07-15');
    expect(f.defizit_median_kcal).toBeNull();
    expect(f.defizit_median_gramm_pro_woche).toBeNull();
    expect(f.prognose_defizit_median).toBeNull();
  });
});
