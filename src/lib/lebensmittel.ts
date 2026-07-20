/** Typisierte API-Aufrufe fuer die Lebensmittel-Stammdaten. */
import type {
  Lebensmittel,
  LebensmittelInput,
  OffTreffer,
} from '../../shared/types.ts';
import { api } from './api.ts';

export const lebensmittelApi = {
  list: () => api.get<Lebensmittel[]>('/lebensmittel'),
  create: (input: LebensmittelInput) =>
    api.post<Lebensmittel>('/lebensmittel', input),
  update: (id: number, input: LebensmittelInput) =>
    api.put<Lebensmittel>(`/lebensmittel/${id}`, input),
  remove: (id: number) => api.delete<void>(`/lebensmittel/${id}`),
  /** Namenssuche bei Open Food Facts (externer Dienst, per Server-Proxy). */
  offSuche: (q: string) =>
    api.get<OffTreffer[]>(`/lebensmittel/off-suche?q=${encodeURIComponent(q)}`),
};
