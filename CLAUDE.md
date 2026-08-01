# CLAUDE.md

> Diese Datei wird von Claude Code zu Beginn jeder Session gelesen. Sie beschreibt,
> was die App ist, wie sie aufgebaut ist und welche Regeln gelten. Konkrete
> Tagesaufgaben gehören NICHT hierher, sondern in den Chat.

## Projektüberblick

**Name:** Kaloriendingens (Anzeigename in UI und Dokumenten; technische
Bezeichner wie Repo, Docker-Image/-Container, package.json, Session-Cookie
`cal_session` und der OFF-User-Agent bleiben `cal-o-matic`)
**Zweck:** Eine selbst gehostete Webanwendung zum Abnehmen: Ich pflege Lebensmittel
mit Nährwerten, erfasse tagesweise, was und wann ich gegessen habe, setze Ziele
für Kalorien und Eiweiß und werte kurz- wie langfristig aus (inkl. Kaloriendefizit).

Technisch ist die App wie das Schwesterprojekt **quitt-o-matic** aufgebaut
(React/Vite + Express + better-sqlite3, Mandantenfähigkeit, Login), hört aber auf
Port **3010**.

## Datenschutz (höchste Priorität)

- Alles läuft und bleibt lokal im eigenen Netzwerk. KEINE Cloud, keine Telemetrie,
  keine externen Tracker oder CDNs. Standardmäßig kommt die App vollständig ohne
  Außenkontakt aus.
- **Einzige, bewusst freigegebene Ausnahme:** der **Open-Food-Facts-Import** unter
  „Lebensmittel". Er ist rein **opt-in** (nur bei expliziter Namenssuche), läuft
  **lesend** und **per Server-Proxy** (der Browser spricht nur mit der App, der
  Server ruft OFF ab). Kein Import-Vorgang ⇒ kein Außenkontakt. Sonst gilt die
  „alles bleibt lokal"-Regel unverändert – keine weiteren externen Dienste.
- Alle Abhängigkeiten (inkl. Schrift Atkinson Hyperlegible) werden lokal gebündelt.
- Die Datenbank liegt als lokale Datei vor und lässt sich einfach sichern.

## Was die App können soll

