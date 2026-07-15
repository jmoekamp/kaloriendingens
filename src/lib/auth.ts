/**
 * API-Aufrufe fuer Authentifizierung und Nutzerverwaltung. Das Session-Cookie
 * wird vom Browser automatisch mitgesendet (Same-Origin: Dev via Vite-Proxy,
 * Prod vom selben Server).
 */
import type { AuthUser, User, UserInput } from '../../shared/types.ts';
import { api } from './api.ts';

export const authApi = {
  /** Aktueller Nutzer oder null, wenn nicht angemeldet (401). */
  me: () => api.get<AuthUser>('/auth/me'),
  login: (username: string, passwort: string) =>
    api.post<AuthUser>('/auth/login', { username, passwort }),
  logout: () => api.post<void>('/auth/logout', {}),
  passwortAendern: (altes_passwort: string, neues_passwort: string) =>
    api.post<void>('/auth/passwort', { altes_passwort, neues_passwort }),
};

export const usersApi = {
  list: () => api.get<User[]>('/users'),
  create: (input: UserInput) => api.post<User>('/users', input),
  remove: (id: number) => api.delete<void>(`/users/${id}`),
  setPasswort: (id: number, passwort: string) =>
    api.put<void>(`/users/${id}/passwort`, { passwort }),
};
