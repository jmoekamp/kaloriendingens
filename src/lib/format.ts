/** Kleine Anzeige-Helfer fuer Datum/Uhrzeit im Frontend. */

/** Lokales Kalenderdatum „heute" als YYYY-MM-DD. */
export function heuteIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}

/** Aktuelle Uhrzeit als HH:MM (lokal). */
export function jetztUhrzeit(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
}

/** ISO-Datum (YYYY-MM-DD) deutsch formatieren: 2026-07-15 -> 15.07.2026. */
export function formatDatum(iso: string): string {
  const [y, m, t] = iso.split('-');
  if (!y || !m || !t) return iso;
  return `${t}.${m}.${y}`;
}

/** Verschiebt ein ISO-Datum um n Tage (UTC-stabil). */
export function verschiebeDatum(iso: string, tage: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Tagesnummer (Tage seit Epoche, UTC) – fuer Positionen und Regression. */
export function tagNummer(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Umkehrung von tagNummer: Tagesnummer -> YYYY-MM-DD. */
export function fromTag(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** Datum vor n Monaten (lokal), als YYYY-MM-DD. */
export function vorMonaten(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}
