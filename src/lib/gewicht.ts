/** Typisierte API-Aufrufe fuer das Tagesgewicht. */
import type { Gewicht, GewichtPunkt } from '../../shared/types.ts';
import { api } from './api.ts';

export const gewichtApi = {
  /** Tagesgewicht (oder null, wenn nicht gesetzt). */
  fuerTag: (datum: string) =>
    api.get<Gewicht | null>(`/gewicht?datum=${datum}`),
  save: (datum: string, gramm: number, aus_trend: boolean) =>
    api.put<Gewicht>('/gewicht', { datum, gramm, aus_trend }),
  remove: (datum: string) => api.delete<void>(`/gewicht?datum=${datum}`),
  verlauf: (von: string, bis: string) =>
    api.get<GewichtPunkt[]>(`/gewicht/verlauf?von=${von}&bis=${bis}`),
};
