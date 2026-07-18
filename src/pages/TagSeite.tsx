import { useCallback, useEffect, useState } from 'react';
import type {
  Bewegung,
  Eintrag,
  Lebensmittel,
  TagesAuswertung,
  Zielbewertung,
} from '../../shared/types.ts';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Field,
  Select,
  TextInput,
} from '../components/ui.tsx';
import {
  formatGramm,
  formatKcal,
  formatKg,
  parseKgToGramm,
} from '../../shared/naehrwerte.ts';
import {
  formatDatum,
  heuteIso,
  jetztUhrzeit,
  verschiebeDatum,
} from '../lib/format.ts';
import { auswertungApi } from '../lib/auswertung.ts';
import { eintraegeApi } from '../lib/eintraege.ts';
import { bewegungApi } from '../lib/bewegung.ts';
import { gewichtApi } from '../lib/gewicht.ts';
import { lebensmittelApi } from '../lib/lebensmittel.ts';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

/** Zeigt Summe + Zielbewertung fuer kcal bzw. Eiweiss. */
function Zielanzeige({
  titel,
  bewertung,
  format,
  einheit,
}: {
  titel: string;
  bewertung: Zielbewertung;
  format: (n: number) => string;
  einheit: string;
}) {
  const { summe, ziel, typ, abweichung, erfuellt, hat_ziel } = bewertung;
  const farbe = !hat_ziel
    ? 'text-text'
    : erfuellt
      ? 'text-success'
      : 'text-danger';
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="text-sm text-text-muted">{titel}</div>
      <div className={`text-2xl font-bold tabular ${farbe}`}>
        {format(summe)} {einheit}
      </div>
      {hat_ziel ? (
        <div className="mt-1 text-sm text-text-muted">
          Ziel {typ === 'max' ? '≤' : '≥'} {format(ziel)} {einheit} ·{' '}
          {abweichung === 0
            ? 'genau erreicht'
            : abweichung > 0
              ? `${format(abweichung)} ${einheit} über Ziel`
              : `${format(-abweichung)} ${einheit} unter Ziel`}
          {erfuellt ? ' · ✓ erfüllt' : ' · ✗ verfehlt'}
        </div>
      ) : (
        <div className="mt-1 text-sm text-text-muted">Kein Ziel gesetzt.</div>
      )}
    </div>
  );
}

