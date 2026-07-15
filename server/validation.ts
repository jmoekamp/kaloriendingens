import { badRequest } from './errors.ts';

/** Liest ein Pflicht-Textfeld, getrimmt; wirft 400 wenn leer/fehlend. */
export function requireString(
  body: Record<string, unknown>,
  feld: string,
): string {
  const wert = body[feld];
  if (typeof wert !== 'string' || wert.trim() === '') {
    throw badRequest(`Feld "${feld}" ist erforderlich.`);
  }
  return wert.trim();
}

/** Optionales Textfeld; leerer/fehlender Wert wird zu null, sonst getrimmt. */
export function optionalString(
  body: Record<string, unknown>,
  feld: string,
): string | null {
  const wert = body[feld];
  if (wert === undefined || wert === null) return null;
  if (typeof wert !== 'string') {
    throw badRequest(`Feld "${feld}" muss Text sein.`);
  }
  const t = wert.trim();
  return t === '' ? null : t;
}

/** Optionale, nicht-negative Zahl; akzeptiert auch Zahl-als-String. */
export function optionalNonNegativeNumber(
  body: Record<string, unknown>,
  feld: string,
): number | null {
  const wert = body[feld];
  if (wert === undefined || wert === null || wert === '') return null;
  const n = typeof wert === 'number' ? wert : Number(wert);
  if (!Number.isFinite(n) || n < 0) {
    throw badRequest(`Feld "${feld}" muss eine nicht-negative Zahl sein.`);
  }
  return n;
}

/** Pflicht-Ganzzahl (z. B. Fremdschluessel). */
export function requireInteger(
  body: Record<string, unknown>,
  feld: string,
): number {
  const wert = body[feld];
  const n = typeof wert === 'number' ? wert : Number(wert);
  if (!Number.isInteger(n)) {
    throw badRequest(`Feld "${feld}" muss eine ganze Zahl sein.`);
  }
  return n;
}

/**
 * Optionale http(s)-URL. Leerer Wert wird zu '' (bedeutet: Default verwenden),
 * ein gesetzter Wert muss eine gueltige http- oder https-URL sein.
 */
export function optionalHttpUrl(
  body: Record<string, unknown>,
  feld: string,
): string | undefined {
  const wert = body[feld];
  if (wert === undefined) return undefined;
  if (wert === null || (typeof wert === 'string' && wert.trim() === '')) {
    return '';
  }
  if (typeof wert !== 'string') {
    throw badRequest(`Feld "${feld}" muss Text sein.`);
  }
  let url: URL;
  try {
    url = new URL(wert.trim());
  } catch {
    throw badRequest(`Feld "${feld}" ist keine gueltige URL.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw badRequest(`Feld "${feld}" muss eine http(s)-URL sein.`);
  }
  return wert.trim();
}

/** Optionale, nicht-negative Ganzzahl (z. B. Cent-Betrag). */
export function optionalNonNegativeInteger(
  body: Record<string, unknown>,
  feld: string,
): number | undefined {
  const wert = body[feld];
  if (wert === undefined || wert === null || wert === '') return undefined;
  const n = typeof wert === 'number' ? wert : Number(wert);
  if (!Number.isInteger(n) || n < 0) {
    throw badRequest(`Feld "${feld}" muss eine nicht-negative Ganzzahl sein.`);
  }
  return n;
}

/** Parst eine Pfad-/Query-ID; wirft 400 bei Unsinn. */
export function parseId(roh: string | undefined, was = 'id'): number {
  const n = Number(roh);
  if (!Number.isInteger(n) || n <= 0) {
    throw badRequest(`Ungueltige ${was}.`);
  }
  return n;
}

/** Pflicht-Ganzzahl in einem geschlossenen Bereich [min, max]. */
export function requireIntegerInRange(
  body: Record<string, unknown>,
  feld: string,
  min: number,
  max: number,
): number {
  const n = requireInteger(body, feld);
  if (n < min || n > max) {
    throw badRequest(`Feld "${feld}" muss zwischen ${min} und ${max} liegen.`);
  }
  return n;
}

/** Pflicht-Datum im ISO-Format YYYY-MM-DD; prueft auch die Kalenderplausibilitaet. */
export function requireIsoDate(
  body: Record<string, unknown>,
  feld: string,
): string {
  const wert = body[feld];
  if (typeof wert !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) {
    throw badRequest(`Feld "${feld}" muss ein Datum (YYYY-MM-DD) sein.`);
  }
  const d = new Date(`${wert}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== wert) {
    throw badRequest(`Feld "${feld}" ist kein gueltiges Datum.`);
  }
  return wert;
}

/** Optionaler Wahrheitswert mit Standard; akzeptiert bool, 0/1, "true"/"false". */
export function optionalBoolean(
  body: Record<string, unknown>,
  feld: string,
  standard: boolean,
): boolean {
  const wert = body[feld];
  if (wert === undefined || wert === null) return standard;
  if (typeof wert === 'boolean') return wert;
  if (wert === 1 || wert === '1' || wert === 'true') return true;
  if (wert === 0 || wert === '0' || wert === 'false') return false;
  throw badRequest(`Feld "${feld}" muss ein Wahrheitswert sein.`);
}

/** Optionale Ganzzahl oder null (leer/fehlend -> null). */
export function optionalIntegerOrNull(
  body: Record<string, unknown>,
  feld: string,
): number | null {
  const wert = body[feld];
  if (wert === undefined || wert === null || wert === '') return null;
  const n = typeof wert === 'number' ? wert : Number(wert);
  if (!Number.isInteger(n)) {
    throw badRequest(`Feld "${feld}" muss eine ganze Zahl sein.`);
  }
  return n;
}
