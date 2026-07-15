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