export default function TagSeite({
  datum,
  setDatum,
}: {
  datum: string;
  setDatum: (d: string) => void;
}) {
  const [auswertung, setAuswertung] = useState<TagesAuswertung | null>(null);
  const [lebensmittel, setLebensmittel] = useState<Lebensmittel[]>([]);
  const [fehler, setFehler] = useState<string | null>(null);

  // Erfassungs-Formular
  const [uhrzeit, setUhrzeit] = useState(jetztUhrzeit());
  const [lmId, setLmId] = useState('');
  const [menge, setMenge] = useState('');
  const [speichert, setSpeichert] = useState(false);

  // Inline-Bearbeitung einer Mahlzeit (Uhrzeit + Menge)
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [editUhrzeit, setEditUhrzeit] = useState('');
  const [editMenge, setEditMenge] = useState('');

  const ladeTag = useCallback(() => {
    auswertungApi
      .tag(datum)
      .then(setAuswertung)
      .catch((e) => setFehler(meldung(e)));
  }, [datum]);

  useEffect(ladeTag, [ladeTag]);
  useEffect(() => {
    lebensmittelApi
      .list()
      .then(setLebensmittel)
      .catch((e) => setFehler(meldung(e)));
  }, []);

  async function hinzufuegen(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (lmId === '') {
      setFehler('Bitte ein Lebensmittel auswählen.');
      return;
    }
    const mengeZahl = Number(menge);
    if (!Number.isInteger(mengeZahl) || mengeZahl <= 0) {
      setFehler('Menge (g) muss eine positive ganze Zahl sein.');
      return;
    }
    setSpeichert(true);
    try {
      await eintraegeApi.create({
        datum,
        uhrzeit,
        lebensmittel_id: Number(lmId),
        menge_gramm: mengeZahl,
      });
      setMenge('');
      setUhrzeit(jetztUhrzeit());
      ladeTag();
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setSpeichert(false);
    }
  }

  async function loeschen(eintrag: Eintrag) {
    setFehler(null);
    try {
      await eintraegeApi.remove(eintrag.id);
      ladeTag();
    } catch (err) {
      setFehler(meldung(err));
    }
  }

  function bearbeitenStart(e: Eintrag) {
    setFehler(null);
    setBearbeiteId(e.id);
    setEditUhrzeit(e.uhrzeit);
    setEditMenge(String(e.menge_gramm));
  }

  async function bearbeitenSpeichern(e: Eintrag) {
    setFehler(null);
    const mengeZahl = Number(editMenge);
    if (!Number.isInteger(mengeZahl) || mengeZahl <= 0) {
      setFehler('Menge (g) muss eine positive ganze Zahl sein.');
      return;
    }
    try {
      await eintraegeApi.update(e.id, {
        datum,
        uhrzeit: editUhrzeit,
        lebensmittel_id: e.lebensmittel_id,
        menge_gramm: mengeZahl,
      });
      setBearbeiteId(null);
      ladeTag();
    } catch (err) {
      setFehler(meldung(err));
    }
  }

  const istHeute = datum === heuteIso();
  const istZukunft = datum > heuteIso();
  const gewaehltesLm = lebensmittel.find((l) => String(l.id) === lmId);

  return (
    <div className="flex flex-col gap-4">
      {fehler && (
        <Banner kind="error" onClose={() => setFehler(null)}>
          {fehler}
        </Banner>
      )}

      {/* Datumsnavigation */}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setDatum(verschiebeDatum(datum, -1))}>
          ◀ Vortag
        </Button>
        <TextInput
          type="date"
          value={datum}
          onChange={(e) => e.target.value && setDatum(e.target.value)}
          className="tabular"
        />
        <Button onClick={() => setDatum(verschiebeDatum(datum, 1))}>
          Folgetag ▶
        </Button>
        {!istHeute && (
          <Button variant="primary" onClick={() => setDatum(heuteIso())}>
            Heute
          </Button>
        )}
        <span className="ml-auto text-lg font-bold">
          {formatDatum(datum)}
          {istHeute && (
            <span className="ml-2 text-sm font-normal text-text-muted">
              (heute)
            </span>
          )}
          {istZukunft && (
            <span className="ml-2 text-sm font-normal text-warning">
              (geplant – zählt in keiner Statistik)
            </span>
          )}
        </span>
      </div>

      {/* Tagesgewicht */}
      <GewichtAbschnitt datum={datum} />

      {/* Erfassen */}
      <Card title="Gegessen erfassen">
        <form
          onSubmit={hinzufuegen}
          className="grid grid-cols-1 items-end gap-3 sm:grid-cols-4"
        >
          <Field label="Uhrzeit">
            <TextInput
              type="time"
              value={uhrzeit}
              onChange={(e) => setUhrzeit(e.target.value)}
              className="tabular"
              required
            />
          </Field>
          <Field label="Lebensmittel">
            <Select value={lmId} onChange={(e) => setLmId(e.target.value)}>
              <option value="">– auswählen –</option>
              {lebensmittel.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Menge (g)">
            <div className="flex flex-col gap-1">
              <TextInput
                className="tabular"
                value={menge}
                onChange={(e) => setMenge(e.target.value)}
                inputMode="numeric"
                placeholder="z. B. 150"
              />
              {gewaehltesLm?.packung_gramm != null && (
                <button
                  type="button"
                  onClick={() => setMenge(String(gewaehltesLm.packung_gramm))}
                  className="text-left text-xs text-accent hover:underline"
                >
                  ganze Packung ({gewaehltesLm.packung_gramm} g)
                </button>
              )}
            </div>
          </Field>
          <Button type="submit" variant="primary" disabled={speichert}>
            {speichert ? 'Fügt hinzu …' : 'Hinzufügen'}
          </Button>
        </form>
        {lebensmittel.length === 0 && (
          <p className="mt-3 text-sm text-text-muted">
            Noch keine Lebensmittel angelegt – lege sie zuerst unter
            „Lebensmittel" an.
          </p>
        )}
      </Card>

      {/* Tagessummen + Ziel */}
      {auswertung && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Zielanzeige
            titel="Kalorien"
            bewertung={auswertung.kcal}
            format={formatKcal}
            einheit="kcal"
          />
          <Zielanzeige
            titel="Eiweiß"
            bewertung={auswertung.eiweiss}
            format={formatGramm}
            einheit="g"
          />
        </div>
      )}

      {/* Eintraege des Tages */}
      <Card title="Mahlzeiten">
        {!auswertung || auswertung.eintraege.length === 0 ? (
          <p className="text-text-muted">Für diesen Tag ist nichts erfasst.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                <th className="py-2 pr-3 font-normal">Uhrzeit</th>
                <th className="py-2 pr-3 font-normal">Lebensmittel</th>
                <th className="py-2 pr-3 text-right font-normal">Menge</th>
                <th className="py-2 pr-3 text-right font-normal">kcal</th>
                <th className="py-2 pr-3 text-right font-normal">Eiweiß</th>
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {auswertung.eintraege.map((e) => {
                const imEdit = bearbeiteId === e.id;
                return (
                  <tr key={e.id} className="border-b border-border/50">
                    <td className="py-2 pr-3 tabular">
                      {imEdit ? (
                        <TextInput
                          type="time"
                          value={editUhrzeit}
                          onChange={(ev) => setEditUhrzeit(ev.target.value)}
                          className="w-28 tabular"
                        />
                      ) : (
                        e.uhrzeit
                      )}
                    </td>
                    <td className="py-2 pr-3">{e.lebensmittel_name}</td>
                    <td className="py-2 pr-3 text-right tabular">
                      {imEdit ? (
                        <TextInput
                          value={editMenge}
                          onChange={(ev) => setEditMenge(ev.target.value)}
                          inputMode="numeric"
                          className="w-24 tabular"
                        />
                      ) : (
                        `${e.menge_gramm} g`
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular">
                      {formatKcal(e.kcal ?? 0)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular">
                      {formatGramm(e.eiweiss_dg ?? 0)} g
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        {imEdit ? (
                          <>
                            <Button
                              variant="primary"
                              onClick={() => bearbeitenSpeichern(e)}
                            >
                              Speichern
                            </Button>
                            <Button onClick={() => setBearbeiteId(null)}>
                              Abbrechen
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button onClick={() => bearbeitenStart(e)}>
                              Bearbeiten
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => loeschen(e)}
                            >
                              Löschen
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border font-bold">
                <td className="py-2 pr-3" colSpan={2}>
                  Summe
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {auswertung.eintraege.reduce((s, e) => s + e.menge_gramm, 0)}{' '}
                  g
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {formatKcal(auswertung.summe_kcal)}
                </td>
                <td className="py-2 pr-3 text-right tabular">
                  {formatGramm(auswertung.summe_eiweiss_dg)} g
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      {/* Bewegung des Tages */}
      <BewegungAbschnitt datum={datum} />
    </div>
  );
}

/** Tagesgewicht (eine Waage-Eingabe je Tag); wird im Report als Kurve gezeigt. */
function GewichtAbschnitt({ datum }: { datum: string }) {
  const [kg, setKg] = useState('');
  const [ausTrend, setAusTrend] = useState(false);
  const [vorhanden, setVorhanden] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  const laden = useCallback(() => {
    gewichtApi
      .fuerTag(datum)
      .then((g) => {
        setKg(g ? formatKg(g.gramm) : '');
        setAusTrend(g ? g.aus_trend : false);
        setVorhanden(g !== null);
        setOk(false);
      })
      .catch((e) => setFehler(meldung(e)));
  }, [datum]);
  useEffect(laden, [laden]);

  async function speichern(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    setOk(false);
    const gramm = parseKgToGramm(kg);
    if (gramm === null) {
      setFehler('Bitte ein Gewicht in kg eingeben (größer als 0, z. B. 82,5).');
      return;
    }
    setSpeichert(true);
    try {
      await gewichtApi.save(datum, gramm, ausTrend);
      setVorhanden(true);
      setOk(true);
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setSpeichert(false);
    }
  }

  async function loeschen() {
    setFehler(null);
    try {
      await gewichtApi.remove(datum);
      setKg('');
      setVorhanden(false);
      setOk(false);
    } catch (err) {
      setFehler(meldung(err));
    }
  }

  return (
    <Card title="Gewicht">
      {fehler && (
        <div className="mb-3">
          <Banner kind="error" onClose={() => setFehler(null)}>
            {fehler}
          </Banner>
        </div>
      )}
      <form onSubmit={speichern} className="flex flex-wrap items-end gap-3">
        <Field label="Gewicht (kg)">
          <TextInput
            className="w-40 tabular"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            inputMode="decimal"
            placeholder="z. B. 82,5"
          />
        </Field>
        <div className="pb-1.5">
          <Checkbox
            label="Aus Trendberechnung ausschließen"
            checked={ausTrend}
            onChange={setAusTrend}
          />
        </div>
        <Button type="submit" variant="primary" disabled={speichert}>
          {speichert ? 'Speichert …' : 'Speichern'}
        </Button>
        {vorhanden && (
          <Button type="button" variant="danger" onClick={loeschen}>
            Löschen
          </Button>
        )}
        {ok && <span className="text-sm text-success">gespeichert ✓</span>}
      </form>
      <p className="mt-2 text-xs text-text-muted">
        Ausgeschlossene Messungen bleiben in der Kurve sichtbar, fließen aber
        nicht in die Trendgerade ein (z. B. die ersten Tage mit starkem
        Wasserverlust).
      </p>
    </Card>
  );
}

/**
 * Zweiter Abschnitt: Bewegung/Aktivitaet erfassen. Die Aktivitaetskalorien
 * werden fuer den Tag zum Gesamtverbrauch hinzugezaehlt (wirkt aufs Defizit in
 * der Auswertung). In sich geschlossen: laedt und verwaltet den eigenen Tag.
 */
function BewegungAbschnitt({ datum }: { datum: string }) {
  const [liste, setListe] = useState<Bewegung[]>([]);
  const [uhrzeit, setUhrzeit] = useState(jetztUhrzeit());
  const [beschreibung, setBeschreibung] = useState('');
  const [kcal, setKcal] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(() => {
    bewegungApi
      .fuerTag(datum)
      .then(setListe)
      .catch((e) => setFehler(meldung(e)));
  }, [datum]);
  useEffect(laden, [laden]);

  async function hinzufuegen(e: React.FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (beschreibung.trim() === '') {
      setFehler('Bitte eine Beschreibung eingeben.');
      return;
    }
    const kcalZahl = Number(kcal);
    if (!Number.isInteger(kcalZahl) || kcalZahl <= 0) {
      setFehler('Aktivitätskalorien müssen eine positive ganze Zahl sein.');
      return;
    }
    setSpeichert(true);
    try {
      await bewegungApi.create({
        datum,
        uhrzeit,
        beschreibung: beschreibung.trim(),
        kcal: kcalZahl,
      });
      setBeschreibung('');
      setKcal('');
      setUhrzeit(jetztUhrzeit());
      laden();
    } catch (err) {
      setFehler(meldung(err));
    } finally {
      setSpeichert(false);
    }
  }

  async function loeschen(b: Bewegung) {
    setFehler(null);
    try {
      await bewegungApi.remove(b.id);
      laden();
    } catch (err) {
      setFehler(meldung(err));
    }
  }

  const summe = liste.reduce((s, b) => s + b.kcal, 0);

  return (
    <Card title="Bewegung">
      {fehler && (
        <div className="mb-3">
          <Banner kind="error" onClose={() => setFehler(null)}>
            {fehler}
          </Banner>
        </div>
      )}
      <p className="mb-3 text-sm text-text-muted">
        Aktivitätskalorien werden für den Tag zum Gesamtverbrauch hinzugezählt
        und erhöhen so das Defizit.
      </p>
      <form
        onSubmit={hinzufuegen}
        className="mb-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-4"
      >
        <Field label="Uhrzeit">
          <TextInput
            type="time"
            value={uhrzeit}
            onChange={(e) => setUhrzeit(e.target.value)}
            className="tabular"
            required
          />
        </Field>
        <Field label="Beschreibung">
          <TextInput
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="z. B. Radfahren"
          />
        </Field>
        <Field label="Aktivitätskalorien (kcal)">
          <TextInput
            className="tabular"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            inputMode="numeric"
            placeholder="z. B. 350"
          />
        </Field>
        <Button type="submit" variant="primary" disabled={speichert}>
          {speichert ? 'Fügt hinzu …' : 'Hinzufügen'}
        </Button>
      </form>

      {liste.length === 0 ? (
        <p className="text-text-muted">
          Für diesen Tag ist keine Bewegung erfasst.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-muted">
              <th className="py-2 pr-3 font-normal">Uhrzeit</th>
              <th className="py-2 pr-3 font-normal">Beschreibung</th>
              <th className="py-2 pr-3 text-right font-normal">kcal</th>
              <th className="py-2 font-normal"></th>
            </tr>
          </thead>
          <tbody>
            {liste.map((b) => (
              <tr key={b.id} className="border-b border-border/50">
                <td className="py-2 pr-3 tabular">{b.uhrzeit}</td>
                <td className="py-2 pr-3">{b.beschreibung}</td>
                <td className="py-2 pr-3 text-right tabular">
                  {formatKcal(b.kcal)}
                </td>
                <td className="py-2 text-right">
                  <Button variant="danger" onClick={() => loeschen(b)}>
                    Löschen
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border font-bold">
              <td className="py-2 pr-3" colSpan={2}>
                Summe
              </td>
              <td className="py-2 pr-3 text-right tabular">
                {formatKcal(summe)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  );
}
