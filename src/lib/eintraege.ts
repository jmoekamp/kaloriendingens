/** Typisierte API-Aufrufe fuer die Tages-Eintraege (Mahlzeiten). */
import type { Eintrag, EintragInput } from '../../shared/types.ts';
import { api } from './api.ts';

export const eintraegeApi = {
  /** Eintraege eines Tages (YYYY-MM-DD). */
  fuerTag: (datum: string) => api.get<Eintrag[]>(`/eintraege?datum=${datum}`),
  /** Alle Tage mit Daten (absteigend). */
  tage: () => api.get<string[]>('/eintraege/tage'),
  create: (input: EintragInput) => api.post<Eintrag>('/eintraege', input),
  update: (id: number, input: EintragInput) =>
    api.put<Eintrag>(`/eintraege/${id}`, input),
  remove: (id: number) => api.delete<void>(`/eintraege/${id}`),
};