- **Lebensmittel (Stammdaten):** Anlegen/Bearbeiten/Löschen mit kcal und Eiweiß,
  jeweils bezogen auf 100 g, optional zusätzlich **Fett, Kohlenhydrate und
  Ballaststoffe** je 100 g (Dezigramm-Ganzzahlen wie Eiweiß, null = nicht
  erfasst; der OFF-Import übernimmt sie mit), plus optionaler **Packungsgröße** (g) und optionalem
  **Bestand** (g, `bestand_gramm`; leer = Bestand wird nicht geführt). Der
  Bestand ist der Vorrat des Produkts: Beim Ankreuzen von „gegessen" wird die
  Menge des Eintrags abgezogen; Abwählen, Löschen oder Mengen-Änderung eines
  gegessenen Eintrags buchen symmetrisch zurück bzw. um (`passeBestandAn` in
  `server/repos/eintraege.ts`). Der Bestand darf dadurch negativ werden (rote
  Anzeige statt stillem Deckel); die „gegessen"-Migration (alle bis gestern)
  lässt den Bestand bewusst unberührt. Im Formular gibt es eine **Eingabehilfe**
  „Anzahl × Packungsgröße = übernehmen", die den Bestand aus der Packungsanzahl
  errechnet; die Tabelle zeigt den Bestand (Tooltip: ≈ Packungen). Die Liste
  zeigt je Zeile zusätzlich abgeleitete (nicht editierbare) Kennzahlen:
  **Eiweiß/kcal** (g Eiweiß je kcal), **g/kcal** (Gramm je kcal) und
  **g/g Eiweiß** (Gramm je Gramm Eiweiß) sowie **kcal/Packung** (kcal der ganzen
  Packung, „—" ohne Packungsgröße). Die Tabelle ist per Klick auf die
  Spaltenköpfe sortierbar (erneuter Klick dreht die Richtung; leere Werte ans
  Ende). Ein Lebensmittel, das noch in Einträgen verwendet wird, kann NICHT
  gelöscht werden (strikter Löschschutz). Zusätzlich gibt es einen **Import aus
  Open Food Facts** – per **Namenssuche** oder präzise per **Barcode/EAN**: Der
  Server ruft OFF ab (`GET /api/lebensmittel/off-suche?q=` über Search-a-licious
  bzw. `GET /api/lebensmittel/off-produkt?code=` über die API v2; `server/off.ts`,
  `sucheOpenFoodFacts`/`holeOffProdukt`/`mapOffProdukt`), liefert Treffer mit
  Name (Marke vorangestellt), kcal/100 g, Eiweiß/100 g (kJ→kcal-Fallback) und
  Packungsgröße (g/kg; ml/l werden verworfen). EAN = 8–14 Ziffern
  (`istGueltigeEan`); unbekannte Barcodes → 404. Ein Treffer wird per
  „Übernehmen" ins Formular gereicht – dabei werden NUR leere Felder gefüllt,
  bereits eingegebene/bestehende Werte bleiben unverändert (auch der
  Bearbeiten-Modus bleibt erhalten) – und vor dem Speichern
  geprüft/ergänzt. Das ist der einzige Außenkontakt der App (siehe Datenschutz).
- **Tageserfassung:** Je Eintrag Uhrzeit, Lebensmittel (Auswahl), Menge in g und
  ein **„gegessen"-Häkchen**. kcal und Eiweiß eines Eintrags werden LIVE aus dem
  Lebensmittel und der Menge berechnet, nicht gespeichert (ändert man die
  Nährwerte, ändern sich vergangene Auswertungen entsprechend mit). Hat das
  gewählte Lebensmittel eine Packungsgröße, füllt ein Button „ganze Packung" die
  Menge damit. **Nur als „gegessen" markierte Einträge zählen in die Statistik**
  (Tages-Summen, Ziele, Zusammenfassung/Defizit, alle Verläufe und
  Langfrist-Auswertungen); nicht gegessene Einträge bleiben in der
  Mahlzeiten-Liste sichtbar (ausgegraut, mit Häkchen umschaltbar) und dienen der
  Planung. Neu angelegte Einträge sind per UI zunächst **nicht** gegessen (Häkchen
  in der Erfassungsmaske); das Repo (`createEintrag`) nimmt ohne Angabe hingegen
  „gegessen" an (programmatischer Standard). Umschalten per
  `PATCH /api/eintraege/:id/gegessen`; **beim Ankreuzen** wird zugleich die
  Uhrzeit des Eintrags auf die aktuelle Zeit gesetzt (tatsächliche Essenszeit; der
  Endpunkt akzeptiert dafür optional `{ uhrzeit }`, beim Abwählen unverändert).
  Für Bestandsdaten gibt es unter
  „Einstellungen" einen Button, der einmalig alle bis **einschließlich gestern**
  erfassten Mahlzeiten als gegessen markiert (`POST /api/eintraege/migriere-gegessen`,
  Repo `markiereGegessenBis`).
- **Planung / Zukunftsdaten:** Zu jedem Tag – auch in der Zukunft – lassen sich
  Daten erfassen (Planung). Tage mit Datum > heute fließen in KEINE Statistik ein
  (Defizit, Prognosen, Verläufe, Diagramme, „letzte Tage"). Nur die Tagesansicht
  selbst zeigt den geplanten Tag; sie ist als „geplant" gekennzeichnet.
- **Bewegung erfassen:** Zweiter Abschnitt auf der Tagesseite. Je Eintrag Datum,
  Uhrzeit, Beschreibung und Aktivitätskalorien. Die Aktivitätskalorien eines Tages
  werden zum Gesamtverbrauch dieses Tages hinzugezählt (Gesamtverbrauch =
  Gesamtumsatz + Aktivitätskalorien) und erhöhen so das Tagesdefizit. Ein Tag
  zählt fürs Defizit weiterhin nur, wenn er Lebensmittel-Einträge hat; die
  Aktivität erhöht dann den Verbrauch dieses Tages.
- **Ziele:** Kalorien- und Eiweißziel, je als Minimum ODER Maximum definierbar.
- **Gesamtumsatz:** Täglicher Gesamtumsatz (kcal/Tag) als Grundlage für das
  Kaloriendefizit. Umschaltbar **manuell** (versionierter Wert je Vorgabe) oder
  **berechnet** aus Körperdaten und dem **an dem Tag gültigen Gewicht** (letzte
  Messung ≤ Tag). Die Grundumsatz-**Formel** ist wählbar (`formel`):
  **Mifflin-St Jeor** (Größe, Geschlecht, Geburtsjahr) oder **Katch-McArdle**
  (370 + 21,6 × Magermasse; Magermasse = Gewicht × (1 − tagesgültiger
  Fettanteil)). Fehlt an einem Tag der Fettwert, gilt der **letzte davor**
  (Carry-forward, KEIN Rückgriff auf spätere Messungen); für Tage vor der
  ersten Fettmessung – und wenn nie einer erfasst wurde – greift Mifflin als
  Rückfall (sofern Größe/Geburtsjahr gesetzt), ohne Gewicht der manuelle Wert. Die Aktivitätsstufen (PAL) folgen den
  DGE‑Referenzwerten (`AKTIVITAETSSTUFEN` in `shared/umsatz.ts`). Der
  Gesamtumsatz sinkt so automatisch mit dem Gewicht. (`shared/umsatz.ts`:
  `grundumsatzMifflin`/`grundumsatzKatchMcArdle`, Körperdaten in der
  Key‑Value‑Tabelle, `gesamtumsatzFuerTag` in `server/repos/auswertung.ts`.)
- **Zeitversionierte Vorgaben:** Ziele und Gesamtumsatz werden je Stichtag
  (`gueltig_ab`) gespeichert. Eine neue Vorgabe ändert nur Tage ab ihrem Stichtag;
  frühere Tage behalten die davor gültige Vorgabe. So lässt sich der mit
  sinkendem Gewicht sinkende Gesamtumsatz korrekt über die Zeit abbilden.
- **Abnehmziel:** abzunehmendes Gewicht (kg) ab einem Stichtag. Das nötige
  Gesamtdefizit ist Gewicht × 7000 kcal/kg. Auf der Auswertungsseite wird der
  Fortschritt in Prozent gezeigt: erreichtes Defizit seit dem Stichtag (nur Tage
  mit Einträgen, je Tag mit dem damals gültigen Gesamtumsatz) / nötiges Defizit.
  Das erste angelegte Abnehmziel bekommt als Startdatum standardmäßig „heute − 1
  Monat" (damit der bereits erfasste Vormonat einzahlt). Zusätzlich werden zwei
  Prognosen für das Erreichen des Restdefizits gezeigt: beim Median-Tagesdefizit
  seit Festlegung, beim Defizit wie am Vortag und – rein messbasiert – **aus dem
  Gewichtstrend** (lineare Regression über die nicht ausgeschlossenen Messungen:
  Wann trifft die Trendgerade das Zielgewicht? `prognose_gewichtstrend`,
  `trend_gramm_pro_woche`). Jeweils als Zieldatum. Der Gewichtstrend steht in einer
  eigenen Karte samt **5-kg-Meilenstein-Übersicht** (`meilensteine`): je durch 5
  teilbarem ganzen Kilo bis zum Ziel die Trend-Prognose bzw. – wenn erreicht – das
  tatsächliche Datum plus „X Tage früher/später" gegenüber der Trend-Prognose.
  Eine **zweite Karte „Defizit-Median (gleitend, 7 Tage)"** zeigt dieselbe
  5-kg-Meilenstein-Tabelle (gemeinsame Komponente `MeilensteinTabelle`), aber die
  Prognose stammt aus dem **gleitenden 7-Tage-Median des Tagesdefizits**: die
  tagesweise Abnahmerate ist Median_kcal / 7 (7000 kcal/kg); vergangene Tage werden
  aufsummiert, für die Zukunft wird mit der aktuellen Medianrate linear
  extrapoliert. Der erreichte Zeitpunkt („erreicht am") stammt weiterhin aus den
  echten Messungen; „früher/später" bezieht sich hier auf diese Median-Prognose.
  Felder: `defizit_median_kcal`, `defizit_median_gramm_pro_woche`,
  `prognose_defizit_median`, `meilensteine_defizit_median` (`gleitenderMedian` in
  shared/naehrwerte; Berechnung in `getAbnehmFortschritt`).
  Neben dem Defizit-Balken gibt es zwei Gewichtsbalken: (a) **seit Festlegung**
  (Startgewicht = erste NICHT ausgeschlossene Messung ab `gueltig_ab`, ohne
  Wasser-Tage) und (b) **ab der ersten Messung** (allererste Messung inkl.
  ausgeschlossener Tage). Beide gegen das aktuelle Gewicht, im Verhältnis zum Ziel.
  Für den „ab erster Messung"-Balken wird das Ziel um die anfängliche
  (ausgeschlossene) Abnahme erweitert (`ziel_gesamt_gramm` = Ziel + erste Messung
  − erste nicht ausgeschlossene Messung, falls die erste höher liegt), damit beide
  Balken beim selben Zielgewicht 100 % erreichen.
- **Tagesauswertung:** Lebensmittel eines Tages mit kcal/Eiweiß, Summen und
  Abweichung vom Ziel. Default ist heute; jeder Tag ist anwählbar (Datumsnavigation).
  Über der Zusammenfassung stehen vier Kacheln: **Kalorien (gegessen)** und
  **Eiweiß (gegessen)** mit Zielbewertung sowie **Kalorien (geplant)** und
  **Eiweiß (geplant)** als reine Summen der noch nicht gegessenen Einträge. Die
  Mahlzeiten-Tabelle zeigt im Fuß zwei Summenzeilen: **Summe (gegessen)** und
  **Summe (geplant)**.
  Eine **Zusammenfassungs-Karte** zeigt „Gesamtumsatz + Bewegung − Aufnahme =
  Defizit" für den Tag (`getTagesAuswertung` liefert `gesamtumsatz`, `bewegung`,
  `defizit`; Gewicht/Bewegung-Änderungen laden den Tag neu). Die Eiweiß-Zielkarte
  zeigt zusätzlich das **Eiweiß je kg Körpergewicht** des Tages (g/kg, Richtwert
  1,6–2,0 g/kg) auf Basis des tagesgültigen (Carry-forward-)Gewichts; ohne Gewicht
  entfällt der Wert. `getTagesAuswertung` liefert dafür `gewicht_gramm` und
  `eiweiss_pro_kg` (`eiweissProKgKoerper` in `shared/naehrwerte.ts`).
- **Tagesgewicht:** Pro Tag lässt sich ein Gewicht (kg) eingeben (eine Waage-
  Eingabe je Tag, Upsert), optional mit **Körperfettanteil** in %
  (`fett_promille`, Promille-Ganzzahl: 25,4 % = 254; Basis für Katch-McArdle).
  Wird auf der Auswertungsseite als Liniendiagramm über
  den gewählten Zeitraum gezeigt (y-Achse skaliert auf den Datenbereich, nicht ab 0).
  Je Messung lässt sich „**Aus Trendberechnung ausschließen**" setzen (`aus_trend`):
  der Punkt bleibt in der Kurve sichtbar (hohl dargestellt), fließt aber nicht in
  die Regressionsgerade/Trendrate ein – gedacht für die ersten Tage mit starkem
  Wasserverlust.
- **Langfrist-Auswertung:** Drei Liniengraphen (kcal/Tag, Eiweiß/Tag, Gewicht/kg)
  für einen wählbaren Zeitraum (Default: letzte 30 Tage). Alle Diagramme teilen
  dieselbe datumsbasierte x-Achse (von–bis); jeder Punkt liegt an seinem echten
  Datum. An Tagen ohne Daten wird nichts gezeichnet. Bei kcal/Eiweiß bricht die
  Linie an Lücken ab (nur aufeinanderfolgende Kalendertage werden verbunden); das
  Gewicht wird als durchgehende Linie über die Messpunkte gezeichnet
  (`verbinden`). Ein viertes Diagramm **„Umsatz & Aufnahme"** zeigt je Tag drei
  Linien: Gesamtumsatz (berechnet/vorgegeben), Gesamtumsatz + erfasste Bewegung
  (= Gesamtverbrauch) und Kalorienaufnahme (`/api/auswertung/kalorien-verlauf`;
  LinienChart kann über `serien` mehrere Linien zeichnen). Die Bewegung zählt auf
  die Verbrauchsseite; die Fläche zwischen „Gesamtumsatz + Bewegung" und
  „Aufnahme" ist als **Tagesdefizit** farbig hervorgehoben (grün = Defizit, rot =
  Überschuss; `differenz`-Prop des LinienChart). Ein fünftes Diagramm zeigt nur
  das **Tagesdefizit** (Gesamtumsatz + Bewegung − Aufnahme, `defizit-verlauf`)
  als Linie gegen eine Null-Linie, ebenfalls grün/rot geschattet. Ein sechstes
  Diagramm **„Kumulierter Gewichtsverlust"** stellt den aus dem kumulierten
  Defizit **erwarteten** Verlust (Defizit ÷ 7000 kcal/kg, also Gramm =
  kum. Defizit_kcal / 7) dem **gemessenen** Verlust (Anker − Messung) gegenüber –
  beide als Abnahme in kg ab der ersten nicht ausgeschlossenen Messung (dort 0).
  So sieht man, ob man dem 7000-kcal/kg-Modell voraus- oder hinterherläuft
  (`kumulierteAbnahme` in `shared/naehrwerte.ts`; Frontend nutzt die schon
  geladenen Gewichts- und Defizit-Verläufe). Am
  Gewichtsdiagramm zeigt jeder Messpunkt zusätzlich ein kleines Label der
  **Gewichtsreduktion in kg** gegenüber der vorherigen Messung
  (`punktLabel`-Prop des LinienChart, bekommt Wert + Vorpunkt). Das Gewicht wird zusätzlich mit
  einer gestrichelten **linearen
  Ausgleichsgeraden** (Regression, `regression`) versehen; die Trendrate wird als
  kg/Woche angezeigt (`lineareRegression` in shared/naehrwerte). Eine zweite Linie
  (`prognose`, blau) zeigt den **auf Defizitbasis prognostizierten Gewichtsverlust**:
  ab dem ersten Gewichtspunkt wird je Tag das Tagesdefizit als Gewicht abgezogen
  (7000 kcal/kg, also Gramm = Defizit_kcal / 7). Grundlage ist das Tagesdefizit je
  Tag (`/api/auswertung/defizit-verlauf`). Zusätzlich: Liste der letzten 7 Tage mit
  Sprung
  zur jeweiligen Tagesseite sowie das Kaloriendefizit für Tag, letzte 7 Tage,
  letzte 30 Tage und den gesamten Erfassungszeitraum (kumuliert). Das Defizit zählt
  nur Tage mit Einträgen.

- **Allzeitreport (eigene Seite „Allzeit"):** Eine Tabelle mit einer Zeile je
  Kalendertag von der ersten Erfassung (Eintrag, Bewegung oder Gewicht) bis
  heute: Datum, gemessenes Gewicht, Gesamtumsatz, Bewegung, Verbrauch
  (Umsatz + Bewegung), Kalorien- und Eiweißaufnahme sowie Fett, Kohlenhydrate
  und Ballaststoffe (alle nur gegessene Mahlzeiten; die drei optionalen
  Nährwerte werden über die Einträge mit hinterlegtem Wert summiert –
  NULL-Werte fallen aus der Summe, ein Tag ganz ohne Werte bleibt leer).
  Für Copy & Paste gedacht; ein Button „Tabelle kopieren" legt den Report als
  TSV (Tab-getrennt, deutsche Dezimalkommas, ohne Tausenderpunkte) in die
  Zwischenablage. `getAllzeitReport` in `server/repos/auswertung.ts`,
  `GET /api/auswertung/allzeit`, Seite `src/pages/AllzeitSeite.tsx`. Darunter
  liegt der **Detailreport („alles")**: gleiche Tageszeilen, aber unter jeder
  stehen zusätzlich alle Mahlzeiten (inkl. geplanter, als „(geplant)" markiert)
  und Bewegungseinträge des Tages chronologisch gemischt – Spalten Datum,
  Uhrzeit, Eintrag, Menge plus die Allzeit-Zahlenspalten; Mahlzeiten-kcal stehen
  in der Aufnahme-, Bewegungs-kcal in der Bewegungs-Spalte. Eigener
  „Tabelle kopieren"-Button (TSV). `getDetailReport`,
  `GET /api/auswertung/detail`.

## Einheiten-Konvention

Analog zum Cent-Prinzip: alles als Ganzzahl halten, erst zur Anzeige formatieren.
- **kcal:** ganze Kilokalorien (INTEGER).
- **Eiweiß:** Dezigramm (1 dg = 0,1 g), z. B. 12,5 g = 125.
- **Menge:** ganze Gramm.
Zentrale Stelle für Rechnung/Formatierung/Zielbewertung: `shared/naehrwerte.ts`.

## Mandantenfähigkeit & Zugriffsschutz (AKTIV)

Wie bei quitt-o-matic: Alle Fachtabellen haben `mandant_id` (NOT NULL, Standard 1)
mit Index. Login per Benutzername/Passwort (scrypt), Session als httpOnly-Cookie
(`cal_session`) mit serverseitiger `sessions`-Tabelle. Der Mandant des Nutzers wird
je Request über einen `AsyncLocalStorage` geführt (`aktuellerMandant()`), sodass
jede Query automatisch filtert. Admin-Realm = Mandant 0 (nur Nutzerverwaltung,
kein Zugriff auf Fachdaten). Erst-Accounts beim ersten Start: `admin/admin`
(Mandant 0) und `joerg/joerg` (Mandant 1) – Passwörter nach dem ersten Login ändern.

## Tech-Stack

- **Frontend:** React (mit Vite), TypeScript, Tailwind CSS, Dark Mode.
- **Backend:** Node.js mit Express (läuft zur Laufzeit direkt über `tsx`).
- **Datenbank:** SQLite (better-sqlite3) – eine lokale Datei.
- **Charts:** selbst gezeichnete SVG-Liniengraphen (keine externe Abhängigkeit).
- **Tests:** Vitest.

## Projektstruktur

```
/src
  /components   – wiederverwendbare React-Komponenten (inkl. LinienChart)
  /pages        – Seiten (Tag, Langfrist/Auswertung, Lebensmittel, Einstellungen, Benutzer)
  /lib          – API-Client und Hilfsfunktionen
/server
  /routes       – Express-Routen (lebensmittel, eintraege, einstellungen, auswertung, auth, ...)
  /repos        – DB-Zugriffslogik
  /db           – Schema, Öffnen, Seed
  /auth         – Passwörter, Sessions-Middleware, Rate-Limit
/shared         – gemeinsame Typen und Nährwert-Logik
/data           – die SQLite-Datenbankdatei (wird NICHT versioniert)
/tests          – Test-Dateien
```

## Datenmodell (Kurzform)

- `lebensmittel`: id, mandant_id, name (eindeutig/Mandant), kcal_pro_100g,
  eiweiss_dg_pro_100g, fett_dg_pro_100g/kohlenhydrate_dg_pro_100g/
  ballaststoffe_dg_pro_100g (optional, dg je 100 g), packung_gramm (optional,
  für „ganze Packung"),
  bestand_gramm (optional; Vorrat, wird durch „gegessen" reduziert), Zeitstempel.
- `eintraege`: id, mandant_id, datum, uhrzeit, lebensmittel_id (FK), menge_gramm,
  gegessen (0/1: zählt nur bei 1 in die Statistik), Zeitstempel. kcal/Eiweiß
  werden live berechnet.
- `vorgaben`: zeitversionierte Ziele + Gesamtumsatz. Spalten: id, mandant_id,
  gueltig_ab, kcal_ziel, kcal_ziel_typ, eiweiss_ziel_dg, eiweiss_ziel_typ,
  gesamtumsatz. Für einen Tag gilt die jüngste Vorgabe mit `gueltig_ab ≤ Tag`;
  für Tage vor der ersten Vorgabe die älteste. So bleiben vergangene Tage mit der
  damals gültigen Vorgabe bewertet (sinkender Gesamtumsatz bei sinkendem Gewicht).
  Das Defizit rechnet je Tag mit dem damals gültigen Gesamtumsatz.
- `abnehmziele`: id, mandant_id, gueltig_ab, ziel_gramm (abzunehmendes Gewicht in
  Gramm). Aktiv ist das jüngste Ziel mit `gueltig_ab ≤ heute`; nötiges Defizit =
  ziel_gramm/1000 × 7000 kcal.
- `bewegung`: id, mandant_id, datum, uhrzeit, beschreibung, kcal
  (Aktivitätskalorien). Je Tag zum Gesamtverbrauch addiert (Defizit/Prognose).
- `gewicht`: id, mandant_id, datum, gramm, fett_promille (optional, 25,4 % =
  254), aus_trend (0/1: aus der Trendlinie
  ausgeschlossen). Ein Tagesgewicht je (mandant_id, datum); Quelle für das
  Gewichts-Liniendiagramm.
- `einstellungen`: Legacy-Key-Value, nur noch Migrationsquelle für `vorgaben`.
- `users`, `sessions`: mandant-übergreifend (Auth-Verwaltung).

## Befehle

- `npm run dev` – Frontend + Backend im Entwicklungsmodus (Web 5173, API 3010)
- `npm run build` – Produktions-Build (tsc + vite)
- `npm start` – Startet die gebaute App (Dauerbetrieb)
- `npm test` – Alle Tests (Vitest)
- `npm run lint` – ESLint + Prettier prüfen; `npm run format` schreibt.

## Konventionen und Regeln

- TypeScript, keine reinen JS-Dateien. Funktionale React-Komponenten mit Hooks.
- Komponenten PascalCase, Funktionen/Variablen camelCase, deutsche Bezeichner.
- Nährwerte IMMER als Ganzzahl speichern (kcal ganz, Eiweiß in dg), Datum ISO
  (YYYY-MM-DD), Uhrzeit HH:MM.
- Logik nach `/shared` bzw. `/server` auslagern, Komponenten klein halten.
- Zu neuer Funktionalität mindestens einen Test schreiben.

## Was Claude NICHT tun soll

- KEINE externen Dienste, Cloud-APIs, CDNs, Telemetrie oder extern geladene
  Schriften einbauen – die App bleibt vollständig lokal. Einzige, ausdrücklich
  vom Nutzer freigegebene Ausnahme: der lesende Open-Food-Facts-Import per
  Server-Proxy (opt-in). Keine weiteren Außenkontakte ohne erneute Rücksprache.
- Keine Abhängigkeiten hinzufügen, ohne kurz zu begründen warum.
- Keine bestehenden Tests löschen oder durch Auskommentieren „grün machen".
- Keine Secrets, Passwörter oder echten Gesundheitsdaten in Commits ablegen.
