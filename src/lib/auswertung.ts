/** Typisierte API-Aufrufe fuer die Auswertungen (Tag, Verlauf, Defizit). */
import type {
  AbnehmFortschritt,
  Abnehmkennzahlen,
  AllzeitTag,
  DetailTag,
  DefizitReport,
  DefizitTag,
  KalorienTag,
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
  /** Tagesdefizit je Tag (fuer die Gewichtsprognose). */
  defizitVerlauf: (von?: string, bis?: string) => {
    const q = new URLSearchParams();
    if (von) q.set('von', von);
    if (bis) q.set('bis', bis);
    const s = q.toString();
    return api.get<DefizitTag[]>(
      `/auswertung/defizit-verlauf${s ? `?${s}` : ''}`,
    );
  },
  /** Umsatz/Aufnahme je Tag (fuer das Kalorien-Diagramm). */
  kalorienVerlauf: (von?: string, bis?: string) => {
    const q = new URLSearchParams();
    if (von) q.set('von', von);
    if (bis) q.set('bis', bis);
    const s = q.toString();
    return api.get<KalorienTag[]>(
      `/auswertung/kalorien-verlauf${s ? `?${s}` : ''}`,
    );
  },
  letzteTage: (n = 7) =>
    api.get<TagesZusammenfassung[]>(`/auswertung/letzte-tage?n=${n}`),
  defizit: () => api.get<DefizitReport>('/auswertung/defizit'),
  abnehmfortschritt: () =>
    api.get<AbnehmFortschritt>('/auswertung/abnehmfortschritt'),
  abnehmkennzahlen: () =>
    api.get<Abnehmkennzahlen>('/auswertung/abnehmkennzahlen'),
  /** Allzeitreport: eine Zeile je Tag von der ersten Erfassung bis heute. */
  allzeit: () => api.get<AllzeitTag[]>('/auswertung/allzeit'),
  /** Detailreport: Allzeitreport plus Mahlzeiten und Bewegung je Tag. */
  detail: () => api.get<DetailTag[]>('/auswertung/detail'),
};
