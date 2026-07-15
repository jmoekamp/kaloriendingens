import { useEffect, useState } from 'react';
import type {
  DefizitFenster,
  DefizitReport,
  TagesZusammenfassung,
  Verlauf,
} from '../../shared/types.ts';
import { Banner, Button, Card, Field, TextInput } from '../components/ui.tsx';
import { LinienChart, type ChartPunkt } from '../components/LinienChart.tsx';
import { formatGramm, formatKcal } from '../../shared/naehrwerte.ts';
import { formatDatum, heuteIso, verschiebeDatum } from '../lib/format.ts';
import { auswertungApi } from '../lib/auswertung.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

/** Kurzes Achsenlabel: 2026-07-15 -> 15.07. */
function kurzDatum(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
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

export default function LangfristSeite({
  oeffneTag,
}: {
  oeffneTag: (datum: string) => void;
}) {
  const heute = heuteIso();
  const [von, setVon] = useState(verschiebeDatum(heute, -29));
  const [bis, setBis] = useState(heute);
  const [verlauf, setVerlauf] = useState<Verlauf | null>(null);
  const [letzte, setLetzte] = useState<TagesZusammenfassung[]>([]);
  const [defizit, setDefizit] = useState<DefizitReport | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  function ladeVerlauf() {
    setFehler(null);
    auswertungApi
      .verlauf(von, bis)
      .then(setVerlauf)
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
  }, []);

  const kcalPunkte: ChartPunkt[] =
    verlauf?.punkte.map((p) => ({ label: kurzDatum(p.datum), wert: p.kcal })) ??
    [];
  const eiweissPunkte: ChartPunkt[] =
    verlauf?.punkte.map((p) => ({
      label: kurzDatum(p.datum),
      wert: p.eiweiss_dg,
    })) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {fehler && (
        <Banner kind="error" onClose={() => setFehler(null)}>
          {fehler}
        </Banner>
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
          punkte={kcalPunkte}
          farbe="#5aa0d8"
          formatWert={formatKcal}
        />

        <div className="mb-2 mt-6 text-sm font-bold text-text-muted">
          Eiweiß pro Tag (g)
        </div>
        <LinienChart
          punkte={eiweissPunkte}
          farbe="#63b784"
          formatWert={(dg) => formatGramm(dg)}
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
