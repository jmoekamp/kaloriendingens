import { useEffect, useState } from 'react';
import type { AuthUser, Einstellungen, ZielTyp } from '../../shared/types.ts';
import {
  Banner,
  Button,
  Card,
  Field,
  Select,
  TextInput,
} from '../components/ui.tsx';
import {
  formatGramm,
  parseGanzzahl,
  parseGrammToDg,
} from '../../shared/naehrwerte.ts';
import { einstellungenApi } from '../lib/einstellungen.ts';
import { authApi } from '../lib/auth.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

interface FormState {
  kcal_ziel: string;
  kcal_ziel_typ: ZielTyp;
  eiweiss_ziel: string; // Gramm-Eingabe als Text
  eiweiss_ziel_typ: ZielTyp;
  gesamtumsatz: string;
}

function toForm(e: Einstellungen): FormState {
  return {
    kcal_ziel: e.kcal_ziel === 0 ? '' : String(e.kcal_ziel),
    kcal_ziel_typ: e.kcal_ziel_typ,
    eiweiss_ziel: e.eiweiss_ziel_dg === 0 ? '' : formatGramm(e.eiweiss_ziel_dg),
    eiweiss_ziel_typ: e.eiweiss_ziel_typ,
    gesamtumsatz: e.gesamtumsatz === 0 ? '' : String(e.gesamtumsatz),
  };
}

