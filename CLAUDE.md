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
  jeweils bezogen auf 100 g. Ein Lebensmittel, das noch in Einträgen verwendet
  wird, kann NICHT gelöscht werden (strikter Löschschutz).
- **Tageserfassung:** Je Eintrag Uhrzeit, Lebensmittel (Auswahl) und Menge in g.
  kcal und Eiweiß eines Eintrags werden LIVE aus dem Lebensmittel und der Menge
  berechnet, nicht gespeichert (ändert man die Nährwerte, ändern sich vergangene
  Auswertungen entsprechend mit).
- **Ziele:** Kalorien- und Eiweißziel, je als Minimum ODER Maximum definierbar.
- **Gesamtumsatz:** Täglicher Gesamtumsatz (kcal/Tag) als Grundlage für das
  Kaloriendefizit.
- **Tagesauswertung:** Lebensmittel eines Tages mit kcal/Eiweiß, Summen und
  Abweichung vom Ziel. Default ist heute; jeder Tag ist anwählbar (Datumsnavigation).
- **Langfrist-Auswertung:** Zwei Liniengraphen (kcal/Tag, Eiweiß/Tag) für einen
  wählbaren Zeitraum (Default: letzte 30 Tage), Liste der letzten 7 Tage mit Sprung
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
  eiweiss_dg_pro_100g, Zeitstempel.
- `eintraege`: id, mandant_id, datum, uhrzeit, lebensmittel_id (FK), menge_gramm,
  Zeitstempel. kcal/Eiweiß werden live berechnet.
- `einstellungen`: (mandant_id, schluessel) → wert. Schlüssel: kcal_ziel,
  kcal_ziel_typ, eiweiss_ziel_dg, eiweiss_ziel_typ, gesamtumsatz.
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
