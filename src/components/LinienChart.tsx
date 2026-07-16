/**
 * Schlanker SVG-Liniengraph ohne externe Abhaengigkeit (Datenschutz: alles
 * lokal). Punkte werden gleichmaessig entlang der x-Achse verteilt (ein Punkt =
 * ein Tag mit Daten); die y-Achse skaliert auf das Maximum der Werte.
 */
export interface ChartPunkt {
  /** Beschriftung fuer die x-Achse (z. B. Datum). */
  label: string;
  wert: number;
}

export function LinienChart({
  punkte,
  farbe = 'var(--accent, #5aa0d8)',
  formatWert = (n: number) => String(n),
  hoehe = 220,
  nullbasis = true,
}: {
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

  const werte = punkte.map((p) => p.wert);
  const rohMax = Math.max(...werte, 1);
  const rohMin = nullbasis ? 0 : Math.min(...werte);
  // Schrittweite an der SPANNE ausrichten, damit auch enge Baender (Gewicht)
  // sinnvoll aufgeloest werden.
  const spanne = Math.max(1, rohMax - rohMin);
  const schritt =
    spanne > 500 ? 500 : spanne > 100 ? 100 : spanne > 10 ? 10 : 1;
  const yMin = nullbasis ? 0 : Math.floor(rohMin / schritt) * schritt;
  let yMax = Math.ceil(rohMax / schritt) * schritt;
  if (yMax === yMin) yMax = yMin + schritt;

  const x = (i: number) =>
    padL +
    (punkte.length === 1 ? innerB / 2 : (innerB * i) / (punkte.length - 1));
  const y = (w: number) =>
    padT + innerH - (innerH * (w - yMin)) / (yMax - yMin);

  const linie = punkte.map((p, i) => `${x(i)},${y(p.wert)}`).join(' ');
  const flaeche =
    `${padL},${padT + innerH} ` +
    punkte.map((p, i) => `${x(i)},${y(p.wert)}`).join(' ') +
    ` ${x(punkte.length - 1)},${padT + innerH}`;

  // y-Gitterlinien (unten, Mitte, oben).
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  // x-Beschriftung: erste, mittlere, letzte (vermeidet Ueberlappung).
  const xTickIdx = Array.from(
    new Set([0, Math.floor((punkte.length - 1) / 2), punkte.length - 1]),
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

      <polygon points={flaeche} fill={farbe} opacity={0.12} />
      <polyline
        points={linie}
        fill="none"
        stroke={farbe}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {punkte.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.wert)} r={2.5} fill={farbe}>
          <title>{`${p.label}: ${formatWert(p.wert)}`}</title>
        </circle>
      ))}

      {xTickIdx.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={hoehe - 12}
          textAnchor="middle"
          className="fill-text-muted"
          fontSize={11}
        >
          {punkte[i].label}
        </text>
      ))}
    </svg>
  );
}
