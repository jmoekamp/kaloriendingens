import { describe, it, expect, beforeEach } from 'vitest';
import {
  DUMMY_HASH,
  hashPasswort,
  pruefePasswort,
  pruefePasswortAsync,
} from '../server/auth/passwoerter.ts';
import {
  loginErfolgreich,
  loginErlaubt,
  loginFehlgeschlagen,
  ratelimitZuruecksetzen,
} from '../server/auth/ratelimit.ts';

describe('Passwort-Hashing', () => {
  it('hasht im Format salt:hash und verifiziert korrekt', () => {
    const gespeichert = hashPasswort('geheim123');
    expect(gespeichert).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(pruefePasswort('geheim123', gespeichert)).toBe(true);
  });

  it('lehnt falsches Passwort ab', () => {
    const gespeichert = hashPasswort('geheim123');
    expect(pruefePasswort('falsch', gespeichert)).toBe(false);
  });

  it('verwendet pro Hash ein anderes Salt', () => {
    expect(hashPasswort('x')).not.toBe(hashPasswort('x'));
  });

  it('lehnt kaputt formatierte Werte ab', () => {
    expect(pruefePasswort('x', 'keinDoppelpunkt')).toBe(false);
    expect(pruefePasswort('x', '')).toBe(false);
  });
});

describe('Passwort-Pruefung (async)', () => {
  it('verhaelt sich wie die synchrone Variante', async () => {
    const gespeichert = hashPasswort('geheim123');
    await expect(pruefePasswortAsync('geheim123', gespeichert)).resolves.toBe(
      true,
    );
    await expect(pruefePasswortAsync('falsch', gespeichert)).resolves.toBe(
      false,
    );
    await expect(pruefePasswortAsync('x', 'kaputt')).resolves.toBe(false);
  });

  it('Dummy-Hash ist gueltig formatiert und passt zu keinem Passwort', async () => {
    expect(DUMMY_HASH).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    await expect(pruefePasswortAsync('admin', DUMMY_HASH)).resolves.toBe(false);
  });
});

describe('Login-Rate-Limit', () => {
  beforeEach(() => ratelimitZuruecksetzen());

  it('erlaubt 5 Fehlversuche pro Minute, blockt den sechsten', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(loginErlaubt('ip1', t0 + i)).toBe(true);
      loginFehlgeschlagen('ip1', t0 + i);
    }
    expect(loginErlaubt('ip1', t0 + 10)).toBe(false);
    // Anderer Schluessel bleibt unbeeinflusst.
    expect(loginErlaubt('ip2', t0 + 10)).toBe(true);
  });

  it('gibt nach Ablauf des Fensters wieder frei', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) loginFehlgeschlagen('ip1', t0);
    expect(loginErlaubt('ip1', t0 + 1)).toBe(false);
    expect(loginErlaubt('ip1', t0 + 60_001)).toBe(true);
  });

  it('erfolgreicher Login setzt den Zaehler zurueck', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) loginFehlgeschlagen('ip1', t0);
    expect(loginErlaubt('ip1', t0 + 1)).toBe(false);
    loginErfolgreich('ip1');
    expect(loginErlaubt('ip1', t0 + 2)).toBe(true);
  });
});
