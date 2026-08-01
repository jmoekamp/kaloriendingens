import { useEffect, useState } from 'react';
import type {
  Abnehmziel,
  AuthUser,
  Geschlecht,
  GesamtumsatzModus,
  KoerperdatenAnsicht,
  UmsatzFormel,
  BmiFormel,
  Vorgabe,
  ZielTyp,
} from '../../shared/types.ts';
import {
  Banner,
  Button,
  Card,
  Field,
  Select,
  TextInput,
} from '../components/ui.tsx';
import {
  benoetigtesDefizitKcal,
  formatGramm,
  formatKcal,
  formatKg,
  parseGanzzahl,
  parseGrammToDg,
  parseKgToGramm,
} from '../../shared/naehrwerte.ts';
import {
  AKTIVITAETSSTUFEN,
  gesamtumsatzBerechnet,
  gesamtumsatzKatch,
} from '../../shared/umsatz.ts';
import { formatDatum, heuteIso, vorMonaten } from '../lib/format.ts';
import { vorgabenApi } from '../lib/vorgaben.ts';
import { koerperdatenApi } from '../lib/koerperdaten.ts';
import { abnehmzieleApi } from '../lib/abnehmziele.ts';
import { eintraegeApi } from '../lib/eintraege.ts';
import { authApi } from '../lib/auth.ts';
import { useSpaltenWahl } from '../components/SpaltenWahl.tsx';

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
  const [koerper, setKoerper] = useState<KoerperdatenAnsicht | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const swVorgaben = useSpaltenWahl('vorgaben-verlauf', [
    { key: 'gueltig_ab', label: 'gültig ab' },
    { key: 'kcal_ziel', label: 'Kalorienziel' },
    { key: 'eiweiss_ziel', label: 'Eiweißziel' },
    { key: 'gesamtumsatz', label: 'Gesamtumsatz' },
  ]);

  function laden() {
    vorgabenApi
      .list()
      .then((vs) => {
        setVersionen(vs);
        setForm((f) => f ?? neuerForm(vs));
      })
      .catch((e) => setFehler(meldung(e)));
    koerperdatenApi
      .get()
      .then(setKoerper)
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

              {koerper?.modus === 'berechnet' ? (
                <p className="text-sm text-text-muted">
                  Gesamtumsatz wird aus den Körperdaten berechnet (siehe Karte
                  „Körperdaten & Gesamtumsatz"). Das manuelle Feld ist deshalb
                  ausgeblendet.
                </p>
              ) : (
                <Field label="Gesamtumsatz (kcal/Tag)">
                  <TextInput
                    className="w-48 tabular"
                    value={form.gesamtumsatz}
                    onChange={(e) => set('gesamtumsatz', e.target.value)}
                    inputMode="numeric"
                    placeholder="z. B. 2400"
                  />
                </Field>
              )}

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
              <>
                {swVorgaben.auswahl}
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-text-muted">
                      {swVorgaben.sichtbar('gueltig_ab') && (
                        <th className="py-2 pr-3 font-normal">gültig ab</th>
                      )}
                      {swVorgaben.sichtbar('kcal_ziel') && (
                        <th className="py-2 pr-3 text-right font-normal">
                          Kalorienziel
                        </th>
                      )}
                      {swVorgaben.sichtbar('eiweiss_ziel') && (
                        <th className="py-2 pr-3 text-right font-normal">
                          Eiweißziel
                        </th>
                      )}
                      {swVorgaben.sichtbar('gesamtumsatz') && (
                        <th className="py-2 pr-3 text-right font-normal">
                          Gesamtumsatz
                        </th>
                      )}
                      <th className="py-2 font-normal"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionen.map((v) => (
                      <tr key={v.id} className="border-b border-border/50">
                        {swVorgaben.sichtbar('gueltig_ab') && (
                          <td className="py-2 pr-3 tabular">
                            {formatDatum(v.gueltig_ab)}
                          </td>
                        )}
                        {swVorgaben.sichtbar('kcal_ziel') && (
                          <td className="py-2 pr-3 text-right tabular">
                            {zielText(
                              v.kcal_ziel,
                              v.kcal_ziel_typ,
                              (n) => `${formatKcal(n)} kcal`,
                            )}
                          </td>
                        )}
                        {swVorgaben.sichtbar('eiweiss_ziel') && (
                          <td className="py-2 pr-3 text-right tabular">
                            {zielText(
                              v.eiweiss_ziel_dg,
                              v.eiweiss_ziel_typ,
                              (n) => `${formatGramm(n)} g`,
                            )}
                          </td>
                        )}
                        {swVorgaben.sichtbar('gesamtumsatz') && (
                          <td className="py-2 pr-3 text-right tabular">
                            {v.gesamtumsatz === 0
                              ? '—'
                              : `${formatKcal(v.gesamtumsatz)} kcal`}
                          </td>
                        )}
                        <td className="py-2">
                          <div className="flex justify-end gap-2">
                            <Button onClick={() => bearbeiten(v)}>
                              Bearbeiten
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => loeschen(v)}
                            >
                              Löschen
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Card>
        </>
      )}

      {!istAdmin && koerper && (
        <KoerperdatenKarte initial={koerper} onGespeichert={setKoerper} />
      )}

      {!istAdmin && <AbnehmzielKarte />}

      {!istAdmin && <GegessenMigrationsKarte />}

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

/** Karte für Körperdaten + Modus (manuell/berechnet) mit Live-Vorschau. */
function KoerperdatenKarte({
  initial,
  onGespeichert,
}: {
  initial: KoerperdatenAnsicht;
  onGespeichert: (k: KoerperdatenAnsicht) => void;
}) {
  const [modus, setModus] = useState<GesamtumsatzModus>(initial.modus);
  const [formel, setFormel] = useState<UmsatzFormel>(initial.formel);
  const [bmiFormel, setBmiFormel] = useState<BmiFormel>(initial.bmi_formel);
  const [groesse, setGroesse] = useState(
    initial.groesse_cm === 0 ? '' : String(initial.groesse_cm),
  );
  const [geschlecht, setGeschlecht] = useState<Geschlecht>(initial.geschlecht);
  const [geburtsjahr, setGeburtsjahr] = useState(
    initial.geburtsjahr === 0 ? '' : String(initial.geburtsjahr),
  );
  const [faktor, setFaktor] = useState(String(initial.aktivitaetsfaktor));
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  const groesseNum = parseGanzzahl(groesse);
  const jahrNum = parseGanzzahl(geburtsjahr);
  const faktorNum = Number(faktor);
  const gewicht = initial.aktuelles_gewicht_gramm;
  const fettPromille = initial.aktueller_fett_promille;
  const vollstaendig =
    groesseNum !== null && groesseNum > 0 && jahrNum !== null && jahrNum > 0;
  // Vorschau: Katch-McArdle, wenn gewaehlt und ein Fettwert vorliegt; sonst
  // Mifflin-St Jeor (entspricht dem Fallback der Auswertung).
  const katchAktiv = formel === 'katch' && fettPromille !== null;
  const vorschau =
    gewicht !== null && Number.isFinite(faktorNum)
      ? katchAktiv
        ? gesamtumsatzKatch(gewicht, fettPromille, faktorNum)
        : vollstaendig
          ? gesamtumsatzBerechnet(
              gewicht,
              groesseNum as number,
              new Date().getFullYear() - (jahrNum as number),
              geschlecht,
              faktorNum,
            )
          : null
      : null;

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setOk(false);
    if (modus === 'berechnet' && formel === 'mifflin') {
      if (groesseNum === null || groesseNum <= 0) {
        setFehler('Bitte Größe (cm) eingeben.');
        return;
      }
      if (jahrNum === null || jahrNum <= 0) {
        setFehler('Bitte Geburtsjahr eingeben.');
        return;
      }
    }
    setSpeichert(true);
    try {
      const k = await koerperdatenApi.update({
        modus,
        formel,
        bmi_formel: bmiFormel,
        groesse_cm: groesseNum ?? 0,
        geschlecht,
        geburtsjahr: jahrNum ?? 0,
        aktivitaetsfaktor: faktorNum,
      });
      onGespeichert(k);
      setOk(true);
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setSpeichert(false);
    }
  }

  return (
    <Card title="Körperdaten & Gesamtumsatz">
      <form onSubmit={speichern} className="flex flex-col gap-4">
        {fehler && (
          <Banner kind="error" onClose={() => setFehler(null)}>
            {fehler}
          </Banner>
        )}
        {ok && (
          <Banner kind="success" onClose={() => setOk(false)}>
            Körperdaten gespeichert.
          </Banner>
        )}
        <Field label="Gesamtumsatz">
          <Select
            className="w-72"
            value={modus}
            onChange={(e) => setModus(e.target.value as GesamtumsatzModus)}
          >
            <option value="manuell">manuell (Wert je Vorgabe eintragen)</option>
            <option value="berechnet">
              berechnet (aus Körperdaten + Gewicht)
            </option>
          </Select>
        </Field>

        {modus === 'berechnet' && (
          <>
            <Field label="Formel">
              <Select
                className="w-72"
                value={formel}
                onChange={(e) => setFormel(e.target.value as UmsatzFormel)}
              >
                <option value="mifflin">
                  Mifflin-St Jeor (Größe, Alter, Geschlecht)
                </option>
                <option value="katch">
                  Katch-McArdle (Magermasse aus Fettanteil)
                </option>
              </Select>
            </Field>
            {formel === 'katch' && (
              <p className="text-sm text-text-muted">
                Katch-McArdle rechnet mit der Magermasse: Gewicht × (1 −
                Fettanteil). Der Fettanteil wird bei den Tagesgewichten erfasst
                und gilt tageweise fort (Carry-forward). An Tagen ohne jeglichen
                Fettwert fällt die Berechnung auf Mifflin-St Jeor zurück.
                {fettPromille === null &&
                  ' Bisher ist noch KEIN Fettanteil erfasst.'}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Größe (cm)">
                <TextInput
                  className="tabular"
                  value={groesse}
                  onChange={(e) => setGroesse(e.target.value)}
                  inputMode="numeric"
                  placeholder="z. B. 180"
                />
              </Field>
              <Field label="Geschlecht">
                <Select
                  value={geschlecht}
                  onChange={(e) => setGeschlecht(e.target.value as Geschlecht)}
                >
                  <option value="m">männlich</option>
                  <option value="w">weiblich</option>
                </Select>
              </Field>
              <Field label="Geburtsjahr">
                <TextInput
                  className="tabular"
                  value={geburtsjahr}
                  onChange={(e) => setGeburtsjahr(e.target.value)}
                  inputMode="numeric"
                  placeholder="z. B. 1985"
                />
              </Field>
              <Field label="Aktivität">
                <Select
                  value={faktor}
                  onChange={(e) => setFaktor(e.target.value)}
                >
                  {AKTIVITAETSSTUFEN.map((s) => (
                    <option key={s.faktor} value={s.faktor}>
                      PAL {s.faktor.toFixed(1).replace('.', ',')} – {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="text-sm text-text-muted">
              {gewicht === null ? (
                'Noch kein Gewicht erfasst – trage ein Tagesgewicht ein, damit der Gesamtumsatz berechnet werden kann.'
              ) : vorschau !== null ? (
                <>
                  Aktuell berechneter Gesamtumsatz (
                  {katchAktiv ? 'Katch-McArdle' : 'Mifflin-St Jeor'}):{' '}
                  <span className="font-bold text-text">
                    {formatKcal(vorschau)} kcal/Tag
                  </span>{' '}
                  (bei {formatKg(gewicht)} kg
                  {katchAktiv && fettPromille !== null
                    ? `, ${formatGramm(fettPromille)} % Fett`
                    : ''}
                  ). Für die Auswertung zählt je Tag das an dem Tag gültige
                  Gewicht.
                </>
              ) : (
                'Bitte Größe und Geburtsjahr ausfüllen.'
              )}
            </p>
          </>
        )}

        <Field label="BMI-Formel (für den BMI-25-Meilenstein)">
          <Select
            className="w-72"
            value={bmiFormel}
            onChange={(e) => setBmiFormel(e.target.value as BmiFormel)}
          >
            <option value="standard">Standard (WHO: kg / m²)</option>
            <option value="trefethen">
              Trefethen-Korrektur (1,3 · kg / m^2,5)
            </option>
          </Select>
        </Field>
        <p className="text-sm text-text-muted">
          Bestimmt, bei welchem Gewicht der „(BMI 25)"-Meilenstein liegt. Die
          Trefethen-Korrektur gleicht aus, dass der klassische BMI große
          Menschen zu dick und kleine zu dünn rechnet. Braucht die Größe (cm).
        </p>

        <div>
          <Button type="submit" variant="primary" disabled={speichert}>
            {speichert ? 'Speichert …' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Karte für das Abnehmziel (Gewicht ab Stichtag; nötiges Defizit = kg × 7000). */
function AbnehmzielKarte() {
  const [liste, setListe] = useState<Abnehmziel[]>([]);
  const [kg, setKg] = useState('');
  const [gueltigAb, setGueltigAb] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const sw = useSpaltenWahl('abnehmziele', [
    { key: 'gueltig_ab', label: 'gültig ab' },
    { key: 'abnehmen', label: 'Abnehmen' },
    { key: 'defizit', label: 'nötiges Defizit' },
  ]);
  const [ok, setOk] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  function laden() {
    abnehmzieleApi
      .list()
      .then((vs) => {
        setListe(vs);
        // Erstes Ziel: Startdatum einen Monat in der Vergangenheit; sonst heute.
        setGueltigAb(
          (prev) => prev || (vs.length === 0 ? vorMonaten(1) : heuteIso()),
        );
      })
      .catch((e) => setFehler(meldung(e)));
  }
  useEffect(laden, []);

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setOk(false);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(gueltigAb)) {
      setFehler('Bitte ein gültiges „gültig ab"-Datum wählen.');
      return;
    }
    const gramm = parseKgToGramm(kg);
    if (gramm === null) {
      setFehler('Bitte ein Abnehmziel in kg eingeben (größer als 0, z. B. 5).');
      return;
    }
    setSpeichert(true);
    try {
      await abnehmzieleApi.save({ gueltig_ab: gueltigAb, ziel_gramm: gramm });
      setKg('');
      setOk(true);
      laden();
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setSpeichert(false);
    }
  }

  async function loeschen(z: Abnehmziel) {
    if (
      !confirm(`Abnehmziel ab ${formatDatum(z.gueltig_ab)} wirklich löschen?`)
    )
      return;
    setFehler(null);
    try {
      await abnehmzieleApi.remove(z.id);
      laden();
    } catch (err) {
      setFehler(meldung(err));
    }
  }

  return (
    <Card title="Abnehmziel">
      <p className="mb-3 text-sm text-text-muted">
        Wieviel Gewicht möchtest du abnehmen? Das nötige Gesamtdefizit ergibt
        sich aus <strong>Gewicht × 7000 kcal/kg</strong>. Das Ziel gilt ab dem
        Stichtag; der Fortschritt wird auf der Auswertungsseite angezeigt.
      </p>
      <form
        onSubmit={speichern}
        className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-3"
      >
        {fehler && (
          <div className="sm:col-span-3">
            <Banner kind="error" onClose={() => setFehler(null)}>
              {fehler}
            </Banner>
          </div>
        )}
        {ok && (
          <div className="sm:col-span-3">
            <Banner kind="success" onClose={() => setOk(false)}>
              Abnehmziel gespeichert.
            </Banner>
          </div>
        )}
        <Field label="Abnehmen (kg)">
          <TextInput
            className="tabular"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            inputMode="decimal"
            placeholder="z. B. 5"
          />
        </Field>
        <Field label="gültig ab">
          <TextInput
            type="date"
            value={gueltigAb}
            onChange={(e) => e.target.value && setGueltigAb(e.target.value)}
            className="tabular"
          />
        </Field>
        <Button type="submit" variant="primary" disabled={speichert}>
          {speichert ? 'Speichert …' : 'Speichern'}
        </Button>
      </form>

      {liste.length > 0 && (
        <>
          {sw.auswahl}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                {sw.sichtbar('gueltig_ab') && (
                  <th className="py-2 pr-3 font-normal">gültig ab</th>
                )}
                {sw.sichtbar('abnehmen') && (
                  <th className="py-2 pr-3 text-right font-normal">Abnehmen</th>
                )}
                {sw.sichtbar('defizit') && (
                  <th className="py-2 pr-3 text-right font-normal">
                    nötiges Defizit
                  </th>
                )}
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((z) => (
                <tr key={z.id} className="border-b border-border/50">
                  {sw.sichtbar('gueltig_ab') && (
                    <td className="py-2 pr-3 tabular">
                      {formatDatum(z.gueltig_ab)}
                    </td>
                  )}
                  {sw.sichtbar('abnehmen') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatKg(z.ziel_gramm)} kg
                    </td>
                  )}
                  {sw.sichtbar('defizit') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatKcal(benoetigtesDefizitKcal(z.ziel_gramm))} kcal
                    </td>
                  )}
                  <td className="py-2 text-right">
                    <Button variant="danger" onClick={() => loeschen(z)}>
                      Löschen
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

/**
 * Karte für die einmalige „gegessen"-Migration: markiert alle Mahlzeiten bis
 * einschließlich gestern als gegessen, damit Bestandsdaten weiter in der
 * Statistik zählen (neu ist die Zählung an das „gegessen"-Häkchen gebunden).
 */
function GegessenMigrationsKarte() {
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function migrieren() {
    if (
      !confirm(
        'Alle bis einschließlich gestern erfassten Mahlzeiten als „gegessen" markieren?',
      )
    )
      return;
    setFehler(null);
    setErgebnis(null);
    setLaeuft(true);
    try {
      const r = await eintraegeApi.migriereGegessen();
      setErgebnis(
        `${r.anzahl} Mahlzeit(en) bis ${formatDatum(r.bis)} als gegessen markiert.`,
      );
    } catch (e) {
      setFehler(meldung(e));
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <Card title="Mahlzeiten als gegessen markieren">
      <p className="mb-3 text-sm text-text-muted">
        Neu zählen nur als <strong>gegessen</strong> markierte Mahlzeiten in
        Summen, Ziele und das Defizit. Dieser Knopf markiert einmalig alle bis
        einschließlich <strong>gestern</strong> erfassten Mahlzeiten als
        gegessen, sodass bestehende Daten weiterhin gezählt werden. Der heutige
        Tag bleibt unberührt.
      </p>
      {fehler && (
        <div className="mb-3">
          <Banner kind="error" onClose={() => setFehler(null)}>
            {fehler}
          </Banner>
        </div>
      )}
      {ergebnis && (
        <div className="mb-3">
          <Banner kind="success" onClose={() => setErgebnis(null)}>
            {ergebnis}
          </Banner>
        </div>
      )}
      <Button variant="primary" onClick={migrieren} disabled={laeuft}>
        {laeuft ? 'Markiert …' : 'Alle bis gestern als gegessen markieren'}
      </Button>
    </Card>
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
        <Field label="Neues Passwort (min. 8 Zeichen)">
          <TextInput
            type="password"
            value={neu}
            onChange={(e) => setNeu(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Field label="Neues Passwort (Wiederholung)">
          <TextInput
            type="password"
            value={neu2}
            onChange={(e) => setNeu2(e.target.value)}
            autoComplete="new-password"
            minLength={8}
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
