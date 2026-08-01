import { Router } from 'express';
import type { AuthUser } from '../../shared/types.ts';
import { getDb } from '../db/index.ts';
import { badRequest, tooManyRequests, unauthorized } from '../errors.ts';
import { DUMMY_HASH, pruefePasswortAsync } from '../auth/passwoerter.ts';
import {
  loginErfolgreich,
  loginErlaubt,
  loginFehlgeschlagen,
} from '../auth/ratelimit.ts';
import {
  type AuthRequest,
  loescheSessionCookie,
  leseCookie,
  COOKIE_NAME,
  setzeSessionCookie,
} from '../auth/middleware.ts';
import {
  createSession,
  deleteSession,
  deleteSessionsForUser,
} from '../repos/sessions.ts';
import { getUserById, getUserByUsername, setPasswort } from '../repos/users.ts';
import { requireNeuesPasswort } from '../validation.ts';

/** Liest ein Pflicht-Passwortfeld (NICHT getrimmt – Leerzeichen koennen Teil sein). */
function requirePasswort(body: Record<string, unknown>, feld: string): string {
  const wert = body[feld];
  if (typeof wert !== 'string' || wert === '') {
    throw badRequest(`Feld "${feld}" ist erforderlich.`);
  }
  return wert;
}

function toAuthUser(user: {
  id: number;
  username: string;
  mandant_id: number;
}): AuthUser {
  return {
    id: user.id,
    username: user.username,
    mandant_id: user.mandant_id,
    ist_admin: user.mandant_id === 0,
  };
}

// Oeffentliche Routen (vor der Auth-Middleware montiert).
export const authPublicRouter = Router();

authPublicRouter.post('/login', async (req, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const username = requirePasswort(body, 'username');
    const passwort = requirePasswort(body, 'passwort');

    // Brute-Force-Bremse pro Client-IP (nur Fehlversuche zaehlen).
    const limitSchluessel = req.ip ?? 'unbekannt';
    if (!loginErlaubt(limitSchluessel)) {
      throw tooManyRequests(
        'Zu viele fehlgeschlagene Anmeldeversuche – bitte kurz warten.',
      );
    }

    const user = getUserByUsername(getDb(), username.trim());
    // Bei unbekanntem Nutzer gegen einen Dummy-Hash pruefen, damit die
    // Antwortzeit nicht verraet, ob der Benutzername existiert.
    const ok = await pruefePasswortAsync(
      passwort,
      user?.password_hash ?? DUMMY_HASH,
    );
    if (!user || !ok) {
      loginFehlgeschlagen(limitSchluessel);
      throw unauthorized('Benutzername oder Passwort ist falsch.');
    }
    loginErfolgreich(limitSchluessel);

    const token = createSession(getDb(), user.id);
    setzeSessionCookie(res, token);
    res.json(toAuthUser(user));
  } catch (e) {
    next(e);
  }
});

authPublicRouter.post('/logout', (req, res) => {
  const token = leseCookie(req, COOKIE_NAME);
  if (token) deleteSession(getDb(), token);
  loescheSessionCookie(res);
  res.status(204).end();
});

// Routen fuer angemeldete Nutzer (hinter der Auth-Middleware montiert).
export const authAuthedRouter = Router();

authAuthedRouter.get('/me', (req: AuthRequest, res) => {
  const user = req.user!;
  res.json(
    toAuthUser({
      id: user.userId,
      username: user.username,
      mandant_id: user.mandantId,
    }),
  );
});

authAuthedRouter.post('/passwort', async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as Record<string, unknown>;
    const altesPasswort = requirePasswort(body, 'altes_passwort');
    // Nur das NEUE Passwort unterliegt der Mindestlaenge (alte Passwoerter
    // koennen aus der Zeit vor der Regel stammen).
    const neuesPasswort = requireNeuesPasswort(body, 'neues_passwort');

    const user = getUserById(getDb(), req.user!.userId);
    if (
      !user ||
      !(await pruefePasswortAsync(altesPasswort, user.password_hash))
    ) {
      throw unauthorized('Das aktuelle Passwort ist falsch.');
    }

    setPasswort(getDb(), user.id, neuesPasswort);
    // Andere Sessions dieses Nutzers verwerfen; die aktuelle bleibt bestehen.
    deleteSessionsForUser(getDb(), user.id);
    const token = createSession(getDb(), user.id);
    setzeSessionCookie(res, token);
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