export default function EinstellungenSeite({ aktiver }: { aktiver: AuthUser }) {
  const istAdmin = aktiver.ist_admin;
  const [form, setForm] = useState<FormState | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  useEffect(() => {
    if (istAdmin) return; // Admin hat keine Fachdaten-Einstellungen.
    einstellungenApi
      .get()
      .then((e) => setForm(toForm(e)))
      .catch((e) => setFehler(meldung(e)));
  }, [istAdmin]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setGespeichert(false);
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFehler(null);

    // Leere Felder bedeuten „kein Ziel/Umsatz" = 0.
    const kcalZiel =
      form.kcal_ziel.trim() === '' ? 0 : parseGanzzahl(form.kcal_ziel);
    const eiweissZiel =
      form.eiweiss_ziel.trim() === '' ? 0 : parseGrammToDg(form.eiweiss_ziel);
    const umsatz =
      form.gesamtumsatz.trim() === '' ? 0 : parseGanzzahl(form.gesamtumsatz);

    if (kcalZiel === null) {
      setFehler('Kalorienziel muss eine ganze Zahl ≥ 0 sein.');
      return;
    }
    if (eiweissZiel === null) {
      setFehler('Eiweißziel muss eine Zahl ≥ 0 sein (z. B. 120).');
      return;
    }
    if (umsatz === null) {
      setFehler('Gesamtumsatz muss eine ganze Zahl ≥ 0 sein.');
      return;
    }

    setSpeichert(true);
    try {
      const gespeicherteWerte = await einstellungenApi.update({
        kcal_ziel: kcalZiel,
        kcal_ziel_typ: form.kcal_ziel_typ,
        eiweiss_ziel_dg: eiweissZiel,
        eiweiss_ziel_typ: form.eiweiss_ziel_typ,
        gesamtumsatz: umsatz,
      });
      setForm(toForm(gespeicherteWerte));
      setGespeichert(true);
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {fehler && (
        <Banner kind="error" onClose={() => setFehler(null)}>
          {fehler}
        </Banner>
      )}
      {gespeichert && (
        <Banner kind="success" onClose={() => setGespeichert(false)}>
          Einstellungen gespeichert.
        </Banner>
      )}

      {!istAdmin &&
        (form ? (
          <form onSubmit={speichern} className="flex flex-col gap-4">
            <Card title="Ziele">
              <p className="mb-3 text-sm text-text-muted">
                Ein Ziel kann als Obergrenze (Maximum) oder Untergrenze
                (Minimum) gelten. Feld leer lassen = kein Ziel.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex items-end gap-2">
                  <Field label="Kalorienziel (kcal/Tag)">
                    <TextInput
                      className="tabular"
                      value={form.kcal_ziel}
                      onChange={(e) => set('kcal_ziel', e.target.value)}
                      inputMode="numeric"
                      placeholder="z. B. 1800"
                    />
                  </Field>
                  <Field label="Typ">
                    <Select
                      value={form.kcal_ziel_typ}
                      onChange={(e) =>
                        set('kcal_ziel_typ', e.target.value as ZielTyp)
                      }
                    >
                      <option value="max">Maximum</option>
                      <option value="min">Minimum</option>
                    </Select>
                  </Field>
                </div>
                <div className="flex items-end gap-2">
                  <Field label="Eiweißziel (g/Tag)">
                    <TextInput
                      className="tabular"
                      value={form.eiweiss_ziel}
                      onChange={(e) => set('eiweiss_ziel', e.target.value)}
                      inputMode="decimal"
                      placeholder="z. B. 120"
                    />
                  </Field>
                  <Field label="Typ">
                    <Select
                      value={form.eiweiss_ziel_typ}
                      onChange={(e) =>
                        set('eiweiss_ziel_typ', e.target.value as ZielTyp)
                      }
                    >
                      <option value="min">Minimum</option>
                      <option value="max">Maximum</option>
                    </Select>
                  </Field>
                </div>
              </div>
            </Card>

            <Card title="Gesamtumsatz">
              <p className="mb-3 text-sm text-text-muted">
                Dein täglicher Gesamtumsatz (kcal/Tag). Grundlage für das
                Kaloriendefizit (Gesamtumsatz − Aufnahme je Tag).
              </p>
              <Field label="Gesamtumsatz (kcal/Tag)">
                <TextInput
                  className="w-48 tabular"
                  value={form.gesamtumsatz}
                  onChange={(e) => set('gesamtumsatz', e.target.value)}
                  inputMode="numeric"
                  placeholder="z. B. 2400"
                />
              </Field>
            </Card>

            <div>
              <Button type="submit" variant="primary" disabled={speichert}>
                {speichert ? 'Speichert …' : 'Speichern'}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-text-muted">Lade Einstellungen …</p>
        ))}

      <PasswortKarte />

      <Card title="Datensicherung">
        <p className="mb-3 text-sm text-text-muted">
          {istAdmin
            ? 'Lädt eine vollständige Sicherung aller Mandanten (inkl. Nutzer) als einzelne SQLite-Datei herunter (Dateiname mit Datum).'
            : 'Lädt eine Sicherung deiner eigenen Daten als einzelne SQLite-Datei herunter (Dateiname mit Datum).'}{' '}
          Zum Wiederherstellen die heruntergeladene Datei wieder als
          Datenbankdatei einspielen.
        </p>
        <a
          className="rounded-md border border-border bg-surface-2 px-3 py-1.5 text-sm text-text hover:bg-border"
          href="/api/backup"
        >
          Backup herunterladen
        </a>
      </Card>
    </div>
  );
}

/** Karte zum Ändern des eigenen Passworts (für jeden angemeldeten Nutzer). */
function PasswortKarte() {
  const [alt, setAlt] = useState('');
  const [neu, setNeu] = useState('');
  const [neu2, setNeu2] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  async function aendern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setOk(false);
    if (neu !== neu2) {
      setFehler('Die beiden neuen Passwörter stimmen nicht überein.');
      return;
    }
    setLaeuft(true);
    try {
      await authApi.passwortAendern(alt, neu);
      setAlt('');
      setNeu('');
      setNeu2('');
      setOk(true);
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card title="Passwort ändern">
      <form onSubmit={aendern} className="flex max-w-sm flex-col gap-3">
        {fehler && <Banner kind="error">{fehler}</Banner>}
        {ok && <Banner kind="success">Passwort geändert.</Banner>}
        <Field label="Aktuelles Passwort">
          <TextInput
            type="password"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="Neues Passwort">
          <TextInput
            type="password"
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Neues Passwort (Wiederholung)">
          <TextInput
            type="password"
            value={neu2}
            onChange={(e) => setNeu2(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>
        <div>
          <Button type="submit" variant="primary" disabled={laeuft}>
            {laeuft ? 'Ändert …' : 'Passwort ändern'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
