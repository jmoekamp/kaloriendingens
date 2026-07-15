import { Router } from 'express';
import type { EinstellungenInput, ZielTyp } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { badRequest } from '../errors.ts';
import { optionalNonNegativeInteger } from '../validation.ts';
import {
  getEinstellungen,
  updateEinstellungen,
} from '../repos/einstellungen.ts';

export const einstellungenRouter = Router();

function optionalZielTyp(
  body: Record<string, unknown>,
  feld: string,
): ZielTyp | undefined {
  const wert = body[feld];
  if (wert === undefined || wert === null || wert === '') return undefined;
  if (wert !== 'min' && wert !== 'max') {
    throw badRequest(`Feld "${feld}" muss "min" oder "max" sein.`);
  }
  return wert;
}

einstellungenRouter.get('/', (_req, res) => {
  res.json(getEinstellungen(getDb()));
});

einstellungenRouter.put('/', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input: EinstellungenInput = {};

  const kcalZiel = optionalNonNegativeInteger(body, 'kcal_ziel');
  if (kcalZiel !== undefined) input.kcal_ziel = kcalZiel;
  const kcalTyp = optionalZielTyp(body, 'kcal_ziel_typ');
  if (kcalTyp !== undefined) input.kcal_ziel_typ = kcalTyp;

  const eiweissZiel = optionalNonNegativeInteger(body, 'eiweiss_ziel_dg');
  if (eiweissZiel !== undefined) input.eiweiss_ziel_dg = eiweissZiel;
  const eiweissTyp = optionalZielTyp(body, 'eiweiss_ziel_typ');
  if (eiweissTyp !== undefined) input.eiweiss_ziel_typ = eiweissTyp;

  const gesamtumsatz = optionalNonNegativeInteger(body, 'gesamtumsatz');
  if (gesamtumsatz !== undefined) input.gesamtumsatz = gesamtumsatz;

  res.json(updateEinstellungen(getDb(), input));
});
