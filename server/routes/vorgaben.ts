import { Router } from 'express';
import type { VorgabeInput, ZielTyp } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { badRequest } from '../errors.ts';
import {
  optionalNonNegativeInteger,
  parseId,
  requireIsoDate,
} from '../validation.ts';
import {
  deleteVorgabe,
  listVorgaben,
  upsertVorgabe,
} from '../repos/vorgaben.ts';

export const vorgabenRouter = Router();

function zielTyp(
  body: Record<string, unknown>,
  feld: string,
  def: ZielTyp,
): ZielTyp {
  const wert = body[feld];
  if (wert === undefined || wert === null || wert === '') return def;
  if (wert !== 'min' && wert !== 'max') {
    throw badRequest(`Feld "${feld}" muss "min" oder "max" sein.`);
  }
  return wert;
}

vorgabenRouter.get('/', (_req, res) => {
  res.json(listVorgaben(getDb()));
});

vorgabenRouter.put('/', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input: VorgabeInput = {
    gueltig_ab: requireIsoDate(body, 'gueltig_ab'),
    kcal_ziel: optionalNonNegativeInteger(body, 'kcal_ziel') ?? 0,
    kcal_ziel_typ: zielTyp(body, 'kcal_ziel_typ', 'max'),
    eiweiss_ziel_dg: optionalNonNegativeInteger(body, 'eiweiss_ziel_dg') ?? 0,
    eiweiss_ziel_typ: zielTyp(body, 'eiweiss_ziel_typ', 'min'),
    gesamtumsatz: optionalNonNegativeInteger(body, 'gesamtumsatz') ?? 0,
  };
  res.json(upsertVorgabe(getDb(), input));
});

vorgabenRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  deleteVorgabe(getDb(), id);
  res.status(204).end();
});
