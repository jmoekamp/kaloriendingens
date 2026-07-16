import { Router } from 'express';
import type { AbnehmzielInput } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { requireInteger, requireIsoDate, parseId } from '../validation.ts';
import {
  deleteAbnehmziel,
  listAbnehmziele,
  upsertAbnehmziel,
} from '../repos/abnehmziele.ts';

export const abnehmzieleRouter = Router();

abnehmzieleRouter.get('/', (_req, res) => {
  res.json(listAbnehmziele(getDb()));
});

abnehmzieleRouter.put('/', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input: AbnehmzielInput = {
    gueltig_ab: requireIsoDate(body, 'gueltig_ab'),
    ziel_gramm: requireInteger(body, 'ziel_gramm'),
  };
  res.json(upsertAbnehmziel(getDb(), input));
});

abnehmzieleRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  deleteAbnehmziel(getDb(), id);
  res.status(204).end();
});
