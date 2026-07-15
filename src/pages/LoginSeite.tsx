import { useState } from 'react';
import type { AuthUser } from '../../shared/types.ts';
import { Banner, Button, Card, Field, TextInput } from '../components/ui.tsx';
import { authApi } from '../lib/auth.ts';

export default function LoginSeite({
  onLogin,
}: {
  onLogin: (user: AuthUser) => void;
}) {
  const [username, setUsername] = useState('');
  const [passwort, setPasswort] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function anmelden(e: React.FormEvent) {
    e.preventDefault();
    setLaeuft(true);
    setFehler(null);
    try {
      const user = await authApi.login(username, passwort);
      onLogin(user);
    } catch (err) {
      setFehler(
        err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen',
      );
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm px-6">
      <h1 className="mb-6 text-center text-xl font-bold">cal-o-matic</h1>
      <Card title="Anmelden">
        <form onSubmit={anmelden} className="flex flex-col gap-4">
          {fehler && <Banner kind="error">{fehler}</Banner>}
          <Field label="Benutzername">
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </Field>
          <Field label="Passwort">
            <TextInput
              type="password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Button type="submit" variant="primary" disabled={laeuft}>
            {laeuft ? 'Anmelden …' : 'Anmelden'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
