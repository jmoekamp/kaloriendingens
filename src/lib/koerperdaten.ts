/** Typisierte API-Aufrufe fuer die Koerperdaten (Gesamtumsatz-Berechnung). */
import type {
  KoerperdatenAnsicht,
  KoerperdatenInput,
} from '../../shared/types.ts';
import { api } from './api.ts';

export const koerperdatenApi = {
  get: () => api.get<KoerperdatenAnsicht>('/koerperdaten'),
  update: (input: KoerperdatenInput) =>
    api.put<KoerperdatenAnsicht>('/koerperdaten', input),
};
