import { useEffect, useState } from 'react';
import type { AuthUser, Vorgabe, ZielTyp } from '../../shared/types.ts';
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
  formatKcal,
  parseGanzzahl,
  parseGrammToDg,
} from '../../shared/naehrwerte.ts';
import { formatDatum, heuteIso } from '../lib/format.ts';
import { vorgabenApi } from '../lib/vorgaben.ts';
import { authApi } from '../lib/auth.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

interface FormState {
  gueltig_ab: string;
  kcal_ziel: string;
  kcal_ziel_typ: ZielTyp;
  eiweiss_ziel: string; // Gramm-Eingabe als Text
  eiweiss_ziel_typ: ZielTyp;
  gesamtumsatz: string;
}

/** Startwerte fuer eine neue Vorgabe: Werte der aktuellsten Version uebernehmen. */
function neuerForm(versionen: Vorgabe[]): FormState {
  const v = versionen[0];
  return {
    gueltig_ab: heuteIso(),
    kcal_ziel: v && v.kcal_ziel !== 0 ? String(v.kcal_ziel) : '',
    kcal_ziel_typ: v?.kcal_ziel_typ ?? 'max',
    eiweiss_ziel:
      v && v.eiweiss_ziel_dg !== 0 ? formatGramm(v.eiweiss_ziel_dg) : '',
    eiweiss_ziel_typ: v?.eiweiss_ziel_typ ?? 'min',
    gesamtumsatz: v && v.gesamtumsatz !== 0 ? String(v.gesamtumsatz) : '',
  };
}

function zielText(ziel: number, typ: ZielTyp, format: (n: number) => string) {
  if (ziel === 0) return '—';
  return `${typ === 'max' ? '≤' : '≥'} ${format(ziel)}`;
}

export default function EinstellungenSeite({ aktiver }: { aktiver: AuthUser }) {
  const istAdmin = aktiver.ist_admin;
  const [versionen, setVersionen] = useState<Vorgabe[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  function laden() {
    vorgabenApi
      .list()
      .then((vs) => {
        setVersionen(vs);
        setForm((f) => f ?? neuerForm(vs));
      })
      .catch((e) => setFehler(meldung(e)));
  }

  useEffect(() => {
    if (istAdmin) return; // Admin hat keine Fachdaten-Einstellungen.
    laden();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [istAdmin]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setGespeichert(false);
  }

  /** Bestehende Version zum Ersetzen in das Formular laden. */
  function bearbeiten(v: Vorgabe) {
    setForm({
      gueltig_ab: v.gueltig_ab,
      kcal_ziel: v.kcal_ziel === 0 ? '' : String(v.kcal_ziel),
      kcal_ziel_typ: v.kcal_ziel_typ,
      eiweiss_ziel:
        v.eiweiss_ziel_dg === 0 ? '' : formatGramm(v.eiweiss_ziel_dg),
      eiweiss_ziel_typ: v.eiweiss_ziel_typ,
      gesamtumsatz: v.gesamtumsatz === 0 ? '' : String(v.gesamtumsatz),
    });
    setGespeichert(false);
    setFehler(null);
  }

  async function loeschen(v: Vorgabe) {
    if (!confirm(`Vorgabe ab ${formatDatum(v.gueltig_ab)} wirklich löschen?`))
      return;
    setFehler(null);
    try {
      await vorgabenApi.remove(v.id);
      laden();
    } catch (e) {
      setFehler(meldung(e));
    }
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setFehler(null);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.gueltig_ab)) {
      setFehler('Bitte ein gültiges „gültig ab"-Datum wählen.');
      return;
    }
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
      const vs = await vorgabenApi
        .save({
          gueltig_ab: form.gueltig_ab,
          kcal_ziel: kcalZiel,
          kcal_ziel_typ: form.kcal_ziel_typ,
          eiweiss_ziel_dg: eiweissZiel,
          eiweiss_ziel_typ: form.eiweiss_ziel_typ,
          gesamtumsatz: umsatz,
        })
        .then(() => vorgabenApi.list());
      setVersionen(vs);
      setForm(neuerForm(vs));
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
          Vorgabe gespeichert.
        </Banner>
      )}

      {!istAdmin && form && (
        <>
          <Card title="Ziele & Gesamtumsatz (ab Stichtag)">
            <p className="mb-3 text-sm text-text-muted">
              Eine Vorgabe gilt ab dem gewählten Stichtag. Frühere Tage behalten
              die davor gültige Vorgabe – so bleibt z. B. ein früher höherer
              Gesamtumsatz für vergangene Tage erhalten. Feld leer = kein
              Ziel/Umsatz. Ein vorhandener Stichtag wird überschrieben.
            </p>
            <form onSubmit={speichern} className="flex flex-col gap-4">
              <Field label="gültig ab">
                <TextInput
                  type="date"
                  value={form.gueltig_ab}
                  onChange={(e) =>
                    e.target.value && set('gueltig_ab', e.target.value)
                  }
                  className="w-48 tabular"
                />
              </Field>

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

              <Field label="Gesamtumsatz (kcal/Tag)">
                <TextInput
                  className="w-48 tabular"
                  value={form.gesamtumsatz}
                  onChange={(e) => set('gesamtumsatz', e.target.value)}
                  inputMode="numeric"
                  placeholder="z. B. 2400"
                />
              </Field>

              <div>
                <Button type="submit" variant="primary" disabled={speichert}>
                  {speichert ? 'Speichert …' : 'Vorgabe speichern'}
                </Button>
              </div>
            </form>
          </Card>

          <Card title="Verlauf der Vorgaben">
            {versionen.length === 0 ? (
              <p className="text-text-muted">Noch keine Vorgabe gesetzt.</p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-muted">
                    <th className="py-2 pr-3 font-normal">gültig ab</th>
                    <th className="py-2 pr-3 text-right font-normal">
                      Kalorienziel
                    </th>
                    <th className="py-2 pr-3 text-right font-normal">
                      Eiweißziel
                    </th>
                    <th className="py-2 pr-3 text-right font-normal">
                      Gesamtumsatz
                    </th>
                    <th className="py-2 font-normal"></th>
                  </tr>
                </thead>
                <tbody>
                  {versionen.map((v) => (
                    <tr key={v.id} className="border-b border-border/50">
                      <td className="py-2 pr-3 tabular">
                        {formatDatum(v.gueltig_ab)}
                      </td>
                      <td className="py-2 pr-3 text-right tabular">
                        {zielText(
                          v.kcal_ziel,
                          v.kcal_ziel_typ,
                          (n) => `${formatKcal(n)} kcal`,
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular">
                        {zielText(
                          v.eiweiss_ziel_dg,
                          v.eiweiss_ziel_typ,
                          (n) => `${formatGramm(n)} g`,
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular">
                        {v.gesamtumsatz === 0
                          ? '—'
                          : `${formatKcal(v.gesamtumsatz)} kcal`}
                      </td>
                      <td className="py-2">
                        <div className="flex justify-end gap-2">
                          <Button onClick={() => bearbeiten(v)}>
                            Bearbeiten
                          </Button>
                          <Button variant="danger" onClick={() => loeschen(v)}>
                            Löschen
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

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
