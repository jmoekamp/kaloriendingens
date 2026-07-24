import { describe, it, expect, beforeEach } from 'vitest';
import type { Database } from 'better-sqlite3';
import { openDb } from '../server/db/index.ts';
import { createLebensmittel } from '../server/repos/lebensmittel.ts';
import { createEintrag } from '../server/repos/eintraege.ts';
import { upsertVorgabe } from '../server/repos/vorgaben.ts';
import { updateKoerperdaten } from '../server/repos/koerperdaten.ts';
import { upsertGewicht } from '../server/repos/gewicht.ts';
import type { VorgabeInput } from '../shared/types.ts';
import { createBewegung } from '../server/repos/bewegung.ts';
import {
  getAllzeitReport,
  getDetailReport,
  getDefizitReport,
  getDefizitVerlauf,
  getKalorienVerlauf,
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

describe('Nur gegessene Eintraege zaehlen in die Statistik', () => {
  it('summiert in der Tagesauswertung nur gegessene Eintraege', () => {
    vorgabe({ gesamtumsatz: 2400 });
    createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      lebensmittel_id: quarkId,
      menge_gramm: 250, // 168 kcal, 300 dg – gegessen
      gegessen: true,
    });
    createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '12:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100, // 67 kcal – NICHT gegessen (Planung)
      gegessen: false,
    });
    const a = getTagesAuswertung(db, '2026-07-15');
    expect(a.eintraege).toHaveLength(2); // Liste zeigt beide
    expect(a.summe_kcal).toBe(168); // nur der gegessene
    expect(a.summe_eiweiss_dg).toBe(300);
    expect(a.defizit).toBe(2400 - 168);
  });

  it('ignoriert nicht gegessene Eintraege in Verlauf und Defizit', () => {
    vorgabe({ gesamtumsatz: 2400 });
    createEintrag(db, {
      datum: '2026-07-14',
      uhrzeit: '08:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100, // geplant, nicht gegessen
      gegessen: false,
    });
    iss('2026-07-15', 250); // gegessen (Standard true), 168 kcal
    // Verlauf enthaelt nur den gegessenen Tag.
    const v = getVerlauf(db, '2026-07-01', '2026-07-15', '2026-07-15');
    expect(v.punkte.map((p) => p.datum)).toEqual(['2026-07-15']);
    // Defizit-Report zaehlt nur den gegessenen Tag.
    const r = getDefizitReport(db, '2026-07-15');
    expect(r.gesamt.tage).toBe(1);
    expect(r.gesamt.defizit).toBe(2400 - 168);
  });
});

describe('Allzeitreport', () => {
  it('liefert eine Zeile je Tag von der ersten Erfassung bis heute', () => {
    vorgabe({ gesamtumsatz: 2400 });
    upsertGewicht(db, { datum: '2026-07-13', gramm: 80000, aus_trend: false });
    iss('2026-07-14', 250); // gegessen: 168 kcal, 300 dg
    createBewegung(db, {
      datum: '2026-07-14',
      uhrzeit: '18:00',
      beschreibung: 'Laufen',
      kcal: 300,
    });
    createEintrag(db, {
      datum: '2026-07-15',
      uhrzeit: '08:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100,
      gegessen: false, // nur geplant -> zaehlt nicht als Aufnahme
    });
    const r = getAllzeitReport(db, '2026-07-15');
    expect(r.map((z) => z.datum)).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
    ]);
    expect(r[0]).toEqual({
      datum: '2026-07-13',
      gewicht_gramm: 80000,
      gesamtumsatz: 2400,
      bewegung: 0,
      verbrauch: 2400,
      aufnahme_kcal: null,
      defizit_kcal: null,
      eiweiss_dg: null,
    });
    expect(r[1]).toEqual({
      datum: '2026-07-14',
      gewicht_gramm: null, // an dem Tag nicht gemessen
      gesamtumsatz: 2400,
      bewegung: 300,
      verbrauch: 2700,
      aufnahme_kcal: 168,
      defizit_kcal: 2700 - 168, // Verbrauch − Aufnahme (positiv = Defizit)
      eiweiss_dg: 300,
    });
    expect(r[2].aufnahme_kcal).toBeNull(); // nur geplante Eintraege
  });

  it('liefert eine leere Liste ohne jegliche Erfassung', () => {
    expect(getAllzeitReport(db, '2026-07-15')).toEqual([]);
  });
});

