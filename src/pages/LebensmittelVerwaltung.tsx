import { useEffect, useState } from 'react';
import type { Lebensmittel, OffTreffer } from '../../shared/types.ts';
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
  portionKcal,
} from '../../shared/naehrwerte.ts';

/** Formatiert eine optionale Kennzahl; null -> Gedankenstrich. */
function fmtOderStrich(n: number | null): string {
  return n === null ? '—' : formatDezimal(n);
}
import { lebensmittelApi } from '../lib/lebensmittel.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

const LEER = {
  name: '',
  kcal: '',
  eiweiss: '',
  fett: '',
  kh: '',
  ballast: '',
  packung: '',
  bestand: '',
};

type SortKey =
  | 'name'
  | 'kcal'
  | 'eiweiss'
  | 'fett'
  | 'kh'
  | 'ballast'
  | 'eiweiss_kcal'
  | 'g_kcal'
  | 'g_eiweiss'
  | 'packung'
  | 'kcal_packung'
  | 'bestand';

/** kcal der ganzen Packung (null, wenn keine Packungsgroesse hinterlegt). */
function kcalGanzePackung(l: Lebensmittel): number | null {
  return l.packung_gramm == null
    ? null
    : portionKcal(l.kcal_pro_100g, l.packung_gramm);
}

/** Spaltendefinition der Lebensmittel-Tabelle (Reihenfolge = Anzeige). */
const SPALTEN: { key: SortKey; label: string; rechts: boolean }[] = [
  { key: 'name', label: 'Name', rechts: false },
  { key: 'kcal', label: 'kcal / 100 g', rechts: true },
  { key: 'eiweiss', label: 'Eiweiß / 100 g', rechts: true },
  { key: 'fett', label: 'Fett', rechts: true },
  { key: 'kh', label: 'KH', rechts: true },
  { key: 'ballast', label: 'Ballastst.', rechts: true },
  { key: 'eiweiss_kcal', label: 'Eiweiß / kcal', rechts: true },
  { key: 'g_kcal', label: 'g / kcal', rechts: true },
  { key: 'g_eiweiss', label: 'g / g Eiweiß', rechts: true },
  { key: 'packung', label: 'Packung', rechts: true },
  { key: 'kcal_packung', label: 'kcal / Packung', rechts: true },
  { key: 'bestand', label: 'Bestand', rechts: true },
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
    case 'fett':
      return l.fett_dg_pro_100g;
    case 'kh':
      return l.kohlenhydrate_dg_pro_100g;
    case 'ballast':
      return l.ballaststoffe_dg_pro_100g;
    case 'eiweiss_kcal':
      return eiweissProKcal(l.kcal_pro_100g, l.eiweiss_dg_pro_100g);
    case 'g_kcal':
      return grammProKcal(l.kcal_pro_100g);
    case 'g_eiweiss':
      return grammProGrammEiweiss(l.eiweiss_dg_pro_100g);
    case 'packung':
      return l.packung_gramm;
    case 'kcal_packung':
      return kcalGanzePackung(l);
    case 'bestand':
      return l.bestand_gramm;
  }
}

/**
 * Import aus Open Food Facts (Namenssuche, externer Dienst per Server-Proxy).
 * In sich geschlossen: haelt Suchbegriff, Treffer und Ladezustand selbst; ein
 * Treffer wird per „Übernehmen" ins Anlege-Formular gereicht.
 */
