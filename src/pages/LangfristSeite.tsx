import { useEffect, useState } from 'react';
import type {
  AbnehmFortschritt,
  DefizitFenster,
  DefizitReport,
  DefizitTag,
  GewichtPunkt,
  GewichtsMeilenstein,
  KalorienTag,
  TagesZusammenfassung,
  Verlauf,
} from '../../shared/types.ts';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Field,
  TextInput,
} from '../components/ui.tsx';
import { LinienChart, type ChartPunkt } from '../components/LinienChart.tsx';
import {
  formatGramm,
  formatKcal,
  formatKg,
  formatProzent,
  kumulierteAbnahme,
  lineareRegression,
} from '../../shared/naehrwerte.ts';
import {
  formatDatum,
  heuteIso,
  tagNummer,
  verschiebeDatum,
} from '../lib/format.ts';
import { auswertungApi } from '../lib/auswertung.ts';
import { gewichtApi } from '../lib/gewicht.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

function DefizitKarte({
  titel,
  fenster,
}: {
  titel: string;
  fenster: DefizitFenster;
}) {
  const positiv = fenster.defizit >= 0;
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="text-sm text-text-muted">{titel}</div>
      <div
        className={`text-2xl font-bold tabular ${
          positiv ? 'text-success' : 'text-danger'
        }`}
      >
        {formatKcal(fenster.defizit)} kcal
      </div>
      <div className="mt-1 text-xs text-text-muted">
        {fenster.tage} Tag(e) mit Daten · Aufnahme{' '}
        {formatKcal(fenster.kcal_aufnahme)} kcal
      </div>
    </div>
  );
}

/** Ein Fortschrittsbalken fuer die Gewichtsabnahme (Start -> aktuell / Ziel). */
function GewichtBalken({
  titel,
  start,
  aktuell,
  abgenommen,
  ziel,
  prozent,
  farbe,
  leerHinweis,
}: {
  titel: string;
  start: number | null;
  aktuell: number | null;
  abgenommen: number;
  ziel: number;
  prozent: number;
  farbe: string;
  leerHinweis: string;
}) {
  if (start === null || aktuell === null) {
    return (
      <p className="mt-4 text-sm text-text-muted">{`${titel}: ${leerHinweis}`}</p>
    );
  }
  return (
    <>
      <p className="mb-1 mt-4 text-sm text-text-muted">
        {titel}:{' '}
        <span className="font-bold text-text">
          {formatKg(start)} → {formatKg(aktuell)} kg
        </span>{' '}
        · <span className="font-bold text-text">{formatKg(abgenommen)} kg</span>{' '}
        von {formatKg(ziel)} kg abgenommen.
      </p>
      <div className="flex items-center gap-3">
        <div className="h-4 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, prozent))}%`,
              backgroundColor: farbe,
            }}
          />
        </div>
        <span className="tabular text-lg font-bold">
          {formatProzent(prozent)} %
        </span>
      </div>
    </>
  );
}

/** Eine Prognose-Kachel: Zieltermin bei einem angenommenen Tagesdefizit. */
function Prognose({
  titel,
  zielErreicht,
  datum,
  rate,
  rateText,
  keinWert,
}: {
  titel: string;
  zielErreicht: boolean;
  datum: string | null;
  rate: number | null;
  rateText: string;
  keinWert?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="text-sm text-text-muted">{titel}</div>
      {zielErreicht ? (
        <div className="text-lg font-bold text-success">Ziel erreicht 🎉</div>
      ) : datum ? (
        <div className="text-lg font-bold tabular">{formatDatum(datum)}</div>
      ) : (
        <div className="text-text-muted">
          {rate === null ? (keinWert ?? 'nicht absehbar') : 'nicht absehbar'}
        </div>
      )}
      {rate !== null && (
        <div className="mt-1 text-xs text-text-muted">
          {rateText} {formatKcal(rate)} kcal/Tag
        </div>
      )}
    </div>
  );
}

