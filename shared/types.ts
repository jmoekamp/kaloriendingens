/**
 * Gemeinsame API-Vertragstypen (DTOs) fuer Frontend und Backend.
 *
 * Einheiten-Konvention (analog zum Cent-Prinzip: alles als Ganzzahl halten,
 * erst zur Anzeige formatieren):
 * - kcal immer als ganze Kilokalorien (INTEGER).
 * - Eiweiss immer in DEZIGRAMM (1 dg = 0,1 g), damit ein Nachkommastellen-Wert
 *   wie 12,5 g ohne Rundungsfehler als 125 gespeichert wird.
 * - Mengen (gegessene Menge) in ganzen Gramm.
 */

/** Zieltyp: Der Zielwert ist eine Obergrenze (max) oder eine Untergrenze (min). */
export type ZielTyp = 'min' | 'max';

/** Ein Lebensmittel (Stammdatum). Naehrwerte beziehen sich immer auf 100 g. */
export interface Lebensmittel {
  id: number;
  name: string;
  /** kcal je 100 g (ganze kcal). */
  kcal_pro_100g: number;
  /** Eiweiss je 100 g in Dezigramm (0,1 g). */
  eiweiss_dg_pro_100g: number;
  /** Fett je 100 g in Dezigramm; null = nicht erfasst. */
  fett_dg_pro_100g: number | null;
  /** Kohlenhydrate je 100 g in Dezigramm; null = nicht erfasst. */
  kohlenhydrate_dg_pro_100g: number | null;
  /** Ballaststoffe je 100 g in Dezigramm; null = nicht erfasst. */
  ballaststoffe_dg_pro_100g: number | null;
  /** Optionale Packungsgroesse in Gramm (null = keine); fuer „ganze Packung". */
  packung_gramm: number | null;
  /**
   * Optionaler Bestand in Gramm (null = Bestand wird nicht gefuehrt). Wird beim
   * Ankreuzen von „gegessen" um die Menge reduziert (Abwaehlen/Loeschen/Aendern
   * korrigiert entsprechend); kann dadurch negativ werden.
   */
  bestand_gramm: number | null;
  erstellt_am: string;
  geaendert_am: string;
  /** Nur lesend: Anzahl Eintraege, die dieses Lebensmittel verwenden (Loeschschutz). */
  eintrag_anzahl?: number;
}

/** Eingabe zum Anlegen/Bearbeiten eines Lebensmittels. */
export interface LebensmittelInput {
  name: string;
  kcal_pro_100g: number;
  eiweiss_dg_pro_100g: number;
  /** Fett je 100 g in Dezigramm; null/weggelassen = nicht erfasst. */
  fett_dg_pro_100g?: number | null;
  /** Kohlenhydrate je 100 g in Dezigramm; null/weggelassen = nicht erfasst. */
  kohlenhydrate_dg_pro_100g?: number | null;
  /** Ballaststoffe je 100 g in Dezigramm; null/weggelassen = nicht erfasst. */
  ballaststoffe_dg_pro_100g?: number | null;
  packung_gramm: number | null;
  /** Bestand in Gramm; null/weggelassen = Bestand wird nicht gefuehrt. */
  bestand_gramm?: number | null;
}

/**
 * Ein Treffer der Open-Food-Facts-Namenssuche (externer Dienst, per Server-Proxy).
 * Fehlende Naehrwerte sind null; die Werte werden ins Anlege-Formular uebernommen
 * und dort vor dem Speichern geprueft/ergaenzt.
 */
export interface OffTreffer {
  /** Barcode/EAN des Produkts (nur zur Anzeige/Referenz). */
  code: string;
  /** Produktname (ggf. mit Marke). */
  name: string;
  /** kcal je 100 g (ganz) oder null, wenn bei OFF nicht hinterlegt. */
  kcal_pro_100g: number | null;
  /** Eiweiss je 100 g in Dezigramm oder null. */
  eiweiss_dg_pro_100g: number | null;
  /** Fett je 100 g in Dezigramm oder null. */
  fett_dg_pro_100g: number | null;
  /** Kohlenhydrate je 100 g in Dezigramm oder null. */
  kohlenhydrate_dg_pro_100g: number | null;
  /** Ballaststoffe je 100 g in Dezigramm oder null. */
  ballaststoffe_dg_pro_100g: number | null;
  /** Packungsgroesse in Gramm oder null. */
  packung_gramm: number | null;
}

