import { Router } from 'express';
import type { EintragInput } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { badRequest } from '../errors.ts';
import {
  requireInteger,
  requireIsoDate,
  requireString,
  optionalBoolean,
  parseId,
} from '../validation.ts';
import {
  createEintrag,
  deleteEintrag,
  listEintraegeFuerTag,
  listTageMitDaten,
  markiereGegessenBis,
  setEintragGegessen,
  updateEintrag,
} from '../repos/eintraege.ts';
import { verschiebeDatum } from '../repos/auswertung.ts';

export const eintraegeRouter = Router();

/** Lokales Kalenderdatum (Server) im Format YYYY-MM-DD. */
function heuteIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}

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
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input = leseInput(body);
  // Neue Eintraege gelten per API/UI erst nach dem Ankreuzen als gegessen.
  input.gegessen = optionalBoolean(body, 'gegessen', false);
  res.status(201).json(createEintrag(getDb(), input));
});

/**
 * POST /api/eintraege/migriere-gegessen – markiert alle Eintraege bis
 * einschliesslich gestern als gegessen (einmalige Migration fuer Bestandsdaten).
 */
eintraegeRouter.post('/migriere-gegessen', (_req, res) => {
  const gestern = verschiebeDatum(heuteIso(), -1);
  const anzahl = markiereGegessenBis(getDb(), gestern);
  res.json({ anzahl, bis: gestern });
});

eintraegeRouter.put('/:id', (req, res) => {
  const id = parseId(req.params.id);
  const input = leseInput((req.body ?? {}) as Record<string, unknown>);
  res.json(updateEintrag(getDb(), id, input));
});

/** PATCH /api/eintraege/:id/gegessen – „gegessen"-Flag setzen ({ gegessen }). */
eintraegeRouter.patch('/:id/gegessen', (req, res) => {
  const id = parseId(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const gegessen = optionalBoolean(body, 'gegessen', true);
  res.json(setEintragGegessen(getDb(), id, gegessen));
});

eintraegeRouter.delete('/:id', (req, res) => {
  const id = parseId(req.params.id);
  deleteEintrag(getDb(), id);
  res.status(204).end();
});