describe('Detailreport', () => {
  it('liefert je Tag die Tageszeile plus Mahlzeiten und Bewegungen', () => {
    vorgabe({ gesamtumsatz: 2400 });
    iss('2026-07-14', 250, '08:00'); // gegessen
    createEintrag(db, {
      datum: '2026-07-14',
      uhrzeit: '12:00',
      lebensmittel_id: quarkId,
      menge_gramm: 100,
      gegessen: false, // geplant
    });
    createBewegung(db, {
      datum: '2026-07-14',
      uhrzeit: '18:00',
      beschreibung: 'Laufen',
      kcal: 300,
    });
    iss('2026-07-15', 100);
    const r = getDetailReport(db, '2026-07-15');
    expect(r.map((t) => t.tag.datum)).toEqual(['2026-07-14', '2026-07-15']);
    // Tag 14.: zwei Mahlzeiten (inkl. geplanter), eine Bewegung.
    expect(r[0].mahlzeiten).toEqual([
      {
        uhrzeit: '08:00',
        lebensmittel_name: 'Magerquark',
        menge_gramm: 250,
        kcal: 168,
        eiweiss_dg: 300,
        gegessen: true,
      },
      {
        uhrzeit: '12:00',
        lebensmittel_name: 'Magerquark',
        menge_gramm: 100,
        kcal: 67,
        eiweiss_dg: 120,
        gegessen: false,
      },
    ]);
    expect(r[0].bewegungen).toEqual([
      { uhrzeit: '18:00', beschreibung: 'Laufen', kcal: 300 },
    ]);
    // Die Tageszeile entspricht dem Allzeitreport (nur gegessene Aufnahme).
    expect(r[0].tag.aufnahme_kcal).toBe(168);
    expect(r[0].tag.verbrauch).toBe(2700);
    // Tag 15.: keine Bewegung, eine Mahlzeit.
    expect(r[1].mahlzeiten).toHaveLength(1);
    expect(r[1].bewegungen).toEqual([]);
  });

  it('liefert eine leere Liste ohne jegliche Erfassung', () => {
    expect(getDetailReport(db, '2026-07-15')).toEqual([]);
  });
});

describe('Eiweiss pro kg (Tagesauswertung)', () => {
  it('rechnet Eiweiss je kg mit dem tagesgueltigen Gewicht', () => {
    upsertGewicht(db, { datum: '2026-07-15', gramm: 80000, aus_trend: false });
    iss('2026-07-15', 1000); // 1000 g Quark -> 1200 dg = 120 g Eiweiss
    const a = getTagesAuswertung(db, '2026-07-15');
    expect(a.gewicht_gramm).toBe(80000);
    expect(a.summe_eiweiss_dg).toBe(1200);
    expect(a.eiweiss_pro_kg).toBeCloseTo(1.5, 6); // 120 g / 80 kg
  });

  it('liefert null ohne Gewicht', () => {
    iss('2026-07-15', 250);
    expect(getTagesAuswertung(db, '2026-07-15').eiweiss_pro_kg).toBeNull();
  });
});

