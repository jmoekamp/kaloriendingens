import { useEffect, useState } from 'react';
import type { Lebensmittel } from '../../shared/types.ts';
import { Banner, Button, Card, Field, TextInput } from '../components/ui.tsx';
import {
  formatGramm,
  formatKcal,
  parseGanzzahl,
  parseGrammToDg,
} from '../../shared/naehrwerte.ts';
import { lebensmittelApi } from '../lib/lebensmittel.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

const LEER = { name: '', kcal: '', eiweiss: '' };

/** Stammdaten: Lebensmittel anlegen, bearbeiten und loeschen (Werte je 100 g). */
export default function LebensmittelVerwaltung() {
  const [liste, setListe] = useState<Lebensmittel[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [form, setForm] = useState(LEER);
  const [bearbeitetId, setBearbeitetId] = useState<number | null>(null);
  const [speichert, setSpeichert] = useState(false);

  function laden() {
    lebensmittelApi
      .list()
      .then(setListe)
      .catch((e) => setFehler(meldung(e)));
  }
  useEffect(laden, []);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function abbrechen() {
    setForm(LEER);
    setBearbeitetId(null);
  }

  function bearbeiten(l: Lebensmittel) {
    setBearbeitetId(l.id);
    setForm({
      name: l.name,
      kcal: String(l.kcal_pro_100g),
      eiweiss: formatGramm(l.eiweiss_dg_pro_100g),
    });
    setHinweis(null);
    setFehler(null);
  }

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setHinweis(null);
    const kcal = parseGanzzahl(form.kcal);
    const eiweissDg = parseGrammToDg(form.eiweiss);
    if (form.name.trim() === '') {
      setFehler('Name darf nicht leer sein.');
      return;
    }
    if (kcal === null) {
      setFehler('kcal je 100 g muss eine ganze Zahl ≥ 0 sein.');
      return;
    }
    if (eiweissDg === null) {
      setFehler('Eiweiß je 100 g muss eine Zahl ≥ 0 sein (z. B. 12,5).');
      return;
    }
    const input = {
      name: form.name.trim(),
      kcal_pro_100g: kcal,
      eiweiss_dg_pro_100g: eiweissDg,
    };
    setSpeichert(true);
    try {
      if (bearbeitetId === null) {
        await lebensmittelApi.create(input);
        setHinweis(`„${input.name}" angelegt.`);
      } else {
        await lebensmittelApi.update(bearbeitetId, input);
        setHinweis(`„${input.name}" gespeichert.`);
      }
      abbrechen();
      laden();
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setSpeichert(false);
    }
  }

  async function loeschen(l: Lebensmittel) {
    if (!confirm(`Lebensmittel „${l.name}" wirklich löschen?`)) return;
    setFehler(null);
    setHinweis(null);
    try {
      await lebensmittelApi.remove(l.id);
      if (bearbeitetId === l.id) abbrechen();
      laden();
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

      <Card
        title={
          bearbeitetId === null
            ? 'Neues Lebensmittel'
            : 'Lebensmittel bearbeiten'
        }
      >
        <form
          onSubmit={speichern}
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4"
        >
          <Field label="Name">
            <TextInput
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </Field>
          <Field label="kcal je 100 g">
            <TextInput
              className="tabular"
              value={form.kcal}
              onChange={(e) => set('kcal', e.target.value)}
              inputMode="numeric"
              placeholder="z. B. 250"
            />
          </Field>
          <Field label="Eiweiß je 100 g (g)">
            <TextInput
              className="tabular"
              value={form.eiweiss}
              onChange={(e) => set('eiweiss', e.target.value)}
              inputMode="decimal"
              placeholder="z. B. 12,5"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={speichert}>
              {speichert
                ? 'Speichert …'
                : bearbeitetId === null
                  ? 'Anlegen'
                  : 'Speichern'}
            </Button>
            {bearbeitetId !== null && (
              <Button type="button" onClick={abbrechen}>
                Abbrechen
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card title="Lebensmittel">
        {liste.length === 0 ? (
          <p className="text-text-muted">Noch keine Lebensmittel angelegt.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-2 pr-3 font-normal">Name</th>
                <th className="py-2 pr-3 text-right font-normal">
                  kcal / 100 g
                </th>
                <th className="py-2 pr-3 text-right font-normal">
                  Eiweiß / 100 g
                </th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-2 pr-3">{l.name}</td>
                  <td className="py-2 pr-3 text-right tabular">
                    {formatKcal(l.kcal_pro_100g)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular">
                    {formatGramm(l.eiweiss_dg_pro_100g)} g
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end gap-2">
                      <Button onClick={() => bearbeiten(l)}>Bearbeiten</Button>
                      <Button
                        variant="danger"
                        onClick={() => loeschen(l)}
                        title={
                          (l.eintrag_anzahl ?? 0) > 0
                            ? `Wird von ${l.eintrag_anzahl} Eintrag/Einträgen verwendet`
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
        )}
      </Card>
    </div>
  );
}
