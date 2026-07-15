import { randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Passwort-Hashing mit scrypt (Node-eingebaut, keine externe Abhaengigkeit).
 *
 * Format des gespeicherten Werts: "<saltHex>:<hashHex>". Salt ist pro Passwort
 * zufaellig; der Vergleich erfolgt zeitkonstant (timingSafeEqual).
 */

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPasswort(klartext: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = scryptSync(klartext, salt, KEY_BYTES);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function pruefePasswort(klartext: string, gespeichert: string): boolean {
  const [saltHex, hashHex] = gespeichert.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const erwartet = Buffer.from(hashHex, 'hex');
  const tatsaechlich = scryptSync(klartext, salt, erwartet.length);
  // timingSafeEqual verlangt gleiche Laenge – sonst ist es ohnehin falsch.
  return (
    erwartet.length === tatsaechlich.length &&
    timingSafeEqual(erwartet, tatsaechlich)
  );
}

/**
 * Asynchrone Variante fuer den (unauthentifizierten) Login: scryptSync wuerde
 * den Event-Loop blockieren – parallele Login-Requests koennten die ganze App
 * einfrieren. Hier laeuft scrypt im libuv-Threadpool.
 */
export function pruefePasswortAsync(
  klartext: string,
  gespeichert: string,
): Promise<boolean> {
  const [saltHex, hashHex] = gespeichert.split(':');
  if (!saltHex || !hashHex) return Promise.resolve(false);
  const salt = Buffer.from(saltHex, 'hex');
  const erwartet = Buffer.from(hashHex, 'hex');
  return new Promise((resolve, reject) => {
    scrypt(klartext, salt, erwartet.length, (err, tatsaechlich) => {
      if (err) return reject(err);
      resolve(
        erwartet.length === tatsaechlich.length &&
          timingSafeEqual(erwartet, tatsaechlich),
      );
    });
  });
}

/**
 * Fester Dummy-Hash fuer unbekannte Benutzernamen: Der Login vergleicht dann
 * trotzdem gegen diesen Wert, damit die Antwortzeit nicht verraet, ob ein
 * Benutzername existiert (Username-Enumeration per Timing).
 */
export const DUMMY_HASH = hashPasswort(randomBytes(32).toString('hex'));
