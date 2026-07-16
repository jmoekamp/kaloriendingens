import { Router } from 'express';
import { getDb } from '../db/index.ts';
import { badRequest } from '../errors.ts';
import {
  getAbnehmFortschritt,
  getDefizitReport,
  getLetzteTage,
  getTagesAuswertung,
  getVerlauf,
} from '../repos/auswertung.ts';

export const auswertungRouter = Router();

/** Lokales Kalenderdatum (Server) im Format YYYY-MM-DD. */
function heuteIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}

function leseDatum(wert: unknown, feld: string): string {
  if (typeof wert !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) {
    throw badRequest(`Parameter "${feld}" (YYYY-MM-DD) ist erforderlich.`);
  }
  return wert;
}

/** GET /api/auswertung/tag?datum= – Tagesauswertung (Default: heute). */
auswertungRouter.get('/tag', (req, res) => {
  const roh = req.query.datum;
  const datum = roh === undefined ? heuteIso() : leseDatum(roh, 'datum');
  res.json(getTagesAuswertung(getDb(), datum));
});

/** GET /api/auswertung/verlauf?von=&bis= – Tagessummen (Default: letzte 30 Tage). */
auswertungRouter.get('/verlauf', (req, res) => {
  const heute = heuteIso();
  const bis =
    req.query.bis === undefined ? heute : leseDatum(req.query.bis, 'bis');
  const von =
    req.query.von === undefined
      ? // Default: 30 Tage inkl. heute
        new Date(new Date(`${bis}T00:00:00Z`).getTime() - 29 * 86400000)
          .toISOString()
          .slice(0, 10)
      : leseDatum(req.query.von, 'von');
  if (von > bis) throw badRequest('"von" darf nicht nach "bis" liegen.');
  res.json(getVerlauf(getDb(), von, bis, heute));
});

/** GET /api/auswertung/letzte-tage?n=7 – die letzten n Kalendertage. */
auswertungRouter.get('/letzte-tage', (req, res) => {
  const roh = req.query.n;
  let n = 7;
  if (roh !== undefined) {
    n = Number(roh);
    if (!Number.isInteger(n) || n < 1 || n > 366) {
      throw badRequest('Parameter "n" muss zwischen 1 und 366 liegen.');
    }
  }
  res.json(getLetzteTage(getDb(), heuteIso(), n));
});

/** GET /api/auswertung/defizit – Kaloriendefizit (Tag/Woche/Monat/gesamt). */
auswertungRouter.get('/defizit', (_req, res) => {
  res.json(getDefizitReport(getDb(), heuteIso()));
});

/** GET /api/auswertung/abnehmfortschritt – Fortschritt des aktiven Abnehmziels. */
auswertungRouter.get('/abnehmfortschritt', (_req, res) => {
  res.json(getAbnehmFortschritt(getDb(), heuteIso()));
});