/**
 * Ein Tages-Eintrag: was und wieviel zu einer Uhrzeit gegessen wurde. kcal und
 * Eiweiss werden LIVE aus dem verknuepften Lebensmittel und der Menge berechnet
 * (nicht gespeichert) – aendert man die Naehrwerte des Lebensmittels, aendern
 * sich vergangene Auswertungen entsprechend mit.
 */
export interface Eintrag {
  id: number;
  datum: string; // YYYY-MM-DD
  uhrzeit: string; // HH:MM
  lebensmittel_id: number;
  menge_gramm: number;
  /** true = gegessen; nur gegessene Eintraege zaehlen in die Statistik. */
  gegessen: boolean;
  /** Nur lesend (Join). */
  lebensmittel_name?: string;
  /** Nur lesend (berechnet): kcal dieser Portion. */
  kcal?: number;
  /** Nur lesend (berechnet): Eiweiss dieser Portion in Dezigramm. */
  eiweiss_dg?: number;
  erstellt_am: string;
  geaendert_am: string;
}

/** Eingabe zum Anlegen/Bearbeiten eines Eintrags. */
export interface EintragInput {
  datum: string;
  uhrzeit: string;
  lebensmittel_id: number;
  menge_gramm: number;
  /** Ob der Eintrag als gegessen zaehlt. Ohne Angabe: gegessen (true). */
  gegessen?: boolean;
}

/**
 * Eine erfasste Bewegung/Aktivitaet. Die Aktivitaetskalorien (kcal) werden fuer
 * den Tag zum Gesamtverbrauch hinzugezaehlt und erhoehen so das Tagesdefizit.
 */
export interface Bewegung {
  id: number;
  datum: string; // YYYY-MM-DD
  uhrzeit: string; // HH:MM
  beschreibung: string;
  kcal: number; // Aktivitaetskalorien
  erstellt_am: string;
  geaendert_am: string;
}

/** Eingabe zum Anlegen/Bearbeiten einer Bewegung. */
export interface BewegungInput {
  datum: string;
  uhrzeit: string;
  beschreibung: string;
  kcal: number;
}

/** Ein Tagesgewicht (eine Waage-Eingabe je Tag). Gewicht in Gramm. */
export interface Gewicht {
  id: number;
  datum: string; // YYYY-MM-DD
  gramm: number;
  /** true = aus der Trend-/Regressionsberechnung ausgeschlossen (z. B. Wasser-Anfangstage). */
  aus_trend: boolean;
  /** Optionaler Koerperfettanteil in Promille (25,4 % = 254); null = nicht gemessen. */
  fett_promille: number | null;
  erstellt_am: string;
  geaendert_am: string;
}

/** Eingabe zum Setzen/Ersetzen des Tagesgewichts. */
export interface GewichtInput {
  datum: string;
  gramm: number;
  aus_trend: boolean;
  /** Koerperfettanteil in Promille; null/weggelassen = nicht gemessen. */
  fett_promille?: number | null;
}

/** Ein Punkt der Gewichts-Verlaufskurve. */
export interface GewichtPunkt {
  datum: string;
  gramm: number;
  /** true = nicht in die Trendlinie einbeziehen (Messpunkt bleibt sichtbar). */
  aus_trend: boolean;
  /** Koerperfettanteil in Promille oder null (fuer Erhalt beim Trend-Umschalten). */
  fett_promille: number | null;
}

/**
 * Anwendungseinstellungen (je Mandant). Intern Key-Value, nach aussen typisiert.
 * Ein Zielwert von 0 bedeutet „kein Ziel gesetzt" und wird in Auswertungen nicht
 * bewertet. gesamtumsatz = taeglicher Gesamtumsatz (kcal/Tag) fuer das Defizit.
 */
export interface Einstellungen {
  kcal_ziel: number; // kcal, 0 = kein Ziel
  kcal_ziel_typ: ZielTyp;
  eiweiss_ziel_dg: number; // Dezigramm, 0 = kein Ziel
  eiweiss_ziel_typ: ZielTyp;
  gesamtumsatz: number; // kcal/Tag, 0 = nicht gesetzt
}

