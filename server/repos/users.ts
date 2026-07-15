import type { Database } from 'better-sqlite3';
import type { User } from '../../shared/types.ts';
import { conflict, isUniqueViolation, notFound } from '../errors.ts';
import { hashPasswort } from '../auth/passwoerter.ts';

/**
 * Zugriffsschicht fuer Nutzer. Nutzer sind mandant-UEBERGREIFEND (Auth-Verwaltung);
 * hier wird daher NICHT nach aktuellerMandant() gefiltert. Der Admin verwaltet alle
 * Nutzer aller Mandanten.
 *
 * Der Passwort-Hash bleibt im Backend; nach aussen geht nur das User-DTO ohne Hash.
 */

export interface UserRow {
  id: number;
  mandant_id: number;
  username: string;
  password_hash: string;
  erstellt_am: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    mandant_id: row.mandant_id,
    username: row.username,
    erstellt_am: row.erstellt_am,
  };
}

export function zaehleUsers(db: Database): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number })
    .n;
}

export function listUsers(db: Database): User[] {
  const rows = db
    .prepare(
      'SELECT id, mandant_id, username, password_hash, erstellt_am FROM users ORDER BY mandant_id, username',
    )
    .all() as UserRow[];
  return rows.map(toUser);
}

export function getUserById(db: Database, id: number): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
    UserRow | undefined;
}

export function getUserByUsername(
  db: Database,
  username: string,
): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
    UserRow | undefined;
}

export function zaehleAdmins(db: Database): number {
  return (
    db
      .prepare('SELECT COUNT(*) AS n FROM users WHERE mandant_id = 0')
      .get() as {
      n: number;
    }
  ).n;
}

/** Legt einen Nutzer an. Das Passwort wird gehasht gespeichert. */
export function createUser(
  db: Database,
  input: { username: string; mandant_id: number; passwort: string },
): User {
  const username = input.username.trim();
  if (username === '') {
    throw conflict('Benutzername darf nicht leer sein.');
  }
  if (input.passwort.length < 1) {
    throw conflict('Passwort darf nicht leer sein.');
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO users (mandant_id, username, password_hash, erstellt_am)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        input.mandant_id,
        username,
        hashPasswort(input.passwort),
        new Date().toISOString(),
      );
    return toUser(getUserById(db, Number(info.lastInsertRowid)) as UserRow);
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw conflict(`Den Benutzernamen "${username}" gibt es bereits.`);
    }
    throw e;
  }
}

export function deleteUser(db: Database, id: number): void {
  const user = getUserById(db, id);
  if (!user) throw notFound('Nutzer nicht gefunden.');
  // Den letzten Admin nicht loeschen – sonst sperrt man sich selbst aus.
  if (user.mandant_id === 0 && zaehleAdmins(db) <= 1) {
    throw conflict('Der letzte Admin-Nutzer kann nicht geloescht werden.');
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

/** Setzt ein neues Passwort (Admin oder Selbstbedienung). */
export function setPasswort(
  db: Database,
  id: number,
  neuesPasswort: string,
): void {
  const user = getUserById(db, id);
  if (!user) throw notFound('Nutzer nicht gefunden.');
  if (neuesPasswort.length < 1) {
    throw conflict('Passwort darf nicht leer sein.');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    hashPasswort(neuesPasswort),
    id,
  );
}
