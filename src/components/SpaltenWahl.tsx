import { useState, type ReactNode } from 'react';
import { Checkbox } from './ui.tsx';

/**
 * Spalten-Sichtbarkeit fuer Tabellen: ueber jeder Tabelle sitzt ein per Default
 * EINGEKLAPPTES <details> mit einer Checkbox je Spalte. Standard: alle Spalten
 * sichtbar. Die Auswahl wird je Tabelle (id) in localStorage gemerkt, damit sie
 * Seitenwechsel und Neuladen ueberlebt; gespeichert werden nur die
 * AUSGEBLENDETEN Spalten (leer = Default). Aktions-Spalten (Buttons) laufen
 * bewusst nicht ueber diesen Mechanismus und bleiben immer sichtbar.
 */

export interface SpalteDef {
  key: string;
  label: string;
}

const PREFIX = 'spalten.';

function lade(id: string): Set<string> {
  try {
    const roh = localStorage.getItem(PREFIX + id);
    if (!roh) return new Set();
    const arr: unknown = JSON.parse(roh);
    return new Set(
      Array.isArray(arr)
        ? arr.filter((x): x is string => typeof x === 'string')
        : [],
    );
  } catch {
    return new Set();
  }
}

function speichere(id: string, versteckt: Set<string>): void {
  try {
    if (versteckt.size === 0) localStorage.removeItem(PREFIX + id);
    else localStorage.setItem(PREFIX + id, JSON.stringify([...versteckt]));
  } catch {
    // localStorage nicht verfuegbar -> Auswahl gilt nur fuer diese Sitzung.
  }
}

export interface SpaltenWahl {
  /** Ist die Spalte mit diesem Schluessel sichtbar? */
  sichtbar: (key: string) => boolean;
  /** Das einklappbare Auswahl-Element – direkt ueber der Tabelle rendern. */
  auswahl: ReactNode;
  /** Anzahl der sichtbaren unter den uebergebenen Schluesseln (fuer colSpan). */
  anzahlSichtbar: (keys: string[]) => number;
}

/** Hook: Spalten-Sichtbarkeit je Tabelle (id = stabiler Speicher-Schluessel). */
export function useSpaltenWahl(id: string, spalten: SpalteDef[]): SpaltenWahl {
  const [versteckt, setVersteckt] = useState<Set<string>>(() => lade(id));

  const sichtbar = (key: string) => !versteckt.has(key);

  function umschalten(key: string, zeigen: boolean) {
    setVersteckt((vorher) => {
      const neu = new Set(vorher);
      if (zeigen) neu.delete(key);
      else neu.add(key);
      speichere(id, neu);
      return neu;
    });
  }

  const auswahl = (
    <details className="mb-2">
      <summary className="cursor-pointer text-xs text-text-muted hover:text-text">
        Spalten ein-/ausblenden
        {versteckt.size > 0 && ` (${versteckt.size} ausgeblendet)`}
      </summary>
      <div className="mb-1 mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {spalten.map((s) => (
          <Checkbox
            key={s.key}
            label={s.label}
            checked={sichtbar(s.key)}
            onChange={(c) => umschalten(s.key, c)}
          />
        ))}
      </div>
    </details>
  );

  return {
    sichtbar,
    auswahl,
    anzahlSichtbar: (keys) => keys.filter(sichtbar).length,
  };
}
