import { Router } from 'express';
import { getDb } from '../db/index.ts';
import { badRequest, conflict } from '../errors.ts';
import type { AuthRequest } from '../auth/middleware.ts';
import {
  parseId,
  requireInteger,
  requireNeuesPasswort,
  requireString,
} from '../validation.ts';
import {
  createUser,
  deleteUser,
  listUsers,
  setPasswort,
} from '../repos/users.ts';
import { deleteSessionsForUser } from '../repos/sessions.ts';

/**
 * Nutzerverwaltung – nur fuer den Admin (Mandant 0). Anlegen, Loeschen und
 * Passwoerter setzen. Der Admin sieht hier KEINE Fachdaten.
 */
export const usersRouter = Router();

usersRouter.get('/', (_req, res) => {
  res.json(listUsers(getDb()));
});

usersRouter.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const username = requireString(body, 'username');
  const mandant_id = requireInteger(body, 'mandant_id');
  if (mandant_id < 0) {
    throw badRequest('mandant_id muss >= 0 sein (0 = Admin).');
  }
  const passwort = requireNeuesPasswort(body, 'passwort');
  res.status(201).json(createUser(getDb(), { username, mandant_id, passwort }));
});

usersRouter.put('/:id/passwort', (req, res) => {
  const id = parseId(req.params.id);
  const passwort = requireNeuesPasswort(
    (req.body ?? {}) as Record<string, unknown>,
    'passwort',
  );
  setPasswort(getDb(), id, passwort);
  deleteSessionsForUser(getDb(), id); // bestehende Sessions des Nutzers verwerfen
  res.status(204).end();
});

usersRouter.delete('/:id', (req: AuthRequest, res) => {
  const id = parseId(req.params.id);
  if (req.user?.userId === id) {
    throw conflict('Der eigene Account kann nicht geloescht werden.');
  }
  deleteUser(getDb(), id); // schuetzt zusaetzlich den letzten Admin
  res.status(204).end();
});
