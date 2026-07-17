import { Router } from 'express';
import type { GewichtInput } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { badRequest } from '../errors.ts';
import {
  optionalBoolean,
  requireInteger,
  requireIsoDate,
} from '../validation.ts';
import {
  deleteGewicht,
  getGewichtFuerTag,
  listGewichtImZeitraum,
  upsertGewicht,
} from '../repos/gewicht.ts';

export const gewichtRouter = Router();

function leseDatum(wert: unknown, feld: string): string {
  if (typeof wert !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) {
    throw badRequest(`Parameter "${feld}" (YYYY-MM-DD) ist erforderlich.`);
  }
  return wert;
}

/** Lokales Kalenderdatum (Server) im Format YYYY-MM-DD. */
function heuteIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}

/** GET /api/gewicht/verlauf?von=&bis= – Gewichtsverlauf im Zeitraum. */
gewichtRouter.get('/verlauf', (req, res) => {
  const von = leseDatum(req.query.von, 'von');
  const bis = leseDatum(req.query.bis, 'bis');
  if (von > bis) throw badRequest('"von" darf nicht nach "bis" liegen.');
  res.json(listGewichtImZeitraum(getDb(), von, bis, heuteIso()));
});

/** GET /api/gewicht?datum= – Tagesgewicht (oder null). */
gewichtRouter.get('/', (req, res) => {
  const datum = leseDatum(req.query.datum, 'datum');
  res.json(getGewichtFuerTag(getDb(), datum));
});

/** PUT /api/gewicht – Tagesgewicht setzen/ersetzen. */
gewichtRouter.put('/', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input: GewichtInput = {
    datum: requireIsoDate(body, 'datum'),
    gramm: requireInteger(body, 'gramm'),
    aus_trend: optionalBoolean(body, 'aus_trend', false),
  };
  res.json(upsertGewicht(getDb(), input));
});

/** DELETE /api/gewicht?datum= – Tagesgewicht entfernen. */
gewichtRouter.delete('/', (req, res) => {
  const datum = leseDatum(req.query.datum, 'datum');
  deleteGewicht(getDb(), datum);
  res.status(204).end();
});
