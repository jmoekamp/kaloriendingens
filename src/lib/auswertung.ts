/** Typisierte API-Aufrufe fuer die Auswertungen (Tag, Verlauf, Defizit). */
import type {
  DefizitReport,
  TagesAuswertung,
  TagesZusammenfassung,
  Verlauf,
} from '../../shared/types.ts';
import { api } from './api.ts';

export const auswertungApi = {
  /** Tagesauswertung; ohne Datum liefert das Backend „heute". */
  tag: (datum?: string) =>
    api.get<TagesAuswertung>(
      datum ? `/auswertung/tag?datum=${datum}` : '/auswertung/tag',
    ),
  /** Tagessummen im Zeitraum (Default im Backend: letzte 30 Tage). */
  verlauf: (von?: string, bis?: string) => {
    const q = new URLSearchParams();
    if (von) q.set('von', von);
    if (bis) q.set('bis', bis);
    const s = q.toString();
    return api.get<Verlauf>(`/auswertung/verlauf${s ? `?${s}` : ''}`);
  },
  letzteTage: (n = 7) =>
    api.get<TagesZusammenfassung[]>(`/auswertung/letzte-tage?n=${n}`),
  defizit: () => api.get<DefizitReport>('/auswertung/defizit'),
};
