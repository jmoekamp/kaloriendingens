import { useEffect, useState } from 'react';
import type { AllzeitTag, DetailTag } from '../../shared/types.ts';
import { Banner, Button, Card } from '../components/ui.tsx';
import { formatGramm, formatKcal, formatKg } from '../../shared/naehrwerte.ts';
import { formatDatum } from '../lib/format.ts';
import { auswertungApi } from '../lib/auswertung.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

/**
 * Baut den Report als Tab-getrennten Text (TSV) fuer die Zwischenablage:
 * Zahlen ohne Tausenderpunkte, Dezimaltrenner Komma, leere Zellen fuer null –
 * so laesst er sich direkt in deutsche Tabellenkalkulationen einfuegen.
 */
function baueTsv(zeilen: AllzeitTag[]): string {
  const kopf = [
    'Datum',
    'Gewicht (kg)',
    'Gesamtumsatz (kcal)',
    'Bewegung (kcal)',
    'Verbrauch (kcal)',
    'Aufnahme (kcal)',
    'Defizit (kcal)',
    'Eiweiß (g)',
  ].join('\t');
  const koerper = zeilen.map((z) =>
    [
      formatDatum(z.datum),
      z.gewicht_gramm === null ? '' : formatKg(z.gewicht_gramm),
      String(z.gesamtumsatz),
      String(z.bewegung),
      String(z.verbrauch),
      z.aufnahme_kcal === null ? '' : String(z.aufnahme_kcal),
      z.defizit_kcal === null ? '' : String(z.defizit_kcal),
      z.eiweiss_dg === null ? '' : formatGramm(z.eiweiss_dg),
    ].join('\t'),
  );
  return [kopf, ...koerper].join('\n');
}

/**
 * Eine Zeile des Detailreports (Tageszeile, Mahlzeit oder Bewegung), bereits
 * auf die gemeinsamen Spalten abgebildet. Leere Zellen als ''.
 */
interface DetailZeile {
  art: 'tag' | 'mahlzeit' | 'bewegung';
  zellen: string[]; // Datum, Uhrzeit, Eintrag, Menge, Gewicht, Umsatz, Bewegung, Verbrauch, Aufnahme, Defizit, Eiweiss
}

const DETAIL_KOPF = [
  'Datum',
  'Uhrzeit',
  'Eintrag',
  'Menge (g)',
  'Gewicht (kg)',
  'Gesamtumsatz (kcal)',
  'Bewegung (kcal)',
  'Verbrauch (kcal)',
  'Aufnahme (kcal)',
  'Defizit (kcal)',
  'Eiweiß (g)',
];

/**
 * Baut die Zeilen des Detailreports: je Tag die Tageszeile (Summen wie im
 * Allzeitreport), darunter Mahlzeiten und Bewegungen chronologisch gemischt.
 * `roh` liefert Zahlen ohne Tausenderpunkte (fuer TSV), sonst formatiert.
 */
function baueDetailZeilen(tage: DetailTag[], roh: boolean): DetailZeile[] {
  const kcalFmt = (n: number) => (roh ? String(n) : formatKcal(n));
  const zeilen: DetailZeile[] = [];
  for (const t of tage) {
    const z = t.tag;
    zeilen.push({
      art: 'tag',
      zellen: [
        formatDatum(z.datum),
        '',
        '',
        '',
        z.gewicht_gramm === null ? '' : formatKg(z.gewicht_gramm),
        kcalFmt(z.gesamtumsatz),
        z.bewegung === 0 ? '' : kcalFmt(z.bewegung),
        kcalFmt(z.verbrauch),
        z.aufnahme_kcal === null ? '' : kcalFmt(z.aufnahme_kcal),
        z.defizit_kcal === null ? '' : kcalFmt(z.defizit_kcal),
        z.eiweiss_dg === null ? '' : formatGramm(z.eiweiss_dg),
      ],
    });
    // Mahlzeiten und Bewegungen des Tages chronologisch mischen.
    const details: DetailZeile[] = [
      ...t.mahlzeiten.map((m): DetailZeile => ({
        art: 'mahlzeit',
        zellen: [
          '',
          m.uhrzeit,
          m.gegessen ? m.lebensmittel_name : `${m.lebensmittel_name} (geplant)`,
          String(m.menge_gramm),
          '',
          '',
          '',
          '',
          kcalFmt(m.kcal),
          '',
          formatGramm(m.eiweiss_dg),
        ],
      })),
      ...t.bewegungen.map((b): DetailZeile => ({
        art: 'bewegung',
        zellen: [
          '',
          b.uhrzeit,
          b.beschreibung,
          '',
          '',
          '',
          kcalFmt(b.kcal),
          '',
          '',
          '',
          '',
        ],
      })),
    ].sort((a, b) => a.zellen[1].localeCompare(b.zellen[1]));
    zeilen.push(...details);
  }
  return zeilen;
}

/** Detailreport als TSV (Tab-getrennt) fuer die Zwischenablage. */
function baueDetailTsv(tage: DetailTag[]): string {
  return [
    DETAIL_KOPF.join('\t'),
    ...baueDetailZeilen(tage, true).map((z) => z.zellen.join('\t')),
  ].join('\n');
}