/**
 * Eine zeitversionierte Vorgabe: derselbe Wertesatz wie Einstellungen, aber mit
 * einem Stichtag (gueltig_ab). Fuer einen Tag gilt die juengste Vorgabe mit
 * gueltig_ab <= Tag; fuer Tage vor der ersten Vorgabe die aelteste.
 */
export interface Vorgabe extends Einstellungen {
  id: number;
  gueltig_ab: string; // YYYY-MM-DD
}

/** Eingabe zum Anlegen/Ersetzen einer Vorgabe (voller Wertesatz + Stichtag). */
export interface VorgabeInput extends Einstellungen {
  gueltig_ab: string;
}

/**
 * Bewertung eines Wertes gegen ein Ziel. abweichung = summe - ziel (vorzeichen-
 * behaftet): positiv = ueber dem Ziel, negativ = darunter. erfuellt richtet sich
 * nach dem Zieltyp. Bei ziel = 0 (kein Ziel) gilt erfuellt = true.
 */
export interface Zielbewertung {
  summe: number;
  ziel: number;
  typ: ZielTyp;
  abweichung: number;
  erfuellt: boolean;
  /** true, wenn ueberhaupt ein Ziel gesetzt ist (ziel > 0). */
  hat_ziel: boolean;
}

/** Auswertung eines einzelnen Tages. */
export interface TagesAuswertung {
  datum: string;
  eintraege: Eintrag[];
  summe_kcal: number;
  summe_eiweiss_dg: number;
  kcal: Zielbewertung;
  eiweiss: Zielbewertung;
  /** Gesamtumsatz des Tages (berechnet oder vorgegeben, „Leistungsumsatz"). */
  gesamtumsatz: number;
  /** Summe der Bewegungskalorien des Tages. */
  bewegung: number;
  /** Tagesdefizit = gesamtumsatz + bewegung − summe_kcal. */
  defizit: number;
  /** Am Tag gueltiges Gewicht (Gramm, Carry-forward) oder null. */
  gewicht_gramm: number | null;
  /** Eiweiss je kg Koerpergewicht (g/kg) an dem Tag; null ohne Gewicht. */
  eiweiss_pro_kg: number | null;
}

/** Ein Punkt der Langzeit-Reihe (ein Tag mit Daten). */
export interface VerlaufPunkt {
  datum: string;
  kcal: number;
  eiweiss_dg: number;
}

/** Tagesdefizit eines einzelnen Tages (Tage mit Eintraegen). */
export interface DefizitTag {
  datum: string;
  defizit: number;
}

/**
 * Ein Tag der Kalorien-Verlaufskurve: Gesamtumsatz (berechnet oder vorgegeben),
 * Gesamtumsatz + erfasste Bewegung (Gesamtverbrauch) und Aufnahme (null = kein
 * Eintrag). Bewegung zaehlt auf die Verbrauchsseite.
 */
export interface KalorienTag {
  datum: string;
  gesamtumsatz: number;
  gesamtumsatz_plus_bewegung: number;
  aufnahme: number | null;
}

/** Langzeit-Verlauf ueber einen Zeitraum (nur Tage mit Eintraegen). */
export interface Verlauf {
  von: string;
  bis: string;
  punkte: VerlaufPunkt[];
}

/** Eine Zeile der „letzte Tage"-Liste. */
export interface TagesZusammenfassung {
  datum: string;
  kcal: number;
  eiweiss_dg: number;
  hat_daten: boolean;
}

/** Defizit fuer ein Zeitfenster (nur Tage mit Eintraegen zaehlen). */
export interface DefizitFenster {
  /** Anzahl Tage mit Eintraegen im Fenster. */
  tage: number;
  /** Aufgenommene kcal-Summe ueber diese Tage. */
  kcal_aufnahme: number;
  /** Defizit = gesamtumsatz * tage - kcal_aufnahme. */
  defizit: number;
}

/**
 * Defizit-Report ueber vier Fenster. Basis ist der taegliche Gesamtumsatz; das
 * Defizit summiert (gesamtumsatz - Aufnahme) je Tag mit Eintraegen. Ist kein
 * Gesamtumsatz gesetzt (0), ist das Ergebnis nicht aussagekraeftig (das Frontend
 * weist dann darauf hin); rechnerisch bleibt es gesamtumsatz x Tage - Aufnahme.
 */
