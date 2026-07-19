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
import { lineareRegression } from '../../shared/naehrwerte.ts';
import { fromTag, tagNummer } from '../lib/format.ts';

export interface ChartPunkt {
  datum: string; // YYYY-MM-DD
  wert: number;
  /** false = nicht in die Regressionsgerade einbeziehen (Punkt bleibt sichtbar). */
  imTrend?: boolean;
}

/** Eine zusaetzliche Linie im selben Diagramm (gleiche Achsen). */
export interface Serie {
  punkte: ChartPunkt[];
  farbe: string;
  /** true: durchgehend verbinden; false: an Luecken (fehlende Tage) unterbrechen. */
  verbinden?: boolean;
}

function kurz(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
}

/** Punkte (bereits nach Datum sortiert) in Segmente aufeinanderfolgender Tage teilen. */
function baueSegmente(
  sortiert: ChartPunkt[],
  verbinden: boolean,
): ChartPunkt[][] {
  if (verbinden) return sortiert.length > 0 ? [sortiert] : [];
  const segmente: ChartPunkt[][] = [];
  for (const p of sortiert) {
    const letztes = segmente[segmente.length - 1];
    const anschluss =
      letztes &&
      tagNummer(p.datum) === tagNummer(letztes[letztes.length - 1].datum) + 1;
    if (anschluss) letztes.push(p);
    else segmente.push([p]);
  }
  return segmente;
}

