import { useEffect, useState } from 'react';
import type { AllzeitTag } from '../../shared/types.ts';
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
    </div>
  );
}