export interface DefizitReport {
  gesamtumsatz: number;
  tag: DefizitFenster; // heute
  woche: DefizitFenster; // letzte 7 Tage
  monat: DefizitFenster; // letzte 30 Tage
  gesamt: DefizitFenster; // gesamter Erfassungszeitraum
}

/**
 * Ein Abnehmziel: wieviel Gewicht (in Gramm) ab einem Stichtag abgenommen werden
 * soll. Das dafuer noetige Kaloriendefizit ergibt sich aus Gewicht × 7000 kcal/kg.
 * Es gilt (wie die Vorgaben) ab gueltig_ab; das aktive Ziel ist das juengste mit
 * gueltig_ab <= heute.
 */
export interface Abnehmziel {
  id: number;
  gueltig_ab: string; // YYYY-MM-DD
  ziel_gramm: number; // abzunehmendes Gewicht in Gramm
}

/** Eingabe zum Anlegen/Ersetzen eines Abnehmziels. */
export interface AbnehmzielInput {
  gueltig_ab: string;
  ziel_gramm: number;
}

/**
 * Fortschritt des aktiven Abnehmziels. erreicht_kcal ist das seit gueltig_ab
 * tatsaechlich erzielte Defizit (nur Tage mit Eintraegen, je Tag mit dem damals
 * gueltigen Gesamtumsatz); benoetigt_kcal = Gewicht × 7000 kcal/kg; prozent ist
 * erreicht/benoetigt in Prozent (ungerundet; die Anzeige rundet auf zwei
 * Nachkommastellen).
 */
export interface AbnehmFortschritt {
  hat_ziel: boolean;
  gueltig_ab: string | null;
  ziel_gramm: number;
  benoetigt_kcal: number;
  erreicht_kcal: number;
  prozent: number;
  /** Noch offenes Defizit bis zum Ziel (benoetigt − erreicht, min. 0). */
  rest_kcal: number;
  /** Ziel bereits erreicht (erreicht >= benoetigt). */
  ziel_erreicht: boolean;
  /** Median des Tagesdefizits ueber Tage mit Eintraegen seit Festlegung (null = keine Tage). */
  median_defizit: number | null;
  /** Prognose-Datum (YYYY-MM-DD), an dem das Restdefizit beim Median-Tempo erreicht ist; null wenn nicht absehbar. */
  prognose_median: string | null;
  /** Defizit des Vortags (null = am Vortag keine Eintraege). */
  vortag_defizit: number | null;
  /** Prognose-Datum, wenn das Defizit weiter wie am Vortag ausfaellt; null wenn nicht absehbar. */
  prognose_vortag: string | null;
  /** Startgewicht (Gramm) bei Festlegung: erste NICHT ausgeschlossene Messung ab gueltig_ab; null = keine. */
  start_gewicht_gramm: number | null;
  /** Aktuelles Gewicht (Gramm): letzte NICHT ausgeschlossene Messung bis heute; null = keine. */
  aktuell_gewicht_gramm: number | null;
  /** Tatsaechlich abgenommenes Gewicht seit Festlegung (Gramm; start − aktuell). */
  abgenommen_gramm: number;
  /** Anteil der Gewichtsabnahme am Ziel in Prozent (ungerundet). */
  gewicht_prozent: number;
  /** Allererste Messung (Gramm; inkl. ausgeschlossener Tage); null = keine. */
  erst_gewicht_gramm: number | null;
  /** Abgenommen seit der ersten Messung (Gramm; erste − aktuell). */
  abgenommen_gesamt_gramm: number;
  /**
   * Effektives Ziel fuer den „ab erster Messung"-Balken (Gramm): Abnehmziel plus
   * die anfaengliche (ausgeschlossene) Abnahme = erste Messung − erste nicht
   * ausgeschlossene Messung, falls die erste Messung hoeher liegt. Da dieser
   * Balken die Anfangsabnahme im Zaehler mitzaehlt, wandert dieselbe Differenz
   * in den Nenner.
   */
  ziel_gesamt_gramm: number;
  /** Anteil am (erweiterten) Ziel seit der ersten Messung in Prozent (ungerundet). */
  gewicht_prozent_gesamt: number;
  /** Trendrate aus der Gewichts-Regression (Gramm/Woche); null = zu wenige Messungen. */
  trend_gramm_pro_woche: number | null;
  /** Prognose-Datum, an dem der Gewichtstrend das Zielgewicht erreicht; null wenn nicht absehbar. */
  prognose_gewichtstrend: string | null;
  /** Meilensteine bei durch 5 teilbaren ganzen Kilo bis zum Ziel (schwer -> leicht). */
  meilensteine: GewichtsMeilenstein[];
  /** Aktueller gleitender 7-Tage-Median des Tagesdefizits (kcal); null = keine Tage. */
  defizit_median_kcal: number | null;
  /** Aus dem Defizit-Median folgende woechentliche Gewichtsaenderung (Gramm/Woche, negativ = Abnahme); null = keine Tage. */
  defizit_median_gramm_pro_woche: number | null;
  /** Prognose-Datum fuers Zielgewicht aus dem gleitenden Defizit-Median; null wenn nicht absehbar. */
  prognose_defizit_median: string | null;
  /** Meilensteine (5 kg) mit Prognose aus dem gleitenden Defizit-Median. */
  meilensteine_defizit_median: GewichtsMeilenstein[];
  /**
   * Datum, an dem die Trend-Prognosen zuletzt festgehalten wurden (sie aendern
   * sich nur beim Erreichen eines Zwischenziels); null ohne Prognosen.
   */
  prognosen_stand_trend: string | null;
  /** Wie prognosen_stand_trend, fuer die Defizit-Median-Prognosen. */
  prognosen_stand_median: string | null;
}

