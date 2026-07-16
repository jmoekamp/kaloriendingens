import { Router } from 'express';
import type { BewegungInput } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { badRequest } from '../errors.ts';
import {
  requireInteger,
  requireIsoDate,
  requireString,
  parseId,
} from '../validation.ts';
import {
  createBewegung,
  deleteBewegung,
  listBewegungFuerTag,
  updateBewegung,
} from '../repos/bewegung.ts';

export const bewegungRouter = Router();

function leseInput(body: Record<string, unknown>): BewegungInput {
  return {
    datum: requireIsoDate(body, 'datum'),
    uhrzeit: requireString(body, 'uhrzeit'),
    beschreibung: requireString(body, 'beschreibung'),
    kcal: requireInteger(body, 'kcal'),
  };
}

/** GET /api/bewegung?datum=YYYY-MM-DD – Bewegungen eines Tages. */
bewegungRouter.get('/', (req, res) => {
  const datum = req.query.datum;
  if (typeof datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    throw badRequest('Query-Parameter "datum" (YYYY-MM-DD) ist erforderlich.');
  }
  res.json(listBewegungFuerTag(getDb(), datum));
});

bewegungRouter.post('/', (req, res) => {
  const input = leseInput((req.body ?? {}) as Record<string, unknown>);
  res.status(201).json(createBewegung(getDb(), input));
});

bewegungRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const input = leseInput((req.body ?? {}) as Record<string, unknown>);
  res.json(updateBewegung(getDb(), id, input));
});

bewegungRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  deleteBewegung(getDb(), id);
  res.status(204).end();
});