function OffImport({
  onUebernehmen,
}: {
  onUebernehmen: (t: OffTreffer) => void;
}) {
  const [q, setQ] = useState('');
  const [ean, setEan] = useState('');
  const [treffer, setTreffer] = useState<OffTreffer[]>([]);
  const [sucht, setSucht] = useState(false);
  const [suchtEan, setSuchtEan] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gesucht, setGesucht] = useState(false);

  async function suchen(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (q.trim() === '') return;
    setSucht(true);
    setGesucht(true);
    try {
      setTreffer(await lebensmittelApi.offSuche(q.trim()));
    } catch (err) {
      setTreffer([]);
      setFehler(meldung(err));
    } finally {
      setSucht(false);
    }
  }

  /** Einzelabruf per Barcode/EAN; das Ergebnis landet in der Trefferliste. */
  async function barcodeAbrufen(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    const code = ean.trim();
    if (!/^\d{8,14}$/.test(code)) {
      setFehler('Barcode/EAN muss aus 8–14 Ziffern bestehen.');
      return;
    }
    setSuchtEan(true);
    setGesucht(true);
    try {
      setTreffer([await lebensmittelApi.offProdukt(code)]);
    } catch (err) {
      setTreffer([]);
      setFehler(meldung(err));
    } finally {
      setSuchtEan(false);
    }
  }

  return (
    <Card title="Aus Open Food Facts importieren">
      <p className="mb-3 text-sm text-text-muted">
        Sucht Nährwerte online bei Open Food Facts – per Namenssuche oder
        präzise per Barcode/EAN. Hinweis: Dies ist der einzige Vorgang, bei dem
        die App nach außen kommuniziert (nur bei der Suche, nur lesend).
        Übernommene Werte lassen sich vor dem Speichern prüfen und anpassen.
      </p>
      <form onSubmit={suchen} className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Produktname / Suchbegriff">
          <TextInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="z. B. Magerquark"
            className="w-72"
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          disabled={sucht || q.trim() === ''}
        >
          {sucht ? 'Sucht …' : 'Suchen'}
        </Button>
      </form>
      <form
        onSubmit={barcodeAbrufen}
        className="mb-3 flex flex-wrap items-end gap-3"
      >
        <Field label="Barcode / EAN">
          <TextInput
            value={ean}
            onChange={(e) => setEan(e.target.value)}
            inputMode="numeric"
            placeholder="z. B. 4260428021766"
            className="w-72 tabular"
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          disabled={suchtEan || ean.trim() === ''}
        >
          {suchtEan ? 'Ruft ab …' : 'Barcode abrufen'}
        </Button>
      </form>
      {fehler && (
        <div className="mb-3">
          <Banner kind="error" onClose={() => setFehler(null)}>
            {fehler}
          </Banner>
        </div>
      )}
      {gesucht && !sucht && !fehler && treffer.length === 0 && (
        <p className="text-sm text-text-muted">Keine Treffer gefunden.</p>
      )}
      {treffer.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-2 pr-3 font-normal">Name</th>
              <th className="py-2 pr-3 text-right font-normal">kcal / 100 g</th>
              <th className="py-2 pr-3 text-right font-normal">
                Eiweiß / 100 g
              </th>
              <th className="py-2 pr-3 text-right font-normal">Fett</th>
              <th className="py-2 pr-3 text-right font-normal">KH</th>
              <th className="py-2 pr-3 text-right font-normal">Ballastst.</th>
              <th className="py-2 pr-3 text-right font-normal">Packung</th>
              <th className="py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {treffer.map((t, i) => (
              <tr key={`${t.code}-${i}`} className="border-b border-border/50">
                <td className="py-2 pr-3">{t.name}</td>
                <td className="py-2 pr-3 text-right tabular">
                  {t.kcal_pro_100g === null ? '—' : formatKcal(t.kcal_pro_100g)}
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {t.eiweiss_dg_pro_100g === null
                    ? '—'
                    : `${formatGramm(t.eiweiss_dg_pro_100g)} g`}
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {t.fett_dg_pro_100g === null
                    ? '—'
                    : `${formatGramm(t.fett_dg_pro_100g)} g`}
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {t.kohlenhydrate_dg_pro_100g === null
                    ? '—'
                    : `${formatGramm(t.kohlenhydrate_dg_pro_100g)} g`}
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {t.ballaststoffe_dg_pro_100g === null
                    ? '—'
                    : `${formatGramm(t.ballaststoffe_dg_pro_100g)} g`}
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {t.packung_gramm === null ? '—' : `${t.packung_gramm} g`}
                </td>
                <td className="py-2 text-right">
                  <Button onClick={() => onUebernehmen(t)}>Übernehmen</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/** Stammdaten: Lebensmittel anlegen, bearbeiten und loeschen (Werte je 100 g). */
export default function LebensmittelVerwaltung() {
  const [liste, setListe] = useState<Lebensmittel[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [form, setForm] = useState(LEER);
  const [packAnzahl, setPackAnzahl] = useState('');
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

  /** Eingabehilfe: Bestand = Anzahl Packungen × Packungsgroesse (g). */
  function bestandAusPackungen() {
    setFehler(null);
    const anzahl = parseGanzzahl(packAnzahl);
    const packung = parseGanzzahl(form.packung);
    if (anzahl === null || anzahl <= 0) {
      setFehler('Bitte eine Packungsanzahl > 0 eingeben.');
      return;
    }
    if (packung === null || packung <= 0) {
      setFehler('Für die Eingabehilfe zuerst die Packungsgröße (g) ausfüllen.');
      return;
    }
    set('bestand', String(anzahl * packung));
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
      fett: l.fett_dg_pro_100g == null ? '' : formatGramm(l.fett_dg_pro_100g),
      kh:
        l.kohlenhydrate_dg_pro_100g == null
          ? ''
          : formatGramm(l.kohlenhydrate_dg_pro_100g),
      ballast:
        l.ballaststoffe_dg_pro_100g == null
          ? ''
          : formatGramm(l.ballaststoffe_dg_pro_100g),
      packung: l.packung_gramm == null ? '' : String(l.packung_gramm),
      bestand: l.bestand_gramm == null ? '' : String(l.bestand_gramm),
    });
    setHinweis(null);
    setFehler(null);
  }

  /**
   * Werte eines OFF-Treffers ins Formular uebernehmen (zum Pruefen). Es werden
   * NUR leere Felder gefuellt – bereits eingegebene bzw. beim Bearbeiten
   * vorhandene Werte bleiben unveraendert (auch der Bearbeiten-Modus bleibt
   * erhalten).
   */
  function offUebernehmen(t: OffTreffer) {
    // Bestehenden (nicht-leeren) Formularwert behalten, sonst OFF-Wert setzen.
    const oderOff = (aktuell: string, off: string) =>
      aktuell.trim() !== '' ? aktuell : off;
    setForm((f) => ({
      name: oderOff(f.name, t.name),
      kcal: oderOff(
        f.kcal,
        t.kcal_pro_100g === null ? '' : String(t.kcal_pro_100g),
      ),
      eiweiss: oderOff(
        f.eiweiss,
        t.eiweiss_dg_pro_100g === null
          ? ''
          : formatGramm(t.eiweiss_dg_pro_100g),
      ),
      fett: oderOff(
        f.fett,
        t.fett_dg_pro_100g === null ? '' : formatGramm(t.fett_dg_pro_100g),
      ),
      kh: oderOff(
        f.kh,
        t.kohlenhydrate_dg_pro_100g === null
          ? ''
          : formatGramm(t.kohlenhydrate_dg_pro_100g),
      ),
      ballast: oderOff(
        f.ballast,
        t.ballaststoffe_dg_pro_100g === null
          ? ''
          : formatGramm(t.ballaststoffe_dg_pro_100g),
      ),
      packung: oderOff(
        f.packung,
        t.packung_gramm === null ? '' : String(t.packung_gramm),
      ),
      bestand: f.bestand,
    }));
    setFehler(null);
    setHinweis(
      `„${t.name}" aus Open Food Facts übernommen – nur leere Felder wurden gefüllt; bitte prüfen und speichern.`,
    );
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
    // Optionale Naehrwerte: leer = nicht erfasst, sonst Gramm-Zahl >= 0.
    const optionalDg = (
      eingabe: string,
      label: string,
    ): { ok: boolean; wert: number | null } => {
      if (eingabe.trim() === '') return { ok: true, wert: null };
      const dg = parseGrammToDg(eingabe);
      if (dg === null) {
        setFehler(`${label} je 100 g muss eine Zahl ≥ 0 sein (z. B. 3,2).`);
        return { ok: false, wert: null };
      }
      return { ok: true, wert: dg };
    };
    const fett = optionalDg(form.fett, 'Fett');
    if (!fett.ok) return;
    const kh = optionalDg(form.kh, 'Kohlenhydrate');
    if (!kh.ok) return;
    const ballast = optionalDg(form.ballast, 'Ballaststoffe');
    if (!ballast.ok) return;
    const packung =
      form.packung.trim() === '' ? null : parseGanzzahl(form.packung);
    if (packung === null && form.packung.trim() !== '') {
      setFehler('Packungsgröße muss eine ganze Zahl > 0 sein (oder leer).');
      return;
    }
    // Bestand: leer = wird nicht gefuehrt. Ein durch Essen negativ gewordener
    // Wert darf unveraendert wieder gespeichert werden (Number statt
    // parseGanzzahl), neue negative Eingaben weist das Backend ab.
    const bestand =
      form.bestand.trim() === '' ? null : Number(form.bestand.trim());
    if (bestand !== null && !Number.isInteger(bestand)) {
      setFehler('Bestand muss eine ganze Zahl (g) sein – oder leer.');
      return;
    }
    const input = {
      name: form.name.trim(),
      kcal_pro_100g: kcal,
      eiweiss_dg_pro_100g: eiweissDg,
      fett_dg_pro_100g: fett.wert,
      kohlenhydrate_dg_pro_100g: kh.wert,
      ballaststoffe_dg_pro_100g: ballast.wert,
      packung_gramm: packung,
      bestand_gramm: bestand,
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

      <OffImport onUebernehmen={offUebernehmen} />

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
          <Field label="Fett je 100 g (g, optional)">
            <TextInput
              className="tabular"
              value={form.fett}
              onChange={(e) => set('fett', e.target.value)}
              inputMode="decimal"
              placeholder="z. B. 3,2"
            />
          </Field>
          <Field label="Kohlenhydrate je 100 g (g, optional)">
            <TextInput
              className="tabular"
              value={form.kh}
              onChange={(e) => set('kh', e.target.value)}
              inputMode="decimal"
              placeholder="z. B. 4,1"
            />
          </Field>
          <Field label="Ballaststoffe je 100 g (g, optional)">
            <TextInput
              className="tabular"
              value={form.ballast}
              onChange={(e) => set('ballast', e.target.value)}
              inputMode="decimal"
              placeholder="z. B. 1,0"
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
          <div className="flex flex-col gap-1">
            <Field label="Bestand (g, optional)">
              <TextInput
                className="tabular"
                value={form.bestand}
                onChange={(e) => set('bestand', e.target.value)}
                inputMode="numeric"
                placeholder="z. B. 1500"
              />
            </Field>
            <div className="flex items-center gap-1 text-xs text-text-muted">
              <TextInput
                className="w-14 tabular"
                value={packAnzahl}
                onChange={(e) => setPackAnzahl(e.target.value)}
                inputMode="numeric"
                placeholder="3"
                title="Anzahl Packungen"
              />
              <span>×</span>
              <span className="tabular">
                {form.packung.trim() === '' ? 'Packung?' : `${form.packung} g`}
              </span>
              <button
                type="button"
                onClick={bestandAusPackungen}
                className="text-accent hover:underline"
                title="Bestand = Anzahl × Packungsgröße übernehmen"
              >
                = übernehmen
              </button>
            </div>
          </div>
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
        <p className="mt-3 text-xs text-text-muted">
          Wird ein Bestand geführt, zieht das Ankreuzen von „gegessen" die Menge
          automatisch ab (Abwählen/Löschen bucht zurück). Leer = kein Bestand.
        </p>
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
                  <td className="py-2 pr-3 text-right tabular">
                    {l.fett_dg_pro_100g == null
                      ? '—'
                      : `${formatGramm(l.fett_dg_pro_100g)} g`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular">
                    {l.kohlenhydrate_dg_pro_100g == null
                      ? '—'
                      : `${formatGramm(l.kohlenhydrate_dg_pro_100g)} g`}
                  </td>
                  <td className="py-2 pr-3 text-right tabular">
                    {l.ballaststoffe_dg_pro_100g == null
                      ? '—'
                      : `${formatGramm(l.ballaststoffe_dg_pro_100g)} g`}
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
                  <td className="py-2 pr-3 text-right tabular">
                    {kcalGanzePackung(l) === null
                      ? '—'
                      : formatKcal(kcalGanzePackung(l) as number)}
                  </td>
                  <td
                    className={`py-2 pr-3 text-right tabular ${
                      l.bestand_gramm !== null && l.bestand_gramm < 0
                        ? 'text-danger'
                        : ''
                    }`}
                    title={
                      l.bestand_gramm !== null &&
                      l.packung_gramm != null &&
                      l.packung_gramm > 0
                        ? `≈ ${formatDezimal(l.bestand_gramm / l.packung_gramm, 1)} Packung(en)`
                        : undefined
                    }
                  >
                    {l.bestand_gramm === null ? '—' : `${l.bestand_gramm} g`}
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
