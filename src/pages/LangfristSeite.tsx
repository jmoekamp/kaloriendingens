import { useEffect, useState } from 'react';
import type {
  AbnehmFortschritt,
  DefizitFenster,
  DefizitReport,
  GewichtPunkt,
  TagesZusammenfassung,
  Verlauf,
} from '../../shared/types.ts';
import { Banner, Button, Card, Field, TextInput } from '../components/ui.tsx';
import { LinienChart, type ChartPunkt } from '../components/LinienChart.tsx';
import {
  formatGramm,
  formatKcal,
  formatKg,
  formatProzent,
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
  }));
  // Trend aus linearer Regression: Steigung in Gramm/Tag -> Gramm/Woche.
  const gewichtReg = lineareRegression(
    gewicht.map((g) => tagNummer(g.datum)),
    gewicht.map((g) => g.gramm),
  );
  const trendProWoche = gewichtReg ? gewichtReg.steigung * 7 : null;

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

              {/* Prognosen: Median-Defizit seit Festlegung und Defizit wie am Vortag */}
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
          {trendProWoche !== null && (
            <span className="text-xs text-text-muted">
              gestrichelt: linearer Trend ={' '}
              <span className="font-bold text-text">
                {formatKg(trendProWoche)} kg/Woche
              </span>
            </span>
          )}
        </div>
        <LinienChart
          von={von}
          bis={bis}
          punkte={gewichtPunkte}
          farbe="#d0a35a"
          formatWert={(g) => formatKg(g)}
          nullbasis={false}
          verbinden
          regression
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
