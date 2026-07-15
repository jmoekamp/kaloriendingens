import type { NextFunction, Request, Response } from 'express';
import { getDb, requestKontext } from '../db/index.ts';
import { forbidden, unauthorized } from '../errors.ts';
import { getSession, type SessionInfo } from '../repos/sessions.ts';

/**
 * Authentifizierung & Rollen.
 *
 * Sessions stecken in einem httpOnly-Cookie. Cookie-Parsing und -Setzen erfolgen
 * manuell (keine zusaetzliche Abhaengigkeit). Der Mandant des angemeldeten Nutzers
 * wird je Request in den AsyncLocalStorage (requestKontext) gelegt, sodass die
 * Repositories ueber aktuellerMandant() automatisch korrekt filtern.
 */

export const COOKIE_NAME = 'cal_session';

// Express tippt req.user nicht – wir haengen den angemeldeten Nutzer hier an.
export interface AuthRequest extends Request {
  user?: SessionInfo;
}

/** Liest ein einzelnes Cookie aus dem Cookie-Header. */
export function leseCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const teil of header.split(';')) {
    const idx = teil.indexOf('=');
    if (idx === -1) continue;
    const key = teil.slice(0, idx).trim();
    if (key === name) {
      // Kaputte %-Sequenzen (z. B. "%zz") duerfen keinen 500er ausloesen –
      // ein unlesbares Cookie zaehlt schlicht als "nicht vorhanden" (-> 401).
      try {
        return decodeURIComponent(teil.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

/** Setzt das Session-Cookie (httpOnly, SameSite=Strict). Kein Secure: lokales HTTP. */
export function setzeSessionCookie(res: Response, token: string): void {
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${
      30 * 24 * 60 * 60
    }`,
  );
}

/** Loescht das Session-Cookie. */
export function loescheSessionCookie(res: Response): void {
  res.append(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
  );
}

/**
 * Verlangt eine gueltige Session. Setzt req.user und fuehrt die weitere
 * Verarbeitung im Mandant-Kontext des Nutzers aus.
 */
export function authMiddleware(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  const token = leseCookie(req, COOKIE_NAME);
  const session = token ? getSession(getDb(), token) : null;
  if (!session) {
    next(unauthorized('Nicht angemeldet.'));
    return;
  }
  req.user = session;
  requestKontext.run({ mandantId: session.mandantId }, () => next());
}

/** Nur Admin (Mandant 0). */
export function requireAdmin(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user?.istAdmin) {
    next(forbidden('Nur fuer Administratoren.'));
    return;
  }
  next();
}

/** Nur Daten-Nutzer (Mandant >= 1) – sperrt den Admin aus den Fachdaten aus. */
export function requireDatenNutzer(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user || req.user.istAdmin) {
    next(forbidden('Der Admin-Nutzer hat keinen Zugriff auf Fachdaten.'));
    return;
  }
  next();
}
