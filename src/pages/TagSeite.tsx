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
  formatDezimal,
  formatGramm,
  formatKcal,
  formatKg,
  parseGrammToDg,
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
import { useSpaltenWahl } from '../components/SpaltenWahl.tsx';

function meldung(e: unknown): string {
  return e instanceof Error ? e.message : 'Unbekannter Fehler';
}

/** Zeigt Summe + Zielbewertung fuer kcal bzw. Eiweiss. */
function Zielanzeige({
  titel,
  bewertung,
  format,
  einheit,
  zusatz,
}: {
  titel: string;
  bewertung: Zielbewertung;
  format: (n: number) => string;
  einheit: string;
  zusatz?: string;
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
      {zusatz && <div className="mt-1 text-sm text-text-muted">{zusatz}</div>}
    </div>
  );
}

/** Schlichte Wertkachel (gleicher Look wie Zielanzeige, ohne Zielbewertung). */
function WertAnzeige({
  titel,
  wert,
  einheit,
  hinweis,
}: {
  titel: string;
  wert: string;
  einheit: string;
  hinweis?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="text-sm text-text-muted">{titel}</div>
      <div className="text-2xl font-bold tabular text-text">
        {wert} {einheit}
      </div>
      <div className="mt-1 text-sm text-text-muted">
        {hinweis ?? 'geplant (noch nicht gegessen)'}
      </div>
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
  const [gegessen, setGegessen] = useState(false);
  const [speichert, setSpeichert] = useState(false);

  // Inline-Bearbeitung einer Mahlzeit (Uhrzeit + Menge)
  const [bearbeiteId, setBearbeiteId] = useState<number | null>(null);
  const [editUhrzeit, setEditUhrzeit] = useState('');
  const [editMenge, setEditMenge] = useState('');

  // Spalten der Mahlzeiten-Tabelle ein-/ausblendbar (Default: alle sichtbar).
  const sw = useSpaltenWahl('mahlzeiten', [
    { key: 'gegessen', label: 'gegessen' },
    { key: 'uhrzeit', label: 'Uhrzeit' },
    { key: 'lebensmittel', label: 'Lebensmittel' },
    { key: 'menge', label: 'Menge' },
    { key: 'kcal', label: 'kcal' },
    { key: 'eiweiss', label: 'Eiweiß' },
  ]);
  // Breite der Summen-Beschriftung = sichtbare Spalten vor der Menge-Spalte.
  const summeSpan = Math.max(
    1,
    sw.anzahlSichtbar(['gegessen', 'uhrzeit', 'lebensmittel']),
  );

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
        gegessen,
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

  async function gegessenUmschalten(eintrag: Eintrag, wert: boolean) {
    setFehler(null);
    try {
      // Beim Ankreuzen die Uhrzeit auf jetzt setzen (tatsaechliche Essenszeit);
      // beim Abwaehlen bleibt die Uhrzeit unveraendert.
      await eintraegeApi.setGegessen(
        eintrag.id,
        wert,
        wert ? jetztUhrzeit() : undefined,
      );
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

  // Geplante (noch nicht gegessene) Eintraege: Summen fuer Anzeige und Footer.
  const geplant = (auswertung?.eintraege ?? []).filter((e) => !e.gegessen);
  const geplantKcal = geplant.reduce((s, e) => s + (e.kcal ?? 0), 0);
  const geplantEiweissDg = geplant.reduce((s, e) => s + (e.eiweiss_dg ?? 0), 0);
  const geplantMenge = geplant.reduce((s, e) => s + e.menge_gramm, 0);
  // Defizit, wenn auch die geplante Aufnahme mitgezaehlt wird (gegessen+geplant).
  const gesamtDefizit = auswertung ? auswertung.defizit - geplantKcal : 0;

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
      <GewichtAbschnitt datum={datum} onAenderung={ladeTag} />

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
          <div className="flex flex-col gap-2">
            <Checkbox
              label="gegessen"
              checked={gegessen}
              onChange={setGegessen}
            />
            <Button type="submit" variant="primary" disabled={speichert}>
              {speichert ? 'Fügt hinzu …' : 'Hinzufügen'}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-text-muted">
          Nur als „gegessen" markierte Mahlzeiten zählen in Summen, Ziele und
          das Defizit. So lassen sich Tage vorausplanen, ohne die Statistik zu
          verfälschen.
        </p>
        {lebensmittel.length === 0 && (
          <p className="mt-3 text-sm text-text-muted">
            Noch keine Lebensmittel angelegt – lege sie zuerst unter
            „Lebensmittel" an.
          </p>
        )}
      </Card>

      {/* Tagessummen + Ziel (gegessen) sowie geplante Summen */}
      {auswertung && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Zielanzeige
            titel="Kalorien (gegessen)"
            bewertung={auswertung.kcal}
            format={formatKcal}
            einheit="kcal"
          />
          <Zielanzeige
            titel="Eiweiß (gegessen)"
            bewertung={auswertung.eiweiss}
            format={formatGramm}
            einheit="g"
            zusatz={
              auswertung.eiweiss_pro_kg !== null
                ? `${formatDezimal(auswertung.eiweiss_pro_kg)} g/kg Körpergewicht`
                : undefined
            }
          />
          <WertAnzeige
            titel="Kalorien (geplant)"
            wert={formatKcal(geplantKcal)}
            einheit="kcal"
          />
          <WertAnzeige
            titel="Eiweiß (geplant)"
            wert={formatGramm(geplantEiweissDg)}
            einheit="g"
          />
        </div>
      )}

      {/* Zusammenfassung: Leistungsumsatz + Bewegung − Aufnahme = Defizit */}
      {auswertung && (
        <Card title="Zusammenfassung">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular">
            <span className="text-text-muted">gegessen:</span>
            <span>
              <span className="text-text-muted">Gesamtumsatz</span>{' '}
              <span className="font-bold">
                {formatKcal(auswertung.gesamtumsatz)}
              </span>
            </span>
            <span className="text-text-muted">+</span>
            <span>
              <span className="text-text-muted">Bewegung</span>{' '}
              <span className="font-bold">
                {formatKcal(auswertung.bewegung)}
              </span>
            </span>
            <span className="text-text-muted">−</span>
            <span>
              <span className="text-text-muted">Aufnahme</span>{' '}
              <span className="font-bold">
                {formatKcal(auswertung.summe_kcal)}
              </span>
            </span>
            <span className="text-text-muted">=</span>
            <span
              className={`text-lg font-bold ${
                auswertung.defizit >= 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {auswertung.defizit >= 0 ? 'Defizit' : 'Überschuss'}{' '}
              {formatKcal(auswertung.defizit)} kcal
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular">
            <span className="text-text-muted">inkl. geplant:</span>
            <span>
              <span className="text-text-muted">Gesamtumsatz</span>{' '}
              <span className="font-bold">
                {formatKcal(auswertung.gesamtumsatz)}
              </span>
            </span>
            <span className="text-text-muted">+</span>
            <span>
              <span className="text-text-muted">Bewegung</span>{' '}
              <span className="font-bold">
                {formatKcal(auswertung.bewegung)}
              </span>
            </span>
            <span className="text-text-muted">−</span>
            <span>
              <span className="text-text-muted">Aufnahme</span>{' '}
              <span className="font-bold">
                {formatKcal(auswertung.summe_kcal + geplantKcal)}
              </span>
            </span>
            <span className="text-text-muted">=</span>
            <span
              className={`text-lg font-bold ${
                gesamtDefizit >= 0 ? 'text-success' : 'text-danger'
              }`}
            >
              {gesamtDefizit >= 0 ? 'Defizit' : 'Überschuss'}{' '}
              {formatKcal(gesamtDefizit)} kcal
            </span>
          </div>
        </Card>
      )}

      {/* Eintraege des Tages */}
      <Card title="Mahlzeiten">
        {!auswertung || auswertung.eintraege.length === 0 ? (
          <p className="text-text-muted">Für diesen Tag ist nichts erfasst.</p>
        ) : (
          <>
            {sw.auswahl}
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  {sw.sichtbar('gegessen') && (
                    <th className="py-2 pr-3 text-center font-normal">
                      gegessen
                    </th>
                  )}
                  {sw.sichtbar('uhrzeit') && (
                    <th className="py-2 pr-3 font-normal">Uhrzeit</th>
                  )}
                  {sw.sichtbar('lebensmittel') && (
                    <th className="py-2 pr-3 font-normal">Lebensmittel</th>
                  )}
                  {sw.sichtbar('menge') && (
                    <th className="py-2 pr-3 text-right font-normal">Menge</th>
                  )}
                  {sw.sichtbar('kcal') && (
                    <th className="py-2 pr-3 text-right font-normal">kcal</th>
                  )}
                  {sw.sichtbar('eiweiss') && (
                    <th className="py-2 pr-3 text-right font-normal">Eiweiß</th>
                  )}
                  <th className="py-2 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {auswertung.eintraege.map((e) => {
                  const imEdit = bearbeiteId === e.id;
                  return (
                    <tr
                      key={e.id}
                      className={`border-b border-border/50 ${
                        e.gegessen ? '' : 'text-text-muted'
                      }`}
                    >
                      {sw.sichtbar('gegessen') && (
                        <td className="py-2 pr-3 text-center">
                          <div className="flex justify-center">
                            <Checkbox
                              checked={e.gegessen}
                              onChange={(c) => gegessenUmschalten(e, c)}
                            />
                          </div>
                        </td>
                      )}
                      {sw.sichtbar('uhrzeit') && (
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
                      )}
                      {sw.sichtbar('lebensmittel') && (
                        <td className="py-2 pr-3">{e.lebensmittel_name}</td>
                      )}
                      {sw.sichtbar('menge') && (
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
                      )}
                      {sw.sichtbar('kcal') && (
                        <td className="py-2 pr-3 text-right tabular">
                          {formatKcal(e.kcal ?? 0)}
                        </td>
                      )}
                      {sw.sichtbar('eiweiss') && (
                        <td className="py-2 pr-3 text-right tabular">
                          {formatGramm(e.eiweiss_dg ?? 0)} g
                        </td>
                      )}
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
                  <td className="py-2 pr-3" colSpan={summeSpan}>
                    Summe (gegessen)
                  </td>
                  {sw.sichtbar('menge') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {auswertung.eintraege
                        .filter((e) => e.gegessen)
                        .reduce((s, e) => s + e.menge_gramm, 0)}{' '}
                      g
                    </td>
                  )}
                  {sw.sichtbar('kcal') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatKcal(auswertung.summe_kcal)}
                    </td>
                  )}
                  {sw.sichtbar('eiweiss') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatGramm(auswertung.summe_eiweiss_dg)} g
                    </td>
                  )}
                  <td></td>
                </tr>
                <tr className="font-bold text-text-muted">
                  <td className="py-2 pr-3" colSpan={summeSpan}>
                    Summe (geplant)
                  </td>
                  {sw.sichtbar('menge') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {geplantMenge} g
                    </td>
                  )}
                  {sw.sichtbar('kcal') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatKcal(geplantKcal)}
                    </td>
                  )}
                  {sw.sichtbar('eiweiss') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatGramm(geplantEiweissDg)} g
                    </td>
                  )}
                  <td></td>
                </tr>
                <tr className="border-t border-border font-bold">
                  <td className="py-2 pr-3" colSpan={summeSpan}>
                    Summe (gegessen + geplant)
                  </td>
                  {sw.sichtbar('menge') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {auswertung.eintraege.reduce(
                        (s, e) => s + e.menge_gramm,
                        0,
                      )}{' '}
                      g
                    </td>
                  )}
                  {sw.sichtbar('kcal') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatKcal(auswertung.summe_kcal + geplantKcal)}
                    </td>
                  )}
                  {sw.sichtbar('eiweiss') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatGramm(
                        auswertung.summe_eiweiss_dg + geplantEiweissDg,
                      )}{' '}
                      g
                    </td>
                  )}
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </>
        )}
      </Card>

      {/* Bewegung des Tages */}
      <BewegungAbschnitt datum={datum} onAenderung={ladeTag} />
    </div>
  );
}

/** Tagesgewicht (eine Waage-Eingabe je Tag); wird im Report als Kurve gezeigt. */
function GewichtAbschnitt({
  datum,
  onAenderung,
}: {
  datum: string;
  onAenderung?: () => void;
}) {
  const [kg, setKg] = useState('');
  const [fett, setFett] = useState('');
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
        setFett(
          g && g.fett_promille !== null ? formatGramm(g.fett_promille) : '',
        );
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
    // Fettanteil (%) in Promille: gleiche Zehntel-Konvention wie Gramm -> dg.
    const fettPromille = fett.trim() === '' ? null : parseGrammToDg(fett);
    if (
      fett.trim() !== '' &&
      (fettPromille === null || fettPromille <= 0 || fettPromille >= 1000)
    ) {
      setFehler('Fettanteil muss zwischen 0 und 100 % liegen (z. B. 25,4).');
      return;
    }
    setSpeichert(true);
    try {
      await gewichtApi.save(datum, gramm, ausTrend, fettPromille);
      setVorhanden(true);
      setOk(true);
      onAenderung?.();
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
      setFett('');
      setVorhanden(false);
      setOk(false);
      onAenderung?.();
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
        <Field label="Fettanteil (%, optional)">
          <TextInput
            className="w-40 tabular"
            value={fett}
            onChange={(e) => setFett(e.target.value)}
            inputMode="decimal"
            placeholder="z. B. 25,4"
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
function BewegungAbschnitt({
  datum,
  onAenderung,
}: {
  datum: string;
  onAenderung?: () => void;
}) {
  const [liste, setListe] = useState<Bewegung[]>([]);
  const [uhrzeit, setUhrzeit] = useState(jetztUhrzeit());
  const [beschreibung, setBeschreibung] = useState('');
  const [kcal, setKcal] = useState('');
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const sw = useSpaltenWahl('bewegung', [
    { key: 'uhrzeit', label: 'Uhrzeit' },
    { key: 'beschreibung', label: 'Beschreibung' },
    { key: 'kcal', label: 'kcal' },
  ]);

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
      onAenderung?.();
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
      onAenderung?.();
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
        <>
          {sw.auswahl}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-muted">
                {sw.sichtbar('uhrzeit') && (
                  <th className="py-2 pr-3 font-normal">Uhrzeit</th>
                )}
                {sw.sichtbar('beschreibung') && (
                  <th className="py-2 pr-3 font-normal">Beschreibung</th>
                )}
                {sw.sichtbar('kcal') && (
                  <th className="py-2 pr-3 text-right font-normal">kcal</th>
                )}
                <th className="py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((b) => (
                <tr key={b.id} className="border-b border-border/50">
                  {sw.sichtbar('uhrzeit') && (
                    <td className="py-2 pr-3 tabular">{b.uhrzeit}</td>
                  )}
                  {sw.sichtbar('beschreibung') && (
                    <td className="py-2 pr-3">{b.beschreibung}</td>
                  )}
                  {sw.sichtbar('kcal') && (
                    <td className="py-2 pr-3 text-right tabular">
                      {formatKcal(b.kcal)}
                    </td>
                  )}
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
                <td
                  className="py-2 pr-3"
                  colSpan={Math.max(
                    1,
                    sw.anzahlSichtbar(['uhrzeit', 'beschreibung']),
                  )}
                >
                  Summe
                </td>
                {sw.sichtbar('kcal') && (
                  <td className="py-2 pr-3 text-right tabular">
                    {formatKcal(summe)}
                  </td>
                )}
                <td></td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </Card>
  );
}