export function LinienChart({
  von,
  bis,
  punkte,
  farbe = 'var(--accent, #5aa0d8)',
  formatWert = (n: number) => String(n),
  hoehe = 220,
  nullbasis = true,
  verbinden = false,
  regression = false,
  prognose,
  prognoseFarbe = '#5aa0d8',
  serien,
  flaeche = true,
  differenz,
  punktLabel,
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
  /** true: alle Messpunkte durchgehend verbinden (Trendlinie, z. B. Gewicht),
   * auch ueber Tage ohne Messung hinweg. false: Linie an Luecken unterbrechen. */
  verbinden?: boolean;
  /** true: zusaetzlich eine lineare Ausgleichsgerade (Regression) einzeichnen. */
  regression?: boolean;
  /** Optionale zweite Linie (z. B. Gewichtsprognose auf Defizitbasis). */
  prognose?: ChartPunkt[];
  prognoseFarbe?: string;
  /** Weitere Linien im selben Diagramm (z. B. Umsatz + Aufnahme). */
  serien?: Serie[];
  /** Flaeche unter der Hauptlinie fuellen (Standard true). */
  flaeche?: boolean;
  /**
   * Flaeche zwischen der Hauptlinie und einer Serie farbig hervorheben:
   * ueberFarbe, wo die Hauptlinie oben liegt (Serie darunter), sonst unterFarbe.
   */
  differenz?: { serie: number; ueberFarbe: string; unterFarbe: string };
  /**
   * Kleines Text-Label je Hauptpunkt. Bekommt den Wert des Punkts und den Wert
   * des vorherigen Punkts (null beim ersten) – z. B. fuer die Gewichtsreduktion
   * gegenueber der vorherigen Messung.
   */
  punktLabel?: (wert: number, vorher: number | null) => string;
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

  // y-Achse: Skalierung an der Spanne aller Werte (inkl. Prognose + Serien).
  const werte = [
    ...punkte,
    ...(prognose ?? []),
    ...(serien ?? []).flatMap((s) => s.punkte),
  ].map((p) => p.wert);
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

  // Punkte nach Datum sortieren. Bei verbinden=true entsteht EIN Segment
  // (durchgehende Trendlinie); sonst wird an Luecken (nicht aufeinanderfolgende
  // Kalendertage) unterbrochen.
  const sortiert = [...punkte].sort(
    (a, b) => tagNummer(a.datum) - tagNummer(b.datum),
  );
  const segmente = baueSegmente(sortiert, verbinden);

  // Zusaetzliche Linien (Serien) vorbereiten.
  const serienGezeichnet = (serien ?? []).map((s) => {
    const sort = [...s.punkte].sort(
      (a, b) => tagNummer(a.datum) - tagNummer(b.datum),
    );
    return {
      farbe: s.farbe,
      sortiert: sort,
      segmente: baueSegmente(sort, s.verbinden ?? false),
    };
  });

  const baseY = padT + innerH;
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];
  // x-Beschriftung: Anfang, Mitte, Ende des Zeitraums.
  const xTicks = Array.from(
    new Set([von, fromTag(d0 + Math.floor(spanTage / 2)), bis]),
  );

  // Ausgleichsgerade nur ueber die Punkte, die im Trend zaehlen (imTrend != false).
  const trendPunkte = sortiert.filter((p) => p.imTrend !== false);
  const reg =
    regression && trendPunkte.length >= 2
      ? lineareRegression(
          trendPunkte.map((p) => tagNummer(p.datum)),
          trendPunkte.map((p) => p.wert),
        )
      : null;
  let regLinie: string | null = null;
  if (reg) {
    const t0 = tagNummer(trendPunkte[0].datum);
    const t1 = tagNummer(trendPunkte[trendPunkte.length - 1].datum);
    const px = (t: number) => x(fromTag(t));
    const py = (t: number) => y(reg.steigung * t + reg.achsenabschnitt);
    regLinie = `${px(t0)},${py(t0)} ${px(t1)},${py(t1)}`;
  }

  // Differenzflaeche zwischen Hauptlinie und einer Serie (grün/rot je Vorzeichen).
  const differenzFlaechen: { punkte: string; farbe: string }[] = [];
  const diffSerie = differenz && serien ? serien[differenz.serie] : undefined;
  if (differenz && diffSerie) {
    const mainByDate = new Map(punkte.map((p) => [p.datum, p.wert]));
    const sPts = [...diffSerie.punkte]
      .filter((p) => mainByDate.has(p.datum))
      .sort((a, b) => tagNummer(a.datum) - tagNummer(b.datum));
    const farbeFor = (d: number) =>
      d >= 0 ? differenz.ueberFarbe : differenz.unterFarbe;
    for (let i = 0; i < sPts.length - 1; i++) {
      const p = sPts[i];
      const q = sPts[i + 1];
      if (tagNummer(q.datum) !== tagNummer(p.datum) + 1) continue;
      const m1 = mainByDate.get(p.datum) as number;
      const m2 = mainByDate.get(q.datum) as number;
      const a1 = p.wert;
      const a2 = q.wert;
      const d1 = m1 - a1;
      const d2 = m2 - a2;
      const x1 = x(p.datum);
      const x2 = x(q.datum);
      if ((d1 >= 0 && d2 >= 0) || (d1 <= 0 && d2 <= 0)) {
        differenzFlaechen.push({
          farbe: farbeFor(d1 !== 0 ? d1 : d2),
          punkte: `${x1},${y(m1)} ${x2},${y(m2)} ${x2},${y(a2)} ${x1},${y(a1)}`,
        });
      } else {
        // Vorzeichenwechsel: am Schnittpunkt teilen.
        const t = d1 / (d1 - d2);
        const xc = x1 + t * (x2 - x1);
        const yc = y(m1 + t * (m2 - m1));
        differenzFlaechen.push({
          farbe: farbeFor(d1),
          punkte: `${x1},${y(m1)} ${xc},${yc} ${x1},${y(a1)}`,
        });
        differenzFlaechen.push({
          farbe: farbeFor(d2),
          punkte: `${xc},${yc} ${x2},${y(m2)} ${x2},${y(a2)}`,
        });
      }
    }
  }

  // Optionale Prognose-Linie (zweite Kurve), nach Datum verbunden.
  const prognoseSortiert = (prognose ?? [])
    .slice()
    .sort((a, b) => tagNummer(a.datum) - tagNummer(b.datum));
  const prognoseLinie =
    prognoseSortiert.length >= 2
      ? prognoseSortiert.map((p) => `${x(p.datum)},${y(p.wert)}`).join(' ')
      : null;

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

      {/* Differenzflaeche zwischen Hauptlinie und Serie (liegt ganz hinten). */}
      {differenzFlaechen.map((f, i) => (
        <polygon
          key={`diff-${i}`}
          points={f.punkte}
          fill={f.farbe}
          opacity={0.2}
        />
      ))}

      {/* Optionale Prognose-Linie (liegt hinter den Messwerten). */}
      {prognoseLinie && (
        <polyline
          points={prognoseLinie}
          fill="none"
          stroke={prognoseFarbe}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.9}
        />
      )}

      {/* Zusaetzliche Linien (Serien) – nur Linien + kleine Punkte. */}
      {serienGezeichnet.map((s, si) => (
        <g key={`serie-${si}`}>
          {s.segmente.map((seg, i) =>
            seg.length >= 2 ? (
              <polyline
                key={i}
                points={seg.map((p) => `${x(p.datum)},${y(p.wert)}`).join(' ')}
                fill="none"
                stroke={s.farbe}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}
          {s.sortiert.map((p) => (
            <circle
              key={p.datum}
              cx={x(p.datum)}
              cy={y(p.wert)}
              r={2}
              fill={s.farbe}
            >
              <title>{`${kurz(p.datum)}: ${formatWert(p.wert)}`}</title>
            </circle>
          ))}
        </g>
      ))}

      {/* Ein Linien-/Flaechensegment je zusammenhaengendem Tagesblock. */}
      {segmente.map((seg, i) =>
        seg.length >= 2 ? (
          <g key={i}>
            {flaeche && (
              <polygon
                points={
                  `${x(seg[0].datum)},${baseY} ` +
                  seg.map((p) => `${x(p.datum)},${y(p.wert)}`).join(' ') +
                  ` ${x(seg[seg.length - 1].datum)},${baseY}`
                }
                fill={farbe}
                opacity={0.12}
              />
            )}
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

      {/* Lineare Ausgleichsgerade (gestrichelt). */}
      {regLinie && (
        <polyline
          points={regLinie}
          fill="none"
          stroke="var(--text, #dfe6ee)"
          strokeWidth={2}
          strokeDasharray="7 5"
          opacity={0.85}
        />
      )}

      {sortiert.map((p) =>
        p.imTrend === false ? (
          // Aus dem Trend ausgeschlossen: hohler Punkt.
          <circle
            key={p.datum}
            cx={x(p.datum)}
            cy={y(p.wert)}
            r={3}
            fill="#161d26"
            stroke={farbe}
            strokeWidth={1.5}
          >
            <title>{`${kurz(p.datum)}: ${formatWert(p.wert)} (nicht im Trend)`}</title>
          </circle>
        ) : (
          <circle
            key={p.datum}
            cx={x(p.datum)}
            cy={y(p.wert)}
            r={2.5}
            fill={farbe}
          >
            <title>{`${kurz(p.datum)}: ${formatWert(p.wert)}`}</title>
          </circle>
        ),
      )}

      {/* Kleines Label je Punkt (z. B. Gewichtsreduktion in kg zum Vorpunkt). */}
      {punktLabel &&
        sortiert.map((p, i) => (
          <text
            key={`lbl-${p.datum}`}
            x={x(p.datum) - 4}
            y={y(p.wert) + 12}
            textAnchor="end"
            className="fill-text-muted"
            fontSize={9}
          >
            {punktLabel(p.wert, i === 0 ? null : sortiert[i - 1].wert)}
          </text>
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
