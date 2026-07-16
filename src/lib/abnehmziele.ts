/** Typisierte API-Aufrufe fuer die Abnehmziele. */
import type { Abnehmziel, AbnehmzielInput } from '../../shared/types.ts';
import { api } from './api.ts';

export const abnehmzieleApi = {
  list: () => api.get<Abnehmziel[]>('/abnehmziele'),
  save: (input: AbnehmzielInput) => api.put<Abnehmziel>('/abnehmziele', input),
  remove: (id: number) => api.delete<void>(`/abnehmziele/${id}`),
};