/** Tabelle der 5-kg-Meilensteine (Gewicht · Status · früher/später). */
function MeilensteinTabelle({
  meilensteine,
  gleichText,
}: {
  meilensteine: GewichtsMeilenstein[];
  gleichText: string;
}) {
  if (meilensteine.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Keine 5-kg-Meilensteine im Zielbereich.
      </p>
    );
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-text-muted">
          <th className="py-2 pr-3 font-normal">Gewicht</th>
          <th className="py-2 pr-3 font-normal">Status</th>
          <th className="py-2 pr-3 text-right font-normal">früher / später</th>
        </tr>
      </thead>
      <tbody>
        {meilensteine.map((m) => (
          <tr key={m.gramm} className="border-b border-border/50">
            <td className="py-2 pr-3 tabular font-bold">
              {formatKg(m.gramm)} kg
            </td>
            <td className="py-2 pr-3">
              {m.erreicht ? (
                <span className="text-success">
                  erreicht am {formatDatum(m.erreicht_am ?? '')}
                </span>
              ) : m.prognose ? (
                <span className="text-text-muted">
                  voraussichtlich {formatDatum(m.prognose)}
                </span>
              ) : (
                <span className="text-text-muted">nicht absehbar</span>
              )}
            </td>
            <td className="py-2 pr-3 text-right tabular">
              {m.erreicht && m.differenz_tage !== null ? (
                m.differenz_tage === 0 ? (
                  <span className="text-text-muted">{gleichText}</span>
                ) : (
                  <span
                    className={
                      m.differenz_tage < 0 ? 'text-success' : 'text-danger'
                    }
                  >
                    {m.differenz_tage < 0
                      ? `${-m.differenz_tage} Tage früher`
                      : `${m.differenz_tage} Tage später`}
                  </span>
                )
              ) : (
                '—'
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function LangfristSeite({
  oeffneTag,
}: {
  oeffneTag: (datum: string) => void;
}) {
  const heute = heuteIso();
  const [von, setVon] = useState(verschiebeDatum(heute, -29));
  const [bis, setBis] = useState(heute);
  const [verlauf, setVerlauf] = useState<Verlauf | null>(null);
  const [gewicht, setGewicht] = useState<GewichtPunkt[]>([]);
  const [kalorien, setKalorien] = useState<KalorienTag[]>([]);
  const [defizitTage, setDefizitTage] = useState<DefizitTag[]>([]);
  const [letzte, setLetzte] = useState<TagesZusammenfassung[]>([]);
  const [defizit, setDefizit] = useState<DefizitReport | null>(null);
  const [abnehmen, setAbnehmen] = useState<AbnehmFortschritt | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  function ladeVerlauf() {
    setFehler(null);
    auswertungApi
      .verlauf(von, bis)
      .then(setVerlauf)
      .catch((e) => setFehler(meldung(e)));
    gewichtApi
      .verlauf(von, bis)
      .then(setGewicht)
      .catch((e) => setFehler(meldung(e)));
    auswertungApi
      .defizitVerlauf(von, bis)
      .then(setDefizitTage)
      .catch((e) => setFehler(meldung(e)));
    auswertungApi
      .kalorienVerlauf(von, bis)
      .then(setKalorien)
      .catch((e) => setFehler(meldung(e)));
  }

  useEffect(ladeVerlauf, [von, bis]);
  useEffect(() => {
    auswertungApi
      .letzteTage(7)
      .then(setLetzte)
      .catch((e) => setFehler(meldung(e)));
    auswertungApi
      .defizit()
      .then(setDefizit)
      .catch((e) => setFehler(meldung(e)));
    auswertungApi
      .abnehmfortschritt()
      .then(setAbnehmen)
      .catch((e) => setFehler(meldung(e)));
  }, []);

  const kcalPunkte: ChartPunkt[] =
    verlauf?.punkte.map((p) => ({ datum: p.datum, wert: p.kcal })) ?? [];
  const eiweissPunkte: ChartPunkt[] =
    verlauf?.punkte.map((p) => ({ datum: p.datum, wert: p.eiweiss_dg })) ?? [];
  const gewichtPunkte: ChartPunkt[] = gewicht.map((p) => ({
    datum: p.datum,
    wert: p.gramm,
    imTrend: !p.aus_trend,
  }));
  // Kalorien-Diagramm: Gesamtumsatz, Gesamtumsatz+Bewegung (Verbrauch), Aufnahme.
  const umsatzPunkte: ChartPunkt[] = kalorien.map((k) => ({
    datum: k.datum,
    wert: k.gesamtumsatz,
  }));
  const umsatzBewPunkte: ChartPunkt[] = kalorien.map((k) => ({
    datum: k.datum,
    wert: k.gesamtumsatz_plus_bewegung,
  }));
  const aufnahmePunkte: ChartPunkt[] = kalorien
    .filter((k) => k.aufnahme !== null)
    .map((k) => ({ datum: k.datum, wert: k.aufnahme as number }));
  // Defizit-Diagramm: Tagesdefizit (Gesamtumsatz + Bewegung − Aufnahme) + Null-Linie.
  const defizitPunkte: ChartPunkt[] = defizitTage.map((d) => ({
    datum: d.datum,
    wert: d.defizit,
  }));
  const nullPunkte: ChartPunkt[] = defizitTage.map((d) => ({
    datum: d.datum,
    wert: 0,
  }));
  // Trend aus linearer Regression – nur ueber Messungen, die im Trend zaehlen.
  const trendMessungen = gewicht.filter((g) => !g.aus_trend);
  const gewichtReg = lineareRegression(
    trendMessungen.map((g) => tagNummer(g.datum)),
    trendMessungen.map((g) => g.gramm),
  );
  const trendProWoche = gewichtReg ? gewichtReg.steigung * 7 : null;

  // Gewichtsprognose auf Defizitbasis: ab dem ersten NICHT ausgeschlossenen
  // Gewichtspunkt jeden Tag um (Tagesdefizit / 7000) kg abziehen, d. h.
  // Gramm = Defizit_kcal / 7. Aus dem Trend ausgeschlossene Messungen (z. B. die
  // ersten Wasser-Tage) werden auch als Anker nicht verwendet.
  const gewichtSortiert = [...gewicht]
    .filter((g) => !g.aus_trend)
    .sort((a, b) => tagNummer(a.datum) - tagNummer(b.datum));
  const prognosePunkte: ChartPunkt[] = [];
  if (gewichtSortiert.length > 0) {
    const anker = gewichtSortiert[0];
    const ankerTag = tagNummer(anker.datum);
    prognosePunkte.push({ datum: anker.datum, wert: anker.gramm });
    let kumDefizit = 0;
    for (const d of [...defizitTage].sort(
      (a, b) => tagNummer(a.datum) - tagNummer(b.datum),
    )) {
      if (tagNummer(d.datum) <= ankerTag) continue; // ab dem Tag NACH dem Anker
      kumDefizit += d.defizit;
      prognosePunkte.push({
        datum: d.datum,
        wert: anker.gramm - kumDefizit / 7,
      });
    }
  }

  // Kumulierter Gewichtsverlust: erwartet (aus Defizit / 7000 kcal/kg) vs.
  // gemessen (Anker − Messung), beide als Abnahme in Gramm ab dem gemeinsamen
  // Startpunkt (erste nicht ausgeschlossene Messung).
  const abnahme = kumulierteAbnahme(gewicht, defizitTage);
  const erwartetVerlustPunkte: ChartPunkt[] = abnahme.erwartet.map((p) => ({
    datum: p.datum,
    wert: p.verlust_gramm,
  }));
  const gemessenVerlustPunkte: ChartPunkt[] = abnahme.gemessen.map((p) => ({
    datum: p.datum,
    wert: p.verlust_gramm,
  }));

  // Trend-Zugehoerigkeit einer Messung direkt vom Report aus umschalten.
  async function trendUmschalten(g: GewichtPunkt, imTrend: boolean) {
    setFehler(null);
    try {
      // aus_trend = !imTrend; Fettanteil der Messung unveraendert mitschreiben.
      await gewichtApi.save(g.datum, g.gramm, !imTrend, g.fett_promille);
      setGewicht(await gewichtApi.verlauf(von, bis));
    } catch (e) {
      setFehler(meldung(e));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {fehler && (
        <Banner kind="error" onClose={() => setFehler(null)}>
          {fehler}
        </Banner>
      )}

      {/* Abnehmziel-Fortschritt */}
      {abnehmen && (
        <Card title="Abnehmziel">
          {!abnehmen.hat_ziel ? (
            <p className="text-text-muted">
              Kein Abnehmziel gesetzt – lege es unter „Einstellungen" an.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-text-muted">
                Ziel:{' '}
                <span className="font-bold text-text">
                  {formatKg(abnehmen.ziel_gramm)} kg
                </span>{' '}
                abnehmen (ab {formatDatum(abnehmen.gueltig_ab ?? '')}). Nötiges
                Defizit {formatKcal(abnehmen.benoetigt_kcal)} kcal, davon
                erreicht{' '}
                <span className="font-bold text-text">
                  {formatKcal(abnehmen.erreicht_kcal)} kcal
                </span>{' '}
                · Rest {formatKcal(abnehmen.rest_kcal)} kcal.
              </p>
              <div className="flex items-center gap-3">
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{
                      width: `${Math.max(0, Math.min(100, abnehmen.prozent))}%`,
                    }}
                  />
                </div>
                <span className="tabular text-lg font-bold">
                  {formatProzent(abnehmen.prozent)} %
                </span>
              </div>

              {/* Zweiter Balken: Gewichtsabnahme seit Festlegung (ohne Wasser-Tage) */}
              <GewichtBalken
                titel={`Gewicht seit Festlegung (${formatDatum(abnehmen.gueltig_ab ?? '')})`}
                start={abnehmen.start_gewicht_gramm}
                aktuell={abnehmen.aktuell_gewicht_gramm}
                abgenommen={abnehmen.abgenommen_gramm}
                ziel={abnehmen.ziel_gramm}
                prozent={abnehmen.gewicht_prozent}
                farbe="#d0a35a"
                leerHinweis="Noch kein Gewicht seit Festlegung erfasst."
              />

              {/* Dritter Balken: Gewichtsabnahme ab der allerersten Messung */}
              <GewichtBalken
                titel="Gewicht ab erster Messung"
                start={abnehmen.erst_gewicht_gramm}
                aktuell={abnehmen.aktuell_gewicht_gramm}
                abgenommen={abnehmen.abgenommen_gesamt_gramm}
                ziel={abnehmen.ziel_gesamt_gramm}
                prozent={abnehmen.gewicht_prozent_gesamt}
                farbe="#63b784"
                leerHinweis="Noch keine Messung erfasst."
              />

              {/* Prognosen: Median-Defizit und Defizit wie am Vortag */}
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Prognose
                  titel="Ziel erreicht bei Median-Defizit seit Festlegung"
                  zielErreicht={abnehmen.ziel_erreicht}
                  datum={abnehmen.prognose_median}
                  rate={abnehmen.median_defizit}
                  rateText="Median"
                />
                <Prognose
                  titel="Ziel erreicht, wenn wie am Vortag"
                  zielErreicht={abnehmen.ziel_erreicht}
                  datum={abnehmen.prognose_vortag}
                  rate={abnehmen.vortag_defizit}
                  rateText="Vortag"
                  keinWert="Am Vortag wurde nichts erfasst."
                />
              </div>
            </>
          )}
        </Card>
      )}

      {/* Eigene Karte: Gewichtstrend + 5-kg-Meilensteine */}
      {abnehmen?.hat_ziel && (
        <Card title="Gewichtstrend">
          <p className="mb-3 text-sm text-text-muted">
            Ziel erreicht laut Gewichtstrend:{' '}
            {abnehmen.start_gewicht_gramm !== null &&
            abnehmen.aktuell_gewicht_gramm !== null &&
            abnehmen.aktuell_gewicht_gramm <=
              abnehmen.start_gewicht_gramm - abnehmen.ziel_gramm ? (
              <span className="font-bold text-success">
                bereits erreicht 🎉
              </span>
            ) : abnehmen.prognose_gewichtstrend ? (
              <span className="font-bold text-text">
                {formatDatum(abnehmen.prognose_gewichtstrend)}
              </span>
            ) : (
              <span>
                nicht absehbar (zu wenige Messungen oder kein Abnehmtrend)
              </span>
            )}
            {abnehmen.trend_gramm_pro_woche !== null && (
              <> · Trend {formatKg(abnehmen.trend_gramm_pro_woche)} kg/Woche</>
            )}
          </p>

          <MeilensteinTabelle
            meilensteine={abnehmen.meilensteine}
            gleichText="wie im Trend"
          />
        </Card>
      )}

      {/* Eigene Karte: Prognose aus gleitendem Defizit-Median + 5-kg-Meilensteine */}
      {abnehmen?.hat_ziel && (
        <Card title="Defizit-Median (gleitend, 7 Tage)">
          <p className="mb-3 text-sm text-text-muted">
            Prognose aus dem gleitenden 7-Tage-Median des Tagesdefizits (7000
            kcal/kg). Ziel erreicht:{' '}
            {abnehmen.start_gewicht_gramm !== null &&
            abnehmen.aktuell_gewicht_gramm !== null &&
            abnehmen.aktuell_gewicht_gramm <=
              abnehmen.start_gewicht_gramm - abnehmen.ziel_gramm ? (
              <span className="font-bold text-success">
                bereits erreicht 🎉
              </span>
            ) : abnehmen.prognose_defizit_median ? (
              <span className="font-bold text-text">
                {formatDatum(abnehmen.prognose_defizit_median)}
              </span>
            ) : (
              <span>nicht absehbar (keine Tagesdaten oder kein Defizit)</span>
            )}
            {abnehmen.defizit_median_kcal !== null && (
              <> · Median {formatKcal(abnehmen.defizit_median_kcal)} kcal/Tag</>
            )}
            {abnehmen.defizit_median_gramm_pro_woche !== null && (
              <>
                {' '}
                ({formatKg(abnehmen.defizit_median_gramm_pro_woche)} kg/Woche)
              </>
            )}
          </p>

          <MeilensteinTabelle
            meilensteine={abnehmen.meilensteine_defizit_median}
            gleichText="wie prognostiziert"
          />
        </Card>
      )}

      {/* Defizit-Übersicht */}
      {defizit && (
        <Card title="Kaloriendefizit">
          {defizit.gesamtumsatz === 0 ? (
            <Banner kind="error">
              Kein Gesamtumsatz gesetzt – trage ihn unter „Einstellungen" ein,
              damit das Defizit berechnet werden kann.
            </Banner>
          ) : (
            <p className="mb-3 text-sm text-text-muted">
              Gesamtumsatz {formatKcal(defizit.gesamtumsatz)} kcal/Tag. Das
              Defizit zählt nur Tage mit Einträgen. Bisheriges Gesamtdefizit:{' '}
              <span className="font-bold text-text">
                {formatKcal(defizit.gesamt.defizit)} kcal
              </span>
              .
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DefizitKarte titel="Heute" fenster={defizit.tag} />
            <DefizitKarte titel="Letzte 7 Tage" fenster={defizit.woche} />
            <DefizitKarte titel="Letzte 30 Tage" fenster={defizit.monat} />
            <DefizitKarte titel="Gesamt" fenster={defizit.gesamt} />
          </div>
        </Card>
      )}

      {/* Zeitraum-Auswahl */}
      <Card title="Verlauf">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Field label="von">
            <TextInput
              type="date"
              value={von}
              max={bis}
              onChange={(e) => e.target.value && setVon(e.target.value)}
              className="tabular"
            />
          </Field>
          <Field label="bis">
            <TextInput
              type="date"
              value={bis}
              min={von}
              onChange={(e) => e.target.value && setBis(e.target.value)}
              className="tabular"
            />
          </Field>
          <Button
            onClick={() => {
              setVon(verschiebeDatum(heute, -29));
              setBis(heute);
            }}
          >
            Letzte 30 Tage
          </Button>
        </div>

        <div className="mb-2 text-sm font-bold text-text-muted">
          Kalorien pro Tag (kcal)
        </div>
        <LinienChart
          von={von}
          bis={bis}
          punkte={kcalPunkte}
          farbe="#5aa0d8"
          formatWert={formatKcal}
        />

        <div className="mb-2 mt-6 text-sm font-bold text-text-muted">
          Eiweiß pro Tag (g)
        </div>
        <LinienChart
          von={von}
          bis={bis}
          punkte={eiweissPunkte}
          farbe="#63b784"
          formatWert={(dg) => formatGramm(dg)}
        />

        <div className="mb-2 mt-6 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-text-muted">
            Gewicht (kg)
          </span>
          <span className="text-xs text-text-muted">
            <span className="text-[#d0a35a]">gemessen</span> ·{' '}
            <span className="text-text">gestrichelt: Trend</span>
            {trendProWoche !== null && (
              <> ({formatKg(trendProWoche)} kg/Woche)</>
            )}{' '}
            · <span className="text-[#5aa0d8]">Prognose aus Defizit</span>
          </span>
        </div>
        <LinienChart
          von={von}
          bis={bis}
          punkte={gewichtPunkte}
          farbe="#d0a35a"
          formatWert={(g) => formatKg(g)}
          punktLabel={(g, vorher) =>
            vorher === null ? '' : `${formatKg(g - vorher)} kg`
          }
          nullbasis={false}
          verbinden
          regression
          prognose={prognosePunkte}
          prognoseFarbe="#5aa0d8"
        />

        {gewicht.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-text-muted hover:text-text">
              Messungen im Trend ein-/ausschließen
              {gewicht.some((g) => g.aus_trend) &&
                ` (${gewicht.filter((g) => g.aus_trend).length} ausgeschlossen)`}
            </summary>
            <div className="mt-2 mb-2 text-xs text-text-muted">
              Häkchen entfernen = aus der Trendgerade ausschließen (z. B. die
              ersten Wasser-Tage).
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              {[...gewicht]
                .sort((a, b) => tagNummer(a.datum) - tagNummer(b.datum))
                .map((g) => (
                  <div key={g.datum} className="flex items-center gap-2">
                    <Checkbox
                      label={`${formatDatum(g.datum)} · ${formatKg(g.gramm)} kg`}
                      checked={!g.aus_trend}
                      onChange={(c) => trendUmschalten(g, c)}
                    />
                    {g.aus_trend && (
                      <span className="text-xs text-warning">
                        nicht im Trend
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </details>
        )}

        <div className="mb-2 mt-6 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-text-muted">
            Umsatz &amp; Aufnahme (kcal)
          </span>
          <span className="text-xs text-text-muted">
            <span className="text-[#d98c5a]">Gesamtumsatz</span> ·{' '}
            <span className="text-[#a86bd0]">+ Bewegung (Verbrauch)</span> ·{' '}
            <span className="text-[#5aa0d8]">Aufnahme</span> · Fläche{' '}
            <span className="text-[#63b784]">grün</span> = Defizit,{' '}
            <span className="text-[#d0654f]">rot</span> = Überschuss
          </span>
        </div>
        <LinienChart
          von={von}
          bis={bis}
          punkte={umsatzBewPunkte}
          farbe="#a86bd0"
          formatWert={formatKcal}
          verbinden
          flaeche={false}
          serien={[
            { punkte: umsatzPunkte, farbe: '#d98c5a', verbinden: true },
            { punkte: aufnahmePunkte, farbe: '#5aa0d8', verbinden: false },
          ]}
          differenz={{
            serie: 1,
            ueberFarbe: '#63b784',
            unterFarbe: '#d0654f',
          }}
        />

        <div className="mb-2 mt-6 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-text-muted">
            Tagesdefizit (kcal)
          </span>
          <span className="text-xs text-text-muted">
            Gesamtumsatz + Bewegung − Aufnahme ·{' '}
            <span className="text-[#63b784]">grün</span> = Defizit,{' '}
            <span className="text-[#d0654f]">rot</span> = Überschuss
          </span>
        </div>
        <LinienChart
          von={von}
          bis={bis}
          punkte={defizitPunkte}
          farbe="#dfe6ee"
          formatWert={formatKcal}
          nullbasis={false}
          flaeche={false}
          serien={[{ punkte: nullPunkte, farbe: '#6b7784', verbinden: true }]}
          differenz={{
            serie: 0,
            ueberFarbe: '#63b784',
            unterFarbe: '#d0654f',
          }}
        />

        <div className="mb-2 mt-6 flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-text-muted">
            Kumulierter Gewichtsverlust (kg)
          </span>
          <span className="text-xs text-text-muted">
            <span className="text-[#5aa0d8]">erwartet aus Defizit</span>{' '}
            (7000&nbsp;kcal/kg) ·{' '}
            <span className="text-[#d0a35a]">gemessen</span> · ab der ersten
            nicht ausgeschlossenen Messung
          </span>
        </div>
        <LinienChart
          von={von}
          bis={bis}
          punkte={erwartetVerlustPunkte}
          farbe="#5aa0d8"
          formatWert={(g) => formatKg(g)}
          verbinden
          serien={[
            {
              punkte: gemessenVerlustPunkte,
              farbe: '#d0a35a',
              verbinden: true,
            },
          ]}
        />
      </Card>

      {/* Letzte 7 Tage */}
      <Card title="Letzte 7 Tage">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-2 pr-3 font-normal">Tag</th>
              <th className="py-2 pr-3 text-right font-normal">kcal</th>
              <th className="py-2 pr-3 text-right font-normal">Eiweiß</th>
              <th className="py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {letzte.map((t) => (
              <tr key={t.datum} className="border-b border-border/50">
                <td className="py-2 pr-3">{formatDatum(t.datum)}</td>
                <td className="py-2 pr-3 text-right tabular">
                  {t.hat_daten ? formatKcal(t.kcal) : '—'}
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {t.hat_daten ? `${formatGramm(t.eiweiss_dg)} g` : '—'}
                </td>
                <td className="py-2 text-right">
                  <Button onClick={() => oeffneTag(t.datum)}>Öffnen</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
