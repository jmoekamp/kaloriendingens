/**
 * Anbindung an Open Food Facts (OFF) – der EINZIGE Auszenkontakt der App und
 * eine bewusste Ausnahme vom „alles bleibt lokal"-Grundsatz (nur auf explizite
 * Nutzer-Suche, ausschliesslich lesend, per Server-Proxy). Der Browser spricht
 * nur mit der App; der Server ruft OFF ab und liefert bereits aufbereitete
 * Treffer (Name, kcal/100 g, Eiweiss/100 g, Packungsgroesse) zurueck.
 */
import type { OffTreffer } from '../shared/types.ts';
import { badGateway, badRequest } from './errors.ts';

// Neuer Search-a-licious-Dienst von OFF. Der alte cgi/search.pl-Endpunkt ist
// stark rate-limitiert und liefert oft HTTP 503; dieser Dienst ist robuster.
const OFF_SUCHE_URL = 'https://search.openfoodfacts.org/search';
// Produkt-Einzelabruf per Barcode/EAN (API v2; deutlich mildere Rate-Limits).
const OFF_PRODUKT_URL = 'https://world.openfoodfacts.org/api/v2/product';
// OFF bittet um einen identifizierenden User-Agent.
const USER_AGENT =
  'kaloriendingens/1.0 (self-hosted; lokale Naehrwertverwaltung)';
const TIMEOUT_MS = 10_000;
const MAX_TREFFER = 20;

/** OFF-Rohprodukt (nur die von uns genutzten Felder). */
interface OffProdukt {
  code?: string | number;
  product_name?: string;
  // Der alte CGI-Endpunkt liefert einen kommaseparierten String, Search-a-licious
  // ein Array.
  brands?: string | string[];
  quantity?: string;
  product_quantity?: string | number;
  nutriments?: Record<string, unknown>;
}

/** Wandelt einen unbekannten Wert in eine endliche Zahl oder null. */
function zahlOderNull(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === '') return null;
  const n = typeof wert === 'number' ? wert : Number(wert);
  return Number.isFinite(n) ? n : null;
}

/** kcal je 100 g aus den Naehrwerten: bevorzugt kcal, sonst kJ (÷ 4,184). */
function kcalPro100g(n: Record<string, unknown>): number | null {
  const kcal = zahlOderNull(n['energy-kcal_100g']);
  if (kcal !== null) return Math.round(kcal);
  const kj =
    zahlOderNull(n['energy-kj_100g']) ?? zahlOderNull(n['energy_100g']);
  return kj !== null ? Math.round(kj / 4.184) : null;
}

/**
 * Packungsgroesse in Gramm: bevorzugt das numerische `product_quantity`, sonst
 * eine einfache Textangabe wie „500 g" / „1 kg". Fluessigkeiten (ml/l) werden
 * nicht uebernommen (die App rechnet in Gramm). null, wenn nicht ermittelbar.
 */
function packungGramm(p: OffProdukt): number | null {
  const pq = zahlOderNull(p.product_quantity);
  if (pq !== null && pq > 0) return Math.round(pq);
  const text = (p.quantity ?? '').toString().trim().toLowerCase();
  const m = text.match(/^([\d.,]+)\s*(g|kg)\b/);
  if (!m) return null;
  const zahl = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(zahl) || zahl <= 0) return null;
  return Math.round(m[2] === 'kg' ? zahl * 1000 : zahl);
}

/** Erste Marke aus String (CGI, kommasepariert) oder Array (Search-a-licious). */
function ersteMarke(brands: string | string[] | undefined): string {
  if (Array.isArray(brands)) return (brands[0] ?? '').toString().trim();
  if (typeof brands === 'string') return brands.split(',')[0]?.trim() ?? '';
  return '';
}

/** Baut einen Anzeigenamen: erst die (erste) Marke, dann der Produktname. */
function baueName(p: OffProdukt): string {
  const name = (p.product_name ?? '').trim();
  const marke = ersteMarke(p.brands);
  if (name === '') return '';
  return marke && !name.toLowerCase().includes(marke.toLowerCase())
    ? `${marke} ${name}`
    : name;
}

