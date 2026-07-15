/**
 * Kleines In-Memory-Rate-Limit fuer den Login (Brute-Force-Bremse).
 *
 * Pro Schluessel (Client-IP) sind hoechstens MAX_VERSUCHE FEHLGESCHLAGENE
 * Versuche innerhalb des gleitenden Fensters erlaubt; ein erfolgreicher Login
 * setzt den Zaehler zurueck. Bewusst ohne externe Abhaengigkeit und ohne
 * Persistenz – ein Neustart leert die Liste, was fuer die lokale
 * Einsatzumgebung (Heimnetz, wenige Nutzer) voellig ausreicht.
 */

const FENSTER_MS = 60_000;
const MAX_VERSUCHE = 5;

const fehlversuche = new Map<string, number[]>();

function aktuelleVersuche(schluessel: string, jetztMs: number): number[] {
  const liste = (fehlversuche.get(schluessel) ?? []).filter(
    (t) => jetztMs - t < FENSTER_MS,
  );
  fehlversuche.set(schluessel, liste);
  return liste;
}

/** Ist ein weiterer Login-Versuch fuer diesen Schluessel erlaubt? */
export function loginErlaubt(
  schluessel: string,
  jetztMs = Date.now(),
): boolean {
  return aktuelleVersuche(schluessel, jetztMs).length < MAX_VERSUCHE;
}

/** Fehlgeschlagenen Versuch registrieren. */
export function loginFehlgeschlagen(
  schluessel: string,
  jetztMs = Date.now(),
): void {
  aktuelleVersuche(schluessel, jetztMs).push(jetztMs);
}

/** Erfolgreicher Login: Zaehler fuer diesen Schluessel zuruecksetzen. */
export function loginErfolgreich(schluessel: string): void {
  fehlversuche.delete(schluessel);
}

/** Nur fuer Tests: kompletten Zustand leeren. */
export function ratelimitZuruecksetzen(): void {
  fehlversuche.clear();
}