describe('Berechneter Gesamtumsatz (Mifflin-St Jeor)', () => {
  it('nutzt das tagesgueltige Gewicht statt des manuellen Werts', () => {
    updateKoerperdaten(db, {
      modus: 'berechnet',
      groesse_cm: 180,
      geschlecht: 'm',
      geburtsjahr: 1985,
      aktivitaetsfaktor: 1.55,
    });
    upsertGewicht(db, { datum: '2026-07-15', gramm: 90000, aus_trend: false });
    iss('2026-07-15', 250); // 168 kcal
    // BMR = 900 + 1125 − 5·41 + 5 = 1825; ×1,55 = 2828,75 → 2829.
    const r = getDefizitReport(db, '2026-07-15');
    expect(r.gesamtumsatz).toBe(2829);
    expect(r.tag.defizit).toBe(2829 - 168);
  });

  it('rechnet mit Katch-McArdle aus dem tagesgueltigen Fettanteil', () => {
    updateKoerperdaten(db, {
      modus: 'berechnet',
      formel: 'katch',
      aktivitaetsfaktor: 1.5,
      groesse_cm: 180,
      geschlecht: 'm',
      geburtsjahr: 1985,
    });
    upsertGewicht(db, {
      datum: '2026-07-14',
      gramm: 80000,
      aus_trend: false,
      fett_promille: 250, // 25 % -> LBM 60 kg -> BMR 1666 -> ×1,5 = 2499
    });
    iss('2026-07-15', 250); // 168 kcal (Fett-Carry-forward vom 14.)
    const r = getDefizitReport(db, '2026-07-15');
    expect(r.gesamtumsatz).toBe(2499);
    expect(r.tag.defizit).toBe(2499 - 168);
  });

  it('nutzt vor der ersten Fettmessung Mifflin, danach Katch (Carry-forward)', () => {
    updateKoerperdaten(db, {
      modus: 'berechnet',
      formel: 'katch',
      aktivitaetsfaktor: 1.5,
      groesse_cm: 180,
      geschlecht: 'm',
      geburtsjahr: 1985,
    });
    // Gewicht ab dem 10., Fettanteil erst ab dem 14. erfasst.
    upsertGewicht(db, { datum: '2026-07-10', gramm: 80000, aus_trend: false });
    upsertGewicht(db, {
      datum: '2026-07-14',
      gramm: 80000,
      aus_trend: false,
      fett_promille: 250, // -> Katch: BMR 1666 × 1,5 = 2499
    });
    iss('2026-07-12', 100); // vor der ersten Fettmessung
    iss('2026-07-15', 100); // danach (Carry-forward vom 14.)
    const v = getDefizitVerlauf(db, '2026-07-01', '2026-07-31', '2026-07-15');
    // 12.07.: kein Fettwert davor -> Mifflin: 80 kg, 180 cm, 41 J, m ->
    // BMR 10*80+6,25*180−5*41+5 = 1725; ×1,5 = 2587,5 -> 2588.
    expect(v).toEqual([
      { datum: '2026-07-12', defizit: 2588 - 67 },
      { datum: '2026-07-15', defizit: 2499 - 67 },
    ]);
  });

  it('faellt bei Katch ohne Fettwert auf Mifflin-St Jeor zurueck', () => {
    updateKoerperdaten(db, {
      modus: 'berechnet',
      formel: 'katch',
      aktivitaetsfaktor: 1.55,
      groesse_cm: 180,
      geschlecht: 'm',
      geburtsjahr: 1985,
    });
    // Gewicht ohne Fettanteil -> Mifflin (wie im bestehenden Mifflin-Test).
    upsertGewicht(db, { datum: '2026-07-15', gramm: 90000, aus_trend: false });
    iss('2026-07-15', 250);
    const r = getDefizitReport(db, '2026-07-15');
    expect(r.gesamtumsatz).toBe(2829); // BMR 1825 × 1,55
  });

  it('faellt ohne Gewicht auf den manuellen Wert zurueck', () => {
    updateKoerperdaten(db, {
      modus: 'berechnet',
      groesse_cm: 180,
      geschlecht: 'm',
      geburtsjahr: 1985,
      aktivitaetsfaktor: 1.55,
    });
    vorgabe({ gesamtumsatz: 2400 });
    iss('2026-07-15', 250);
    const r = getDefizitReport(db, '2026-07-15');
    expect(r.gesamtumsatz).toBe(2400); // kein Gewicht -> Fallback
  });
});

describe('Kalorien-Verlauf', () => {
  it('liefert je Tag Umsatz, Aufnahme und Aufnahme + Bewegung', () => {
    vorgabe({ gesamtumsatz: 2400 });
    iss('2026-07-14', 250); // 168 kcal
    createBewegung(db, {
      datum: '2026-07-14',
      uhrzeit: '18:00',
      beschreibung: 'Laufen',
      kcal: 300,
    });
    const v = getKalorienVerlauf(db, '2026-07-13', '2026-07-15', '2026-07-16');
    expect(v).toEqual([
      {
        datum: '2026-07-13',
        gesamtumsatz: 2400,
        gesamtumsatz_plus_bewegung: 2400,
        aufnahme: null,
      },
      {
        datum: '2026-07-14',
        gesamtumsatz: 2400,
        gesamtumsatz_plus_bewegung: 2700, // + 300 Bewegung
        aufnahme: 168,
      },
      {
        datum: '2026-07-15',
        gesamtumsatz: 2400,
        gesamtumsatz_plus_bewegung: 2400,
        aufnahme: null,
      },
    ]);
  });

  it('schliesst Zukunftstage aus (bis = heute)', () => {
    vorgabe({ gesamtumsatz: 2000 });
    const v = getKalorienVerlauf(db, '2026-07-13', '2026-07-20', '2026-07-14');
    expect(v.map((k) => k.datum)).toEqual(['2026-07-13', '2026-07-14']);
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
