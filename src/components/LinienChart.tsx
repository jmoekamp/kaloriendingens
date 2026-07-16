/**
 * Schlanker SVG-Liniengraph ohne externe Abhaengigkeit (Datenschutz: alles
 * lokal).
 *
 * Die x-Achse ist ein fester DATUMS-Zeitraum [von, bis]; jeder Punkt liegt an
 * seinem echten Datum. Fuer Tage ohne Daten wird nichts gezeichnet – die Linie
 * wird an solchen Luecken unterbrochen (nur aufeinanderfolgende Kalendertage
 * werden verbunden). So zeigen mehrere Diagramme mit denselben von/bis exakt
 * dieselbe x-Achse.
 */
export interface ChartPunkt {
  datum: string; // YYYY-MM-DD
  wert: number;
}

/** Tagesnummer (Tage seit Epoche, UTC) fuer Position und Nachbarschaft. */
function tagNummer(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromTag(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

function kurz(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

export function LinienChart({
  von,
  bis,
  punkte,
  farbe = 'var(--accent, #5aa0d8)',
  formatWert = (n: number) => String(n),
  hoehe = 220,
  nullbasis = true,
}: {
  von: string;
  bis: string;
  punkte: ChartPunkt[];
  farbe?: string;
  formatWert?: (n: number) => string;
  hoehe?: number;
  /** true: y-Achse beginnt bei 0. false: y-Achse skaliert auf den Datenbereich
   * (z. B. Gewicht, das in einem schmalen Band schwankt). */
  nullbasis?: boolean;
}) {
  if (punkte.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-text-muted">
        Keine Daten im gewählten Zeitraum.
      </div>
    );
  }

  const breite = 720;
  const padL = 56;
  const padR = 16;
  const padT = 12;
  const padB = 34;
  const innerB = breite - padL - padR;
  const innerH = hoehe - padT - padB;

  // x-Achse: fester Datumsbereich.
  const d0 = tagNummer(von);
  const d1 = tagNummer(bis);
  const spanTage = Math.max(1, d1 - d0);
  const x = (iso: string) =>
    d1 === d0
      ? padL + innerB / 2
      : padL + (innerB * (tagNummer(iso) - d0)) / spanTage;

  // y-Achse: Skalierung an der Spanne der Werte.
  const werte = punkte.map((p) => p.wert);
  const rohMax = Math.max(...werte, 1);
  const rohMin = nullbasis ? 0 : Math.min(...werte);
  const spanne = Math.max(1, rohMax - rohMin);
  const schritt =
    spanne > 500 ? 500 : spanne > 100 ? 100 : spanne > 10 ? 10 : 1;
  const yMin = nullbasis ? 0 : Math.floor(rohMin / schritt) * schritt;
  let yMax = Math.ceil(rohMax / schritt) * schritt;
  if (yMax === yMin) yMax = yMin + schritt;
  const y = (w: number) =>
    padT + innerH - (innerH * (w - yMin)) / (yMax - yMin);

  // Punkte nach Datum sortieren und in Segmente aus aufeinanderfolgenden
  // Kalendertagen zerlegen (Luecken unterbrechen die Linie).
  const sortiert = [...punkte].sort(
    (a, b) => tagNummer(a.datum) - tagNummer(b.datum),
  );
  const segmente: ChartPunkt[][] = [];
  for (const p of sortiert) {
    const letztes = segmente[segmente.length - 1];
    const anschluss =
      letztes &&
      tagNummer(p.datum) === tagNummer(letztes[letztes.length - 1].datum) + 1;
    if (anschluss) letztes.push(p);
    else segmente.push([p]);
  }

  const baseY = padT + innerH;
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  // x-Beschriftung: Anfang, Mitte, Ende des Zeitraums.
  const xTicks = Array.from(
    new Set([von, fromTag(d0 + Math.floor(spanTage / 2)), bis]),
  );

  return (
    <svg
      viewBox={`0 0 ${breite} ${hoehe}`}
      className="w-full"
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      {yTicks.map((t, i) => (
        <g key={i}>
          <line
            x1={padL}
            x2={breite - padR}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border, #2c3a4a)"
            strokeWidth={1}
          />
          <text
            x={padL - 8}
            y={y(t) + 4}
            textAnchor="end"
            className="fill-text-muted"
            fontSize={11}
          >
            {formatWert(Math.round(t))}
          </text>
        </g>
      ))}

      {/* Ein Linien-/Flaechensegment je zusammenhaengendem Tagesblock. */}
      {segmente.map((seg, i) =>
        seg.length >= 2 ? (
          <g key={i}>
            <polygon
              points={
                `${x(seg[0].datum)},${baseY} ` +
                seg.map((p) => `${x(p.datum)},${y(p.wert)}`).join(' ') +
                ` ${x(seg[seg.length - 1].datum)},${baseY}`
              }
              fill={farbe}
              opacity={0.12}
            />
            <polyline
              points={seg.map((p) => `${x(p.datum)},${y(p.wert)}`).join(' ')}
              fill="none"
              stroke={farbe}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        ) : null,
      )}

      {sortiert.map((p) => (
        <circle
          key={p.datum}
          cx={x(p.datum)}
          cy={y(p.wert)}
          r={2.5}
          fill={farbe}
        >
          <title>{`${kurz(p.datum)}: ${formatWert(p.wert)}`}</title>
        </circle>
      ))}

      {xTicks.map((iso) => (
        <text
          key={iso}
          x={x(iso)}
          y={hoehe - 12}
          textAnchor="middle"
          className="fill-text-muted"
          fontSize={11}
        >
          {kurz(iso)}
        </text>
      ))}
    </svg>
  );
}
