/** Typisierte API-Aufrufe fuer die zeitversionierten Vorgaben (Ziele + Umsatz). */
import type { Vorgabe, VorgabeInput } from '../../shared/types.ts';
import { api } from './api.ts';

export const vorgabenApi = {
  /** Alle Vorgaben, neueste zuerst. */
  list: () => api.get<Vorgabe[]>('/vorgaben'),
  /** Vorgabe fuer einen Stichtag anlegen oder ersetzen. */
  save: (input: VorgabeInput) => api.put<Vorgabe>('/vorgaben', input),
  remove: (id: number) => api.delete<void>(`/vorgaben/${id}`),
};
