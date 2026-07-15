import { randomBytes } from 'node:crypto';
import type { Database } from 'better-sqlite3';

/**
 * Server-seitige Sessions. Ein zufaelliges Token wird als httpOnly-Cookie
 * ausgeliefert; hier liegt der Gegenpart in der DB (ueberlebt Neustart).
 *
 * Sessions verfallen nach SESSION_TTL_MS Inaktivitaet; abgelaufene werden beim
 * Aufloesen entfernt.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

export interface SessionInfo {
  userId: number;
  mandantId: number;
  username: string;
  istAdmin: boolean;
}

interface SessionJoinRow {
  user_id: number;
  mandant_id: number;
  username: string;
  letzte_aktivitaet: string;
}

export function createSession(db: Database, userId: number): string {
  const token = randomBytes(32).toString('hex');
  const jetzt = new Date().toISOString();
  db.prepare(
    `INSERT INTO sessions (token, user_id, erstellt_am, letzte_aktivitaet)
     VALUES (?, ?, ?, ?)`,
  ).run(token, userId, jetzt, jetzt);
  return token;
}

/**
 * Loest ein Session-Token auf. Liefert null, wenn unbekannt oder abgelaufen.
 * Bei Gueltigkeit wird die letzte Aktivitaet aktualisiert (gleitendes Ablaufen).
 */
export function getSession(db: Database, token: string): SessionInfo | null {
  const row = db
    .prepare(
      `SELECT s.user_id, s.letzte_aktivitaet, u.mandant_id, u.username
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token = ?`,
    )
    .get(token) as SessionJoinRow | undefined;
  if (!row) return null;

  const alter = Date.now() - new Date(row.letzte_aktivitaet).getTime();
  if (alter > SESSION_TTL_MS) {
    deleteSession(db, token);
    return null;
  }

  db.prepare('UPDATE sessions SET letzte_aktivitaet = ? WHERE token = ?').run(
    new Date().toISOString(),
    token,
  );

  return {
    userId: row.user_id,
    mandantId: row.mandant_id,
    username: row.username,
    istAdmin: row.mandant_id === 0,
  };
}

export function deleteSession(db: Database, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function deleteSessionsForUser(db: Database, userId: number): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}
