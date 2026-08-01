import { describe, it, expect } from 'vitest';
import { AppError } from '../server/errors.ts';
import {
  PASSWORT_MINDESTLAENGE,
  requireNeuesPasswort,
} from '../server/validation.ts';

describe('Passwort-Mindestlaenge (neue Passwoerter)', () => {
  it('akzeptiert Passwoerter ab der Mindestlaenge', () => {
    expect(requireNeuesPasswort({ p: 'achtzeichen!' }, 'p')).toBe(
      'achtzeichen!',
    );
    // Genau die Mindestlaenge ist erlaubt; Leerzeichen zaehlen mit.
    const genau = 'a b c d '.slice(0, PASSWORT_MINDESTLAENGE);
    expect(genau).toHaveLength(PASSWORT_MINDESTLAENGE);
    expect(requireNeuesPasswort({ p: genau }, 'p')).toBe(genau);
  });

  it('weist zu kurze, leere und fehlende Passwoerter ab', () => {
    expect(() => requireNeuesPasswort({ p: 'kurz123' }, 'p')).toThrow(AppError);
    expect(() => requireNeuesPasswort({ p: '' }, 'p')).toThrow(AppError);
    expect(() => requireNeuesPasswort({}, 'p')).toThrow(AppError);
    expect(() => requireNeuesPasswort({ p: 12345678 }, 'p')).toThrow(AppError);
  });

  it('trimmt NICHT (Leerzeichen duerfen Teil des Passworts sein)', () => {
    expect(requireNeuesPasswort({ p: '  sechs  ' }, 'p')).toBe('  sechs  ');
  });
});