/**
 * Eine Zeile des Allzeitreports: je Kalendertag (erste Erfassung bis heute)
 * alle Kernwerte fuer Copy & Paste in Tabellenkalkulationen.
 */
export interface AllzeitTag {
  datum: string;
  /** An dem Tag GEMESSENES Gewicht (Gramm) oder null (keine Messung). */
  gewicht_gramm: number | null;
  /** Gesamtumsatz/-bedarf des Tages (berechnet oder manuell, kcal). */
  gesamtumsatz: number;
  /** Erfasste Aktivitaetskalorien des Tages (kcal, 0 = keine). */
  bewegung: number;
  /** Gesamtverbrauch = Gesamtumsatz + Bewegung (kcal). */
  verbrauch: number;
  /** Kalorienaufnahme (nur gegessene Eintraege, kcal) oder null (keine). */
  aufnahme_kcal: number | null;
  /** Defizit = Verbrauch − Aufnahme (positiv = Defizit); null ohne Aufnahme. */
  defizit_kcal: number | null;
  /** Eiweissaufnahme (nur gegessene Eintraege, Dezigramm) oder null (keine). */
  eiweiss_dg: number | null;
  /** Fettaufnahme (dg, nur gegessene Eintraege mit hinterlegtem Wert) oder null. */
  fett_dg: number | null;
  /** Kohlenhydrataufnahme (dg, wie Fett) oder null. */
  kohlenhydrate_dg: number | null;
  /** Ballaststoffaufnahme (dg, wie Fett) oder null. */
  ballaststoffe_dg: number | null;
}

/** Eine Mahlzeit-Zeile des Detailreports. */
export interface DetailMahlzeit {
  uhrzeit: string;
  lebensmittel_name: string;
  menge_gramm: number;
  kcal: number;
  eiweiss_dg: number;
  gegessen: boolean;
}

/** Eine Bewegungs-Zeile des Detailreports. */
export interface DetailBewegung {
  uhrzeit: string;
  beschreibung: string;
  kcal: number;
}

/**
 * Ein Tag des Detailreports: die Tageszeile (wie im Allzeitreport) plus alle
 * Mahlzeiten und Bewegungseintraege des Tages.
 */
export interface DetailTag {
  tag: AllzeitTag;
  mahlzeiten: DetailMahlzeit[];
  bewegungen: DetailBewegung[];
}

