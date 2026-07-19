# CLAUDE.md

> Diese Datei wird von Claude Code zu Beginn jeder Session gelesen. Sie beschreibt,
> was die App ist, wie sie aufgebaut ist und welche Regeln gelten. Konkrete
> Tagesaufgaben gehören NICHT hierher, sondern in den Chat.

## Projektüberblick

**Name:** cal-o-matic
**Zweck:** Eine selbst gehostete Webanwendung zum Abnehmen: Ich pflege Lebensmittel
mit Nährwerten, erfasse tagesweise, was und wann ich gegessen habe, setze Ziele
für Kalorien und Eiweiß und werte kurz- wie langfristig aus (inkl. Kaloriendefizit).

Technisch ist die App wie das Schwesterprojekt **quitt-o-matic** aufgebaut
(React/Vite + Express + better-sqlite3, Mandantenfähigkeit, Login), hört aber auf
Port **3010**.

## Datenschutz (höchste Priorität)

- Alles läuft und bleibt lokal im eigenen Netzwerk. KEINE Cloud, keine Telemetrie,
  keine externen Tracker oder CDNs. Es gibt hier auch KEINE Ausnahme für externe
  Dienste – die App kommt vollständig ohne Außenkontakt aus.
- Alle Abhängigkeiten (inkl. Schrift Atkinson Hyperlegible) werden lokal gebündelt.
- Die Datenbank liegt als lokale Datei vor und lässt sich einfach sichern.

## Was die App können soll

- **Lebensmittel (Stammdaten):** Anlegen/Bearbeiten/Löschen mit kcal und Eiweiß,
  jeweils bezogen auf 100 g, plus optionaler **Packungsgröße** (g). Die Liste
  zeigt je Zeile zusätzlich abgeleitete (nicht editierbare) Kennzahlen:
  **Eiweiß/kcal** (g Eiweiß je kcal), **g/kcal** (Gramm je kcal) und
  **g/g Eiweiß** (Gramm je Gramm Eiweiß) sowie **kcal/Packung** (kcal der ganzen
  Packung, „—" ohne Packungsgröße). Die Tabelle ist per Klick auf die
  Spaltenköpfe sortierbar (erneuter Klick dreht die Richtung; leere Werte ans
  Ende). Ein Lebensmittel, das noch in Einträgen verwendet wird, kann NICHT
  gelöscht werden (strikter Löschschutz).
- **Tageserfassung:** Je Eintrag Uhrzeit, Lebensmittel (Auswahl) und Menge in g.
  kcal und Eiweiß eines Eintrags werden LIVE aus dem Lebensmittel und der Menge
  berechnet, nicht gespeichert (ändert man die Nährwerte, ändern sich vergangene
  Auswertungen entsprechend mit). Hat das gewählte Lebensmittel eine
  Packungsgröße, füllt ein Button „ganze Packung" die Menge damit.
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
  **berechnet**: aus Körperdaten (Größe, Geschlecht, Geburtsjahr, Aktivitätsfaktor)
  und dem **an dem Tag gültigen Gewicht** (letzte Messung ≤ Tag) nach Mifflin‑St
  Jeor × Aktivitätsfaktor. Die Aktivitätsstufen (PAL) folgen den DGE‑Referenzwerten
  (`AKTIVITAETSSTUFEN` in `shared/umsatz.ts`). Der Gesamtumsatz sinkt so automatisch mit dem Gewicht.
  Ohne Gewicht an einem Tag greift der manuelle Wert als Rückfall.
  (`shared/umsatz.ts`, Körperdaten in der Key‑Value‑Tabelle, `gesamtumsatzFuerTag`
  in `server/repos/auswertung.ts`.)
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
  seit Festlegung und beim Defizit wie am Vortag (jeweils als Zieldatum).
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
  Eine **Zusammenfassungs-Karte** zeigt „Leistungsumsatz + Bewegung − Aufnahme =
  Defizit" für den Tag (`getTagesAuswertung` liefert `gesamtumsatz`, `bewegung`,
  `defizit`; Gewicht/Bewegung-Änderungen laden den Tag neu).
- **Tagesgewicht:** Pro Tag lässt sich ein Gewicht (kg) eingeben (eine Waage-
  Eingabe je Tag, Upsert). Wird auf der Auswertungsseite als Liniendiagramm über
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
  als Linie gegen eine Null-Linie, ebenfalls grün/rot geschattet. Das Gewicht wird
  zusätzlich mit
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
  eiweiss_dg_pro_100g, packung_gramm (optional, für „ganze Packung"), Zeitstempel.
- `eintraege`: id, mandant_id, datum, uhrzeit, lebensmittel_id (FK), menge_gramm,
  Zeitstempel. kcal/Eiweiß werden live berechnet.
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
- `gewicht`: id, mandant_id, datum, gramm, aus_trend (0/1: aus der Trendlinie
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
  Schriften einbauen – die App bleibt vollständig lokal.
- Keine Abhängigkeiten hinzufügen, ohne kurz zu begründen warum.
- Keine bestehenden Tests löschen oder durch Auskommentieren „grün machen".
- Keine Secrets, Passwörter oder echten Gesundheitsdaten in Commits ablegen.
