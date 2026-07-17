import { useEffect, useState } from 'react';
import type { Lebensmittel } from '../../shared/types.ts';
import { Banner, Button, Card, Field, TextInput } from '../components/ui.tsx';
import {
  eiweissProKcal,
  formatDezimal,
  formatGramm,
  formatKcal,
  grammProGrammEiweiss,
  grammProKcal,
  parseGanzzahl,
  parseGrammToDg,
} from '../../shared/naehrwerte.ts';

/** Formatiert eine optionale Kennzahl; null -> Gedankenstrich. */
function fmtOderStrich(n: number | null): string {
  return n === null ? '—' : formatDezimal(n);
}
import { lebensmittelApi } from '../lib/lebensmittel.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

const LEER = { name: '', kcal: '', eiweiss: '', packung: '' };

type SortKey =
  | 'name'
  | 'kcal'
  | 'eiweiss'
  | 'eiweiss_kcal'
  | 'g_kcal'
  | 'g_eiweiss'
  | 'packung';

/** Spaltendefinition der Lebensmittel-Tabelle (Reihenfolge = Anzeige). */
const SPALTEN: { key: SortKey; label: string; rechts: boolean }[] = [
  { key: 'name', label: 'Name', rechts: false },
  { key: 'kcal', label: 'kcal / 100 g', rechts: true },
  { key: 'eiweiss', label: 'Eiweiß / 100 g', rechts: true },
  { key: 'eiweiss_kcal', label: 'Eiweiß / kcal', rechts: true },
  { key: 'g_kcal', label: 'g / kcal', rechts: true },
  { key: 'g_eiweiss', label: 'g / g Eiweiß', rechts: true },
  { key: 'packung', label: 'Packung', rechts: true },
];

/** Sortierwert einer Zeile fuer eine Spalte (null = ans Ende). */
function sortWert(l: Lebensmittel, key: SortKey): number | string | null {
  switch (key) {
    case 'name':
      return l.name.toLowerCase();
    case 'kcal':
      return l.kcal_pro_100g;
    case 'eiweiss':
      return l.eiweiss_dg_pro_100g;
    case 'eiweiss_kcal':
      return eiweissProKcal(l.kcal_pro_100g, l.eiweiss_dg_pro_100g);
    case 'g_kcal':
      return grammProKcal(l.kcal_pro_100g);
    case 'g_eiweiss':
      return grammProGrammEiweiss(l.eiweiss_dg_pro_100g);
    case 'packung':
      return l.packung_gramm;
  }
}

/** Stammdaten: Lebensmittel anlegen, bearbeiten und loeschen (Werte je 100 g). */
export default function LebensmittelVerwaltung() {
  const [liste, setListe] = useState<Lebensmittel[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [form, setForm] = useState(LEER);
  const [bearbeitetId, setBearbeitetId] = useState<number | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  function sortiereNach(key: SortKey) {
    if (key === sortKey) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  // Nach der gewaehlten Spalte sortieren; null-Werte immer ans Ende.
  const sortiert = [...liste].sort((a, b) => {
    const va = sortWert(a, sortKey);
    const vb = sortWert(b, sortKey);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    const cmp =
      typeof va === 'string' && typeof vb === 'string'
        ? va.localeCompare(vb, 'de')
        : (va as number) - (vb as number);
    return sortAsc ? cmp : -cmp;
  });

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
      packung: l.packung_gramm == null ? '' : String(l.packung_gramm),
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
    const packung =
      form.packung.trim() === '' ? null : parseGanzzahl(form.packung);
    if (packung === null && form.packung.trim() !== '') {
      setFehler('Packungsgröße muss eine ganze Zahl > 0 sein (oder leer).');
      return;
    }
    const input = {
      name: form.name.trim(),
      kcal_pro_100g: kcal,
      eiweiss_dg_pro_100g: eiweissDg,
      packung_gramm: packung,
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
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5"
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
          <Field label="Packungsgröße (g, optional)">
            <TextInput
              className="tabular"
              value={form.packung}
              onChange={(e) => set('packung', e.target.value)}
              inputMode="numeric"
              placeholder="z. B. 500"
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
                {SPALTEN.map((s) => (
                  <th
                    key={s.key}
                    className={`py-2 pr-3 font-normal ${s.rechts ? 'text-right' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => sortiereNach(s.key)}
                      className={`inline-flex items-center gap-1 hover:text-text ${
                        s.rechts ? 'flex-row-reverse' : ''
                      } ${sortKey === s.key ? 'text-text' : ''}`}
                      title="Nach dieser Spalte sortieren"
                    >
                      {s.label}
                      <span className="text-[10px]">
                        {sortKey === s.key ? (sortAsc ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {sortiert.map((l) => (
                <tr key={l.id} className="border-b border-border/50">
                  <td className="py-2 pr-3">{l.name}</td>
                  <td className="py-2 pr-3 text-right tabular">
                    {formatKcal(l.kcal_pro_100g)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular">
                    {formatGramm(l.eiweiss_dg_pro_100g)} g
                  </td>
                  <td className="py-2 pr-3 text-right tabular text-text-muted">
                    {fmtOderStrich(
                      eiweissProKcal(l.kcal_pro_100g, l.eiweiss_dg_pro_100g),
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular text-text-muted">
                    {fmtOderStrich(grammProKcal(l.kcal_pro_100g))}
                  </td>
                  <td className="py-2 pr-3 text-right tabular text-text-muted">
                    {fmtOderStrich(grammProGrammEiweiss(l.eiweiss_dg_pro_100g))}
                  </td>
                  <td className="py-2 pr-3 text-right tabular">
                    {l.packung_gramm == null ? '—' : `${l.packung_gramm} g`}
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
