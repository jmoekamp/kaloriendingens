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
import { holeOffProdukt, sucheOpenFoodFacts } from '../off.ts';
import { notFound } from '../errors.ts';

export const lebensmittelRouter = Router();

/**
 * GET /api/lebensmittel/off-suche?q= – Namenssuche bei Open Food Facts
 * (externer Dienst, per Server-Proxy). Muss VOR „/:id" stehen.
 */
lebensmittelRouter.get('/off-suche', (req, res, next) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  sucheOpenFoodFacts(q)
    .then((treffer) => res.json(treffer))
    .catch(next);
});

/**
 * GET /api/lebensmittel/off-produkt?code= – Einzelabruf per Barcode/EAN bei
 * Open Food Facts (externer Dienst, per Server-Proxy). Muss VOR „/:id" stehen.
 */
lebensmittelRouter.get('/off-produkt', (req, res, next) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  holeOffProdukt(code)
    .then((t) => {
      if (t === null) {
        throw notFound(
          'Open Food Facts kennt kein Produkt mit diesem Barcode.',
        );
      }
      res.json(t);
    })
    .catch(next);
});

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
