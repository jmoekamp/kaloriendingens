import { Router } from 'express';
import type { LebensmittelInput } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import {
  optionalIntegerOrNull,
  requireInteger,
  requireString,
  parseId,
} from '../validation.ts';
import {
  createLebensmittel,
  deleteLebensmittel,
  listLebensmittel,
  updateLebensmittel,
} from '../repos/lebensmittel.ts';

export const lebensmittelRouter = Router();

function leseInput(body: Record<string, unknown>): LebensmittelInput {
  return {
    name: requireString(body, 'name'),
    kcal_pro_100g: requireInteger(body, 'kcal_pro_100g'),
    eiweiss_dg_pro_100g: requireInteger(body, 'eiweiss_dg_pro_100g'),
    packung_gramm: optionalIntegerOrNull(body, 'packung_gramm'),
  };
}

lebensmittelRouter.get('/', (_req, res) => {
  res.json(listLebensmittel(getDb()));
});

lebensmittelRouter.post('/', (req, res) => {
  const input = leseInput((req.body ?? {}) as Record<string, unknown>);
  res.status(201).json(createLebensmittel(getDb(), input));
});

lebensmittelRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const input = leseInput((req.body ?? {}) as Record<string, unknown>);
  res.json(updateLebensmittel(getDb(), id, input));
});

lebensmittelRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  deleteLebensmittel(getDb(), id);
  res.status(204).end();
});
