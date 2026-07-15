/** Typisierte API-Aufrufe fuer die Einstellungen (Ziele + Gesamtumsatz). */
import type { Einstellungen, EinstellungenInput } from '../../shared/types.ts';
import { api } from './api.ts';

export const einstellungenApi = {
  get: () => api.get<Einstellungen>('/einstellungen'),
  update: (input: EinstellungenInput) =>
    api.put<Einstellungen>('/einstellungen', input),
};
