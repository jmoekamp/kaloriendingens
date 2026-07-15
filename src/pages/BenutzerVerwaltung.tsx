import { useEffect, useState } from 'react';
import type { AuthUser, User } from '../../shared/types.ts';
import { Banner, Button, Card, Field, TextInput } from '../components/ui.tsx';
import { usersApi } from '../lib/auth.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

/** Nutzerverwaltung für den Admin: anlegen, löschen, Passwort setzen. */
export default function BenutzerVerwaltung({ aktiver }: { aktiver: AuthUser }) {
  const [liste, setListe] = useState<User[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  // Anlege-Formular
  const [username, setUsername] = useState('');
  const [mandant, setMandant] = useState('1');
  const [passwort, setPasswort] = useState('');
  const [legtAn, setLegtAn] = useState(false);

  function laden() {
    usersApi
      .list()
      .then(setListe)
      .catch((e: unknown) => setFehler(meldung(e)));
  }
  useEffect(laden, []);

  async function anlegen(e: React.FormEvent) {
    e.preventDefault();
    setLegtAn(true);
    setFehler(null);
    setHinweis(null);
    try {
      await usersApi.create({
        username,
        mandant_id: Number(mandant),
        passwort,
      });
      setUsername('');
      setMandant('1');
      setPasswort('');
      setHinweis(`Nutzer „${username}" angelegt.`);
      laden();
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setLegtAn(false);
    }
  }

  async function loeschen(u: User) {
    if (!confirm(`Nutzer „${u.username}" wirklich löschen?`)) return;
    setFehler(null);
    setHinweis(null);
    try {
      await usersApi.remove(u.id);
      laden();
    } catch (err) {
      setFehler(meldung(err));
    }
  }

  async function passwortSetzen(u: User) {
    const neu = prompt(`Neues Passwort für „${u.username}":`);
    if (neu == null || neu === '') return;
    setFehler(null);
    setHinweis(null);
    try {
      await usersApi.setPasswort(u.id, neu);
      setHinweis(`Passwort für „${u.username}" gesetzt.`);
    } catch (err) {
      setFehler(meldung(err));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {fehler && (
        <Banner kind="error" onClose={() => setFehler(null)}>
          {fehler}
        </Banner>
      )}
      {hinweis && (
        <Banner kind="success" onClose={() => setHinweis(null)}>
          {hinweis}
        </Banner>
      )}

      <Card title="Neuen Nutzer anlegen">
        <form
          onSubmit={anlegen}
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4"
        >
          <Field label="Benutzername">
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </Field>
          <Field label="Mandant (0 = Admin)">
            <TextInput
              type="number"
              min="0"
              value={mandant}
              onChange={(e) => setMandant(e.target.value)}
              required
            />
          </Field>
          <Field label="Passwort">
            <TextInput
              type="password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Field>
          <Button type="submit" variant="primary" disabled={legtAn}>
            {legtAn ? 'Lege an …' : 'Anlegen'}
          </Button>
        </form>
      </Card>

      <Card title="Nutzer">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-2 pr-3 font-normal">Benutzername</th>
              <th className="py-2 pr-3 font-normal">Mandant</th>
              <th className="py-2 pr-3 font-normal">Angelegt</th>
              <th className="py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((u) => (
              <tr key={u.id} className="border-b border-border/50">
                <td className="py-2 pr-3">{u.username}</td>
                <td className="py-2 pr-3 tabular">
                  {u.mandant_id === 0 ? '0 (Admin)' : u.mandant_id}
                </td>
                <td className="py-2 pr-3 text-text-muted">
                  {u.erstellt_am.slice(0, 10)}
                </td>
                <td className="py-2">
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => passwortSetzen(u)}>
                      Passwort setzen
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => loeschen(u)}
                      disabled={u.id === aktiver.id}
                      title={
                        u.id === aktiver.id
                          ? 'Der eigene Account kann nicht gelöscht werden'
                          : undefined
                      }
                    >
                      Löschen
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
