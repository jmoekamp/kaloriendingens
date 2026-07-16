/** Typisierte API-Aufrufe fuer Bewegung/Aktivitaet. */
import type { Bewegung, BewegungInput } from '../../shared/types.ts';
import { api } from './api.ts';

export const bewegungApi = {
  fuerTag: (datum: string) => api.get<Bewegung[]>(`/bewegung?datum=${datum}`),
  create: (input: BewegungInput) => api.post<Bewegung>('/bewegung', input),
  update: (id: number, input: BewegungInput) =>
    api.put<Bewegung>(`/bewegung/${id}`, input),
  remove: (id: number) => api.delete<void>(`/bewegung/${id}`),
};
