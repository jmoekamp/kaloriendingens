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
}: {
  punkte: ChartPunkt[];
  farbe?: string;
  formatWert?: (n: number) => string;
  hoehe?: number;
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

  const maxWert = Math.max(...punkte.map((p) => p.wert), 1);
  // „Schoene" Obergrenze: auf 10er/100er aufrunden je nach Groesse.
  const schritt =
    maxWert > 500 ? 500 : maxWert > 100 ? 100 : maxWert > 10 ? 10 : 1;
  const yMax = Math.ceil(maxWert / schritt) * schritt || 1;

  const x = (i: number) =>
    padL +
    (punkte.length === 1 ? innerB / 2 : (innerB * i) / (punkte.length - 1));
  const y = (w: number) => padT + innerH - (innerH * w) / yMax;

  const linie = punkte.map((p, i) => `${x(i)},${y(p.wert)}`).join(' ');
  const flaeche =
    `${padL},${padT + innerH} ` +
    punkte.map((p, i) => `${x(i)},${y(p.wert)}`).join(' ') +
    ` ${x(punkte.length - 1)},${padT + innerH}`;

  // y-Gitterlinien (0, 1/2, max).
  const yTicks = [0, yMax / 2, yMax];
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
