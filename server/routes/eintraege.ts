import { Router } from 'express';
import type { EintragInput } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { badRequest } from '../errors.ts';
import {
  requireInteger,
  requireIsoDate,
  requireString,
  parseId,
} from '../validation.ts';
import {
  createEintrag,
  deleteEintrag,
  listEintraegeFuerTag,
  listTageMitDaten,
  updateEintrag,
} from '../repos/eintraege.ts';

export const eintraegeRouter = Router();

function leseInput(body: Record<string, unknown>): EintragInput {
  return {
    datum: requireIsoDate(body, 'datum'),
    uhrzeit: requireString(body, 'uhrzeit'),
    lebensmittel_id: requireInteger(body, 'lebensmittel_id'),
    menge_gramm: requireInteger(body, 'menge_gramm'),
  };
}

/** GET /api/eintraege?datum=YYYY-MM-DD – Eintraege eines Tages. */
eintraegeRouter.get('/', (req, res) => {
  const datum = req.query.datum;
  if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    throw badRequest('Query-Parameter "datum" (YYYY-MM-DD) ist erforderlich.');
  }
  res.json(listEintraegeFuerTag(getDb(), datum));
});

/** GET /api/eintraege/tage – alle Tage mit Daten (absteigend). */
eintraegeRouter.get('/tage', (_req, res) => {
  res.json(listTageMitDaten(getDb()));
});

eintraegeRouter.post('/', (req, res) => {
  const input = leseInput((req.body ?? {}) as Record<string, unknown>);
  res.status(201).json(createEintrag(getDb(), input));
});

eintraegeRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const input = leseInput((req.body ?? {}) as Record<string, unknown>);
  res.json(updateEintrag(getDb(), id, input));
});

eintraegeRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  deleteEintrag(getDb(), id);
  res.status(204).end();
});
