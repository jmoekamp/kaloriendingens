/**
 * Anbindung an Open Food Facts (OFF) – der EINZIGE Auszenkontakt der App und
 * eine bewusste Ausnahme vom „alles bleibt lokal"-Grundsatz (nur auf explizite
 * Nutzer-Suche, ausschliesslich lesend, per Server-Proxy). Der Browser spricht
 * nur mit der App; der Server ruft OFF ab und liefert bereits aufbereitete
 * Treffer (Name, kcal/100 g, Eiweiss/100 g, Packungsgroesse) zurueck.
 */
import type { OffTreffer } from '../shared/types.ts';
import { badGateway } from './errors.ts';

// Neuer Search-a-licious-Dienst von OFF. Der alte cgi/search.pl-Endpunkt ist
// stark rate-limitiert und liefert oft HTTP 503; dieser Dienst ist robuster.
const OFF_SUCHE_URL = 'https://search.openfoodfacts.org/search';
// OFF bittet um einen identifizierenden User-Agent.
const USER_AGENT = 'cal-o-matic/1.0 (self-hosted; lokale Naehrwertverwaltung)';
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
  const eiweiss = zahlOderNull(n['proteins_100g']);
  return {
    code: (p.code ?? '').toString(),
    name: baueName(p),
    kcal_pro_100g: kcalPro100g(n),
    eiweiss_dg_pro_100g: eiweiss === null ? null : Math.round(eiweiss * 10),
    packung_gramm: packungGramm(p),
  };
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${OFF_SUCHE_URL}?${params.toString()}`, {
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
  if (!res.ok) {
    const hinweis =
      res.status === 503
        ? ' (Dienst überlastet – bitte später erneut versuchen)'
        : '';
    throw badGateway(
      `Open Food Facts antwortete mit HTTP ${res.status}${hinweis}.`,
    );
  }

  let data: { hits?: OffProdukt[]; products?: OffProdukt[] };
  try {
    data = (await res.json()) as {
      hits?: OffProdukt[];
      products?: OffProdukt[];
    };
  } catch {
    throw badGateway('Open Food Facts lieferte keine gültige Antwort.');
  }
  // Search-a-licious liefert `hits`; der alte CGI-Endpunkt `products`.
  const produkte = Array.isArray(data.hits)
    ? data.hits
    : Array.isArray(data.products)
      ? data.products
      : [];
  return produkte.map(mapOffProdukt).filter((t) => t.name !== '');
}