/** Ein Meilenstein auf dem Weg zum Abnehmziel (5-kg-Schritt oder BMI-Grenze). */
export interface GewichtsMeilenstein {
  /** Meilensteingewicht in Gramm (Vielfaches von 5000 bzw. BMI-Grenzgewicht). */
  gramm: number;
  /**
   * Gesetzt, wenn der Meilenstein eine BMI-Grenze markiert: 30 (Adipositas-
   * Grenze) oder 25 (Obergrenze Normalgewicht); null = normaler 5-kg-Schritt.
   */
  bmi: number | null;
  /** true, wenn schon eine Messung ≤ diesem Gewicht vorliegt. */
  erreicht: boolean;
  /** Tatsaechliches Datum (erste Messung ≤ gramm) oder null. */
  erreicht_am: string | null;
  /** Trend-Prognosedatum oder null (kein Abnehmtrend / zu wenige Messungen). */
  prognose: string | null;
  /** Bei erreichten Meilensteinen: erreicht_am − Prognose in Tagen (− = früher). */
  differenz_tage: number | null;
}

/** Geschlecht fuer die Grundumsatz-Formel. */
export type Geschlecht = 'm' | 'w';

/** Quelle des Gesamtumsatzes: manuell gesetzt oder aus Koerperdaten berechnet. */
export type GesamtumsatzModus = 'manuell' | 'berechnet';

/** Grundumsatz-Formel: Mifflin-St Jeor oder Katch-McArdle (braucht Fettanteil). */
export type UmsatzFormel = 'mifflin' | 'katch';

/**
 * BMI-Formel fuer den BMI-25-Meilenstein: 'standard' (WHO, kg/m²) oder
 * 'trefethen' (Nick Trefethen, 2013: BMI = 1,3 · kg / m^2,5 – korrigiert die
 * Verzerrung des klassischen BMI bei grossen und kleinen Menschen).
 */
export type BmiFormel = 'standard' | 'trefethen';

/**
 * Koerperdaten fuer die Gesamtumsatz-Berechnung. Nicht versioniert; das
 * taegliche Gewicht (und ggf. der Fettanteil) kommt aus den Messungen. Bei
 * modus = 'berechnet' und vollstaendigen Daten wird der Gesamtumsatz je Tag
 * daraus berechnet, sonst gilt der manuelle (versionierte) Wert. Formel:
 * Mifflin-St Jeor (Groesse/Alter/Geschlecht) oder Katch-McArdle (Magermasse aus
 * Gewicht × (1 − Fettanteil); ohne Fettwert am Tag Fallback auf Mifflin).
 */
export interface Koerperdaten {
  groesse_cm: number; // 0 = nicht gesetzt
  geschlecht: Geschlecht;
  geburtsjahr: number; // 0 = nicht gesetzt
  aktivitaetsfaktor: number; // z. B. 1.55
  modus: GesamtumsatzModus;
  formel: UmsatzFormel;
  /** Formel fuer den BMI-25-Meilenstein (Standard: WHO kg/m²). */
  bmi_formel: BmiFormel;
}

/** Teilweise Aktualisierung der Koerperdaten. */
export type KoerperdatenInput = Partial<Koerperdaten>;

/** Koerperdaten samt abgeleiteter Anzeige-Werte (aktuelles Gewicht + heutiger Umsatz). */
export interface KoerperdatenAnsicht extends Koerperdaten {
  /** Letzte Gewichtsmessung bis heute (Gramm) oder null. */
  aktuelles_gewicht_gramm: number | null;
  /** Letzter erfasster Fettanteil bis heute (Promille) oder null. */
  aktueller_fett_promille: number | null;
  /** Der fuer heute geltende Gesamtumsatz (berechnet oder manuell). */
  gesamtumsatz_heute: number;
}

/** Standard-Fehlerantwort des Backends. */
export interface ApiErrorBody {
  error: string;
}

/**
 * Nutzer der App. mandant_id = 0 ist der Admin-Realm (nur Nutzerverwaltung,
 * kein Zugriff auf Fachdaten); mandant_id >= 1 sind Daten-Mandanten. Das
 * Passwort wird nie an das Frontend ausgeliefert.
 */
export interface User {
  id: number;
  mandant_id: number;
  username: string;
  erstellt_am: string;
}

/** Eingabe zum Anlegen eines Nutzers (Admin). */
export interface UserInput {
  username: string;
  mandant_id: number;
  passwort: string;
}

/** Der aktuell angemeldete Nutzer (Antwort von /auth/login und /auth/me). */
export interface AuthUser {
  id: number;
  username: string;
  mandant_id: number;
  ist_admin: boolean;
}
