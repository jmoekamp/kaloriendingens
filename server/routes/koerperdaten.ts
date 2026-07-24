import { Router } from 'express';
import type {
  Koerperdaten,
  KoerperdatenAnsicht,
  KoerperdatenInput,
} from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { badRequest } from '../errors.ts';
import { optionalNonNegativeInteger } from '../validation.ts';
import { getKoerperdaten, updateKoerperdaten } from '../repos/koerperdaten.ts';
import { alleGewichteAsc, letztesGewichtGesamt } from '../repos/gewicht.ts';
import { gesamtumsatzFuerTag } from '../repos/auswertung.ts';

export const koerperdatenRouter = Router();

/** Lokales Kalenderdatum (Server) im Format YYYY-MM-DD. */
function heuteIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const t = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${t}`;
}

/** Ergaenzt die Koerperdaten um aktuelles Gewicht/Fett und heutigen Umsatz. */
function toAnsicht(kd: Koerperdaten): KoerperdatenAnsicht {
  const heute = heuteIso();
  const g = letztesGewichtGesamt(getDb(), heute);
  // Letzter erfasster Fettanteil bis heute (Carry-forward wie in der Auswertung).
  const fette = alleGewichteAsc(getDb()).filter(
    (w) => w.fett_promille !== null && w.datum <= heute,
  );
  return {
    ...kd,
    aktuelles_gewicht_gramm: g ? g.gramm : null,
    aktueller_fett_promille:
      fette.length > 0 ? fette[fette.length - 1].fett_promille : null,
    gesamtumsatz_heute: gesamtumsatzFuerTag(getDb(), heute),
  };
}

koerperdatenRouter.get('/', (_req, res) => {
  res.json(toAnsicht(getKoerperdaten(getDb())));
});

koerperdatenRouter.put('/', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const input: KoerperdatenInput = {};

  const groesse = optionalNonNegativeInteger(body, 'groesse_cm');
  if (groesse !== undefined) input.groesse_cm = groesse;

  if (body.geschlecht !== undefined) {
    if (body.geschlecht !== 'm' && body.geschlecht !== 'w') {
      throw badRequest('Feld "geschlecht" muss "m" oder "w" sein.');
    }
    input.geschlecht = body.geschlecht;
  }

  const geburtsjahr = optionalNonNegativeInteger(body, 'geburtsjahr');
  if (geburtsjahr !== undefined) {
    if (geburtsjahr !== 0 && (geburtsjahr < 1900 || geburtsjahr > 2100)) {
      throw badRequest('Feld "geburtsjahr" ist unplausibel.');
    }
    input.geburtsjahr = geburtsjahr;
  }

  if (body.aktivitaetsfaktor !== undefined) {
    const f = Number(body.aktivitaetsfaktor);
    if (!Number.isFinite(f) || f < 1 || f > 2.5) {
      throw badRequest(
        'Feld "aktivitaetsfaktor" muss zwischen 1 und 2,5 liegen.',
      );
    }
    input.aktivitaetsfaktor = f;
  }

  if (body.modus !== undefined) {
    if (body.modus !== 'manuell' && body.modus !== 'berechnet') {
      throw badRequest('Feld "modus" muss "manuell" oder "berechnet" sein.');
    }
    input.modus = body.modus;
  }

  if (body.formel !== undefined) {
    if (body.formel !== 'mifflin' && body.formel !== 'katch') {
      throw badRequest('Feld "formel" muss "mifflin" oder "katch" sein.');
    }
    input.formel = body.formel;
  }

  res.json(toAnsicht(updateKoerperdaten(getDb(), input)));
});