/** Detailreport: Tageszeilen plus Mahlzeiten/Bewegung, Copy & Paste. */
function DetailReportKarte() {
  const [tage, setTage] = useState<DetailTag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    auswertungApi
      .detail()
      .then(setTage)
      .catch((e) => setFehler(meldung(e)))
      .finally(() => setGeladen(true));
  }, []);

  async function kopieren() {
    setFehler(null);
    setKopiert(false);
    try {
      await navigator.clipboard.writeText(baueDetailTsv(tage));
      setKopiert(true);
    } catch (e) {
      setFehler(meldung(e));
    }
  }

  const zeilen = baueDetailZeilen(tage, false);

  return (
    <Card title="Detailreport (alles)">
      {fehler && (
        <div className="mb-3">
          <Banner kind="error" onClose={() => setFehler(null)}>
            {fehler}
          </Banner>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="text-sm text-text-muted">
          Wie der Allzeitreport, aber unter jeder Tageszeile stehen zusätzlich
          alle Mahlzeiten und Bewegungseinträge des Tages (chronologisch,
          geplante Mahlzeiten markiert).
        </p>
        <div className="ml-auto flex items-center gap-2">
          {kopiert && <span className="text-sm text-success">kopiert ✓</span>}
          <Button onClick={kopieren} disabled={tage.length === 0}>
            Tabelle kopieren
          </Button>
        </div>
      </div>

      {!geladen ? (
        <p className="text-text-muted">Lade …</p>
      ) : tage.length === 0 ? (
        <p className="text-text-muted">Noch keine Daten erfasst.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              {DETAIL_KOPF.map((k, i) => (
                <th
                  key={k}
                  className={`py-1.5 pr-3 font-normal ${i >= 3 ? 'text-right' : ''}`}
                >
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z, i) => (
              <tr
                key={i}
                className={
                  z.art === 'tag'
                    ? 'border-t border-border bg-surface-2/50 font-bold'
                    : 'text-text-muted'
                }
              >
                {z.zellen.map((wert, si) => (
                  <td
                    key={si}
                    className={`py-1 pr-3 tabular ${si >= 3 ? 'text-right' : ''}`}
                  >
                    {wert}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** Allzeitreport: eine Zeile je Tag (erste Erfassung bis heute), Copy & Paste. */
export default function AllzeitSeite() {
  const [zeilen, setZeilen] = useState<AllzeitTag[]>([]);
  const [geladen, setGeladen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState(false);

  useEffect(() => {
    auswertungApi
      .allzeit()
      .then(setZeilen)
      .catch((e) => setFehler(meldung(e)))
      .finally(() => setGeladen(true));
  }, []);

  async function kopieren() {
    setFehler(null);
    setKopiert(false);
    try {
      await navigator.clipboard.writeText(baueTsv(zeilen));
      setKopiert(true);
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

      <Card title="Allzeitreport">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-muted">
            Alle Tage von der ersten Erfassung bis heute – zum Markieren und
            Kopieren (z.&nbsp;B. in eine Tabellenkalkulation). Aufnahme/Eiweiß
            zählen nur gegessene Mahlzeiten.
          </p>
          <div className="ml-auto flex items-center gap-2">
            {kopiert && <span className="text-sm text-success">kopiert ✓</span>}
            <Button onClick={kopieren} disabled={zeilen.length === 0}>
              Tabelle kopieren
            </Button>
          </div>
        </div>

        {!geladen ? (
          <p className="text-text-muted">Lade …</p>
        ) : zeilen.length === 0 ? (
          <p className="text-text-muted">Noch keine Daten erfasst.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-1.5 pr-3 font-normal">Datum</th>
                <th className="py-1.5 pr-3 text-right font-normal">
                  Gewicht (kg)
                </th>
                <th className="py-1.5 pr-3 text-right font-normal">
                  Gesamtumsatz
                </th>
                <th className="py-1.5 pr-3 text-right font-normal">Bewegung</th>
                <th className="py-1.5 pr-3 text-right font-normal">
                  Verbrauch
                </th>
                <th className="py-1.5 pr-3 text-right font-normal">Aufnahme</th>
                <th className="py-1.5 pr-3 text-right font-normal">Defizit</th>
                <th className="py-1.5 pr-3 text-right font-normal">
                  Eiweiß (g)
                </th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.datum} className="border-b border-border/50">
                  <td className="py-1.5 pr-3 tabular">
                    {formatDatum(z.datum)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular">
                    {z.gewicht_gramm === null ? '' : formatKg(z.gewicht_gramm)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular">
                    {formatKcal(z.gesamtumsatz)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular">
                    {z.bewegung === 0 ? '' : formatKcal(z.bewegung)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular">
                    {formatKcal(z.verbrauch)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular">
                    {z.aufnahme_kcal === null
                      ? ''
                      : formatKcal(z.aufnahme_kcal)}
                  </td>
                  <td
                    className={`py-1.5 pr-3 text-right tabular ${
                      z.defizit_kcal === null
                        ? ''
                        : z.defizit_kcal >= 0
                          ? 'text-success'
                          : 'text-danger'
                    }`}
                  >
                    {z.defizit_kcal === null ? '' : formatKcal(z.defizit_kcal)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular">
                    {z.eiweiss_dg === null ? '' : formatGramm(z.eiweiss_dg)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <DetailReportKarte />
    </div>
  );
}
