import { useEffect, useState } from 'react';
import type { AuthUser } from '../shared/types.ts';
import AllzeitSeite from './pages/AllzeitSeite.tsx';
import BenutzerVerwaltung from './pages/BenutzerVerwaltung.tsx';
import EinstellungenSeite from './pages/EinstellungenSeite.tsx';
import LangfristSeite from './pages/LangfristSeite.tsx';
import LebensmittelVerwaltung from './pages/LebensmittelVerwaltung.tsx';
import LoginSeite from './pages/LoginSeite.tsx';
import TagSeite from './pages/TagSeite.tsx';
import { ApiError } from './lib/api.ts';
import { authApi } from './lib/auth.ts';
import { heuteIso } from './lib/format.ts';

type Ansicht =
  | 'tag'
  | 'langfrist'
  | 'allzeit'
  | 'lebensmittel'
  | 'einstellungen'
  | 'benutzer';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [geladen, setGeladen] = useState(false);

  // Beim Start: bestehende Session pruefen.
  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 401)) {
          // eslint-disable-next-line no-console
          console.error(e);
        }
        setUser(null);
      })
      .finally(() => setGeladen(true));
  }, []);

  if (!geladen) {
    return <p className="p-8 text-text-muted">Lade …</p>;
  }
  if (!user) {
    return <LoginSeite onLogin={setUser} />;
  }
  return <AngemeldeteApp user={user} onLogout={() => setUser(null)} />;
}

function AngemeldeteApp({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => void;
}) {
  const navi: { key: Ansicht; label: string }[] = user.ist_admin
    ? [
        { key: 'benutzer', label: 'Benutzer' },
        { key: 'einstellungen', label: 'Einstellungen' },
      ]
    : [
        { key: 'tag', label: 'Tag' },
        { key: 'langfrist', label: 'Auswertung' },
        { key: 'allzeit', label: 'Allzeit' },
        { key: 'lebensmittel', label: 'Lebensmittel' },
        { key: 'einstellungen', label: 'Einstellungen' },
      ];

  const [ansicht, setAnsicht] = useState<Ansicht>(navi[0].key);
  // Aktuell gewaehlter Tag der Tagesseite – zentral, damit die Auswertung
  // gezielt auf einen Tag springen kann.
  const [tagDatum, setTagDatum] = useState(heuteIso());

  function oeffneTag(datum: string) {
    setTagDatum(datum);
    setAnsicht('tag');
  }

  async function abmelden() {
    try {
      await authApi.logout();
    } finally {
      onLogout();
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <span className="font-bold">cal-o-matic</span>
          <nav className="flex gap-1">
            {navi.map((n) => (
              <button
                key={n.key}
                onClick={() => setAnsicht(n.key)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  ansicht === n.key
                    ? 'bg-surface-2 text-text'
                    : 'text-text-muted hover:text-text'
                }`}
              >
                {n.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-text-muted">
            <span>
              {user.username}
              {user.ist_admin && ' (Admin)'}
            </span>
            <button
              onClick={abmelden}
              className="rounded-md px-3 py-1.5 transition-colors hover:text-text"
            >
              Abmelden
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-8">
        {ansicht === 'tag' && (
          <TagSeite datum={tagDatum} setDatum={setTagDatum} />
        )}
        {ansicht === 'langfrist' && <LangfristSeite oeffneTag={oeffneTag} />}
        {ansicht === 'allzeit' && <AllzeitSeite />}
        {ansicht === 'lebensmittel' && <LebensmittelVerwaltung />}
        {ansicht === 'einstellungen' && <EinstellungenSeite aktiver={user} />}
        {ansicht === 'benutzer' && <BenutzerVerwaltung aktiver={user} />}
      </main>
    </div>
  );
}
