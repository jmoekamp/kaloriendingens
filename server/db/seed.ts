import type { Database } from 'better-sqlite3';
import { createUser, zaehleUsers } from '../repos/users.ts';

/**
 * Legt beim allerersten Start (noch keine Nutzer vorhanden) die Erst-Accounts an:
 * - admin / admin   im Admin-Realm (Mandant 0): nur Nutzerverwaltung.
 * - joerg / joerg   im Daten-Mandanten 1: erfasst Lebensmittel und Mahlzeiten.
 *
 * Die Standard-Passwoerter sind absichtlich trivial und sollen nach dem ersten
 * Login in den Einstellungen geaendert werden.
 */
export function seedUsers(db: Database): void {
  if (zaehleUsers(db) > 0) return;

  createUser(db, { username: 'admin', mandant_id: 0, passwort: 'admin' });
  createUser(db, { username: 'joerg', mandant_id: 1, passwort: 'joerg' });

  // eslint-disable-next-line no-console
  console.warn(
    'Erst-Accounts angelegt: admin/admin (Admin) und joerg/joerg (Mandant 1). ' +
      'Bitte Passwoerter nach dem ersten Login in den Einstellungen aendern.',
  );
}
