/**
 * Geld-Hilfsfunktionen. Beträge werden IMMER in Cent (Ganzzahl) gehalten und
 * erst zur Anzeige formatiert (siehe CLAUDE.md). Diese Funktionen sind die eine
 * zentrale Stelle dafür und werden auch von der späteren Posten-Logik genutzt.
 */

/** Tausender-Gruppierung (deutsch: Punkt) ohne Locale-Abhängigkeit. */
function gruppiere(ganzzahl: number): string {
  return ganzzahl.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Formatiert Cent als deutschen Betrag ohne Währungszeichen, z. B. 123456 -> "1.234,56". */
export function formatCent(cent: number): string {
  const gerundet = Math.round(cent);
  const negativ = gerundet < 0;
  const abs = Math.abs(gerundet);
  const euro = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${negativ ? '-' : ''}${gruppiere(euro)},${rest
    .toString()
    .padStart(2, '0')}`;
}

/** Wie formatCent, aber mit Euro-Zeichen, z. B. "1.234,56 €". */
export function formatCentEuro(cent: number): string {
  return `${formatCent(cent)} €`;
}

/**
 * Parst eine Euro-Eingabe in Cent (kaufmännisch gerundet). Akzeptiert sowohl
 * deutsches ("12,34") als auch englisches ("12.34") Dezimaltrennzeichen sowie
 * Tausenderpunkte ("1.234,56"). Auch OHNE Komma gelten reine 3er-Punktgruppen
 * als Tausendertrenner: "1.234" = 1.234,00 € (deutsche Schreibweise), NICHT
 * 1,23 € – englische Dezimaleingaben haben nie genau 3er-Gruppen ("12.34",
 * "0.5"). Liefert null bei leerer/ungültiger Eingabe.
 */
export function parseEuroToCent(eingabe: string): number | null {
  let t = eingabe.trim().replace(/[\s€]/g, '');
  if (t === '') return null;
  if (t.includes(',')) {
    // Komma = Dezimaltrenner, Punkte = Tausender
    t = t.replace(/\./g, '').replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    // Kein Komma, nur exakte 3er-Punktgruppen: Tausenderschreibweise
    // ("1.234", "12.345.678"). "0.500" bleibt dagegen Dezimalzahl.
    t = t.replace(/\./g, '');
  }
  if (!/^-?\d*(\.\d*)?$/.test(t) || t === '-' || t === '.' || t === '-.') {
    return null;
  }
  const negativ = t.startsWith('-');
  if (negativ) t = t.slice(1);
  const [ganz, frac = ''] = t.split('.');
  // Stringbasiert rechnen, um Gleitkomma-Rundungsfehler zu vermeiden.
  const ganzCent = (ganz === '' ? 0 : Number(ganz)) * 100;
  let cent = ganzCent + Number(frac.slice(0, 2).padEnd(2, '0') || '0');
  const dritteStelle = frac.charAt(2);
  if (dritteStelle !== '' && Number(dritteStelle) >= 5) {
    cent += 1; // kaufmaennisch auf volle Cent runden
  }
  return negativ ? -cent : cent;
}