/** Bildet ein OFF-Rohprodukt auf einen Treffer ab (rein, ohne Netz – testbar). */
export function mapOffProdukt(p: OffProdukt): OffTreffer {
  const n = p.nutriments ?? {};
  // Gramm-Werte je 100 g in Dezigramm (×10) oder null, wenn nicht hinterlegt.
  const dg = (schluessel: string): number | null => {
    const wert = zahlOderNull(n[schluessel]);
    return wert === null ? null : Math.round(wert * 10);
  };
  return {
    code: (p.code ?? '').toString(),
    name: baueName(p),
    kcal_pro_100g: kcalPro100g(n),
    eiweiss_dg_pro_100g: dg('proteins_100g'),
    fett_dg_pro_100g: dg('fat_100g'),
    kohlenhydrate_dg_pro_100g: dg('carbohydrates_100g'),
    ballaststoffe_dg_pro_100g: dg('fiber_100g'),
    packung_gramm: packungGramm(p),
  };
}

/**
 * Ruft eine OFF-URL mit Timeout und User-Agent ab und liefert den geparsten
 * JSON-Body. `erlaubte404` laesst HTTP 404 durch (Produkt unbekannt) statt
 * badGateway zu werfen – der Aufrufer bekommt dann null.
 */
async function offAbruf<T>(
  url: string,
  erlaubte404 = false,
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: ctrl.signal,
    });
  } catch {
    throw badGateway(
      'Open Food Facts ist nicht erreichbar (Zeitüberschreitung oder kein Netz).',
    );
  } finally {
    clearTimeout(timer);
  }
  if (erlaubte404 && res.status === 404) return null;
  if (!res.ok) {
    const hinweis =
      res.status === 503
        ? ' (Dienst überlastet – bitte später erneut versuchen)'
        : '';
    throw badGateway(
      `Open Food Facts antwortete mit HTTP ${res.status}${hinweis}.`,
    );
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw badGateway('Open Food Facts lieferte keine gültige Antwort.');
  }
}

/**
 * Sucht bei Open Food Facts nach `query` und liefert bis zu 20 aufbereitete
 * Treffer (nur solche mit Namen). Wirft badGateway, wenn OFF nicht erreichbar
 * ist oder mit einem Fehlerstatus antwortet.
 */
export async function sucheOpenFoodFacts(query: string): Promise<OffTreffer[]> {
  const q = query.trim();
  if (q === '') return [];

  const params = new URLSearchParams({
    q,
    page_size: String(MAX_TREFFER),
    fields: 'code,product_name,brands,nutriments,quantity,product_quantity',
  });
  const data = await offAbruf<{ hits?: OffProdukt[]; products?: OffProdukt[] }>(
    `${OFF_SUCHE_URL}?${params.toString()}`,
  );
  // Search-a-licious liefert `hits`; der alte CGI-Endpunkt `products`.
  const produkte = Array.isArray(data?.hits)
    ? data.hits
    : Array.isArray(data?.products)
      ? data.products
      : [];
  return produkte.map(mapOffProdukt).filter((t) => t.name !== '');
}

/** Prueft einen Barcode/EAN: nur Ziffern, 8–14 Stellen (EAN-8 bis GTIN-14). */
export function istGueltigeEan(code: string): boolean {
  return /^\d{8,14}$/.test(code.trim());
}

/**
 * Ruft EIN Produkt per Barcode/EAN ueber die OFF-API v2 ab (praeziser als die
 * Namenssuche). Liefert null, wenn OFF das Produkt nicht kennt oder es keinen
 * Namen hat; wirft badRequest bei ungueltigem Barcode.
 */
export async function holeOffProdukt(code: string): Promise<OffTreffer | null> {
  const c = code.trim();
  if (!istGueltigeEan(c)) {
    throw badRequest('Barcode/EAN muss aus 8–14 Ziffern bestehen.');
  }
  const params = new URLSearchParams({
    fields: 'code,product_name,brands,nutriments,quantity,product_quantity',
  });
  const data = await offAbruf<{ status?: number; product?: OffProdukt }>(
    `${OFF_PRODUKT_URL}/${c}.json?${params.toString()}`,
    true, // 404 = Produkt unbekannt -> null statt Fehler
  );
  if (!data || data.status !== 1 || !data.product) return null;
  const t = mapOffProdukt(data.product);
  return t.name === '' ? null : t;
}
