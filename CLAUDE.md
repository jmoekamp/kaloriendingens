# CLAUDE.md

> Diese Datei wird von Claude Code zu Beginn jeder Session gelesen. Sie enthält
> Architektur, Datenmodell und Regeln. Der vollständige **Funktionsumfang
> steht in FEATURES.md** und wird dort gepflegt. Konkrete Tagesaufgaben gehören
> in den Chat, nicht hierher.

## Projektüberblick

**Name:** Kaloriendingens. Der frühere Name wurde wegen möglicher
Markenprobleme vollständig entfernt (auch aus der Git-Historie); technischer
Name überall `kaloriendingens`. Aus Kompatibilität unverändert: Session-Cookie
`cal_session`, Docker-Volume `cal-data`, DB-Datei `kalorien.sqlite`.
**Zweck:** Eine selbst gehostete Webanwendung zum Abnehmen: Lebensmittel mit
Nährwerten pflegen, tagesweise erfassen was/wann gegessen wurde, Ziele für
Kalorien und Eiweiß setzen und kurz- wie langfristig auswerten (inkl.
Kaloriendefizit, Gewichtstrend und Prognosen).

Technisch wie das Schwesterprojekt **quitt-o-matic** aufgebaut (React/Vite +
Express + better-sqlite3, Mandantenfähigkeit, Login), hört aber auf Port
**3010**. Repo: `https://github.com/jmoekamp/kaloriendingens` (zusätzlich
lokales Gitea; `git push origin` pusht auf beide).

## Datenschutz (höchste Priorität)

- Alles läuft und bleibt lokal im eigenen Netzwerk. KEINE Cloud, keine
  Telemetrie, keine externen Tracker oder CDNs. Standardmäßig kommt die App
  vollständig ohne Außenkontakt aus.
- **Einzige, bewusst freigegebene Ausnahme:** der **Open-Food-Facts-Import**
  unter „Lebensmittel". Rein **opt-in** (nur bei expliziter Suche), **lesend**
  und **per Server-Proxy** (der Browser spricht nur mit der App). Kein
  Import-Vorgang ⇒ kein Außenkontakt. Keine weiteren externen Dienste.
- Alle Abhängigkeiten (inkl. Schrift Atkinson Hyperlegible) werden lokal
  gebündelt.
- Die Datenbank liegt als lokale Datei vor und lässt sich einfach sichern.

## Funktionsumfang (Kurzüberblick – Details in FEATURES.md)

- **Lebensmittel** mit kcal/Eiweiß (+ optional Fett/KH/Ballaststoffe,
  Packungsgröße, Bestand mit „gegessen"-Abzug), Kennzahlen, Sortierung,
  Inline-Bearbeitung, OFF-Import (Name/Barcode).
- **Tageserfassung** mit „gegessen"-Häkchen (nur Gegessenes zählt in die
  Statistik; Planung möglich, auch für Zukunftstage), Bewegung,
  Tagesgewicht (+ Fettanteil), Zusammenfassung mit Defizit.
- **Ziele/Vorgaben** zeitversioniert; **Gesamtumsatz** manuell oder berechnet
  (Mifflin-St Jeor oder Katch-McArdle, tagesgenau mit Carry-forward).
- **Abnehmziel** mit Fortschritt, Gewichtsbalken, 5-kg-Meilensteinen und
  **eingefrorenen** Trend-/Median-Prognosen (Update nur bei erreichtem
  Zwischenziel).
- **Langfrist-Diagramme** (6 Stück, eigener SVG-LinienChart), **Allzeit- und
  Detailreport** mit TSV-Export, **Spalten ein-/ausblenden** an allen
  Tabellen, **Backup-Download**.

## Einheiten-Konvention

Analog zum Cent-Prinzip: alles als Ganzzahl halten, erst zur Anzeige
formatieren.
- **kcal:** ganze Kilokalorien (INTEGER).
- **Eiweiß/Fett/KH/Ballaststoffe:** Dezigramm (1 dg = 0,1 g), z. B. 12,5 g = 125.
- **Menge/Gewicht:** ganze Gramm. **Fettanteil:** Promille (25,4 % = 254).
- Datum ISO (YYYY-MM-DD), Uhrzeit HH:MM.
Zentrale Stelle für Rechnung/Formatierung/Zielbewertung: `shared/naehrwerte.ts`.

## Mandantenfähigkeit & Zugriffsschutz (AKTIV)

Alle Fachtabellen haben `mandant_id` (NOT NULL, Standard 1) mit Index. Login
per Benutzername/Passwort (scrypt), Session als httpOnly-Cookie
(`cal_session`, SameSite=Strict) mit serverseitiger `sessions`-Tabelle. Der
Mandant des Nutzers wird je Request über einen `AsyncLocalStorage` geführt
(`aktuellerMandant()`), sodass jede Query automatisch filtert. Admin-Realm =
Mandant 0 (nur Nutzerverwaltung, kein Zugriff auf Fachdaten). **Neue
Passwörter** müssen mindestens 8 Zeichen lang sein (`requireNeuesPasswort` in
`server/validation.ts`; bestehende Passwörter/Login unberührt). Weitere
Härtung (`server/index.ts`): Login-Rate-Limit (5 Fehlversuche/min/IP),
Dummy-Hash gegen Username-Enumeration, `X-Powered-By` deaktiviert, Header
nosniff/DENY/no-referrer, kaputtes JSON → 400. Erst-Accounts beim ersten
Start: `admin/admin` (Mandant 0) und `joerg/joerg` (Mandant 1) – Passwörter
nach dem ersten Login ändern.

## Tech-Stack

- **Frontend:** React (mit Vite), TypeScript, Tailwind CSS, Dark Mode.
- **Backend:** Node.js mit Express (läuft zur Laufzeit direkt über `tsx`).
- **Datenbank:** SQLite (better-sqlite3) – eine lokale Datei.
- **Charts:** selbst gezeichnete SVG-Liniengraphen (keine externe Abhängigkeit).
- **Tests:** Vitest.

## Projektstruktur

```
FEATURES.md     – vollständiger Funktionsumfang (bei Änderungen mitpflegen!)
DEPLOY.md       – Docker-Betrieb, Update, Backup
/src
  /components   – wiederverwendbare React-Komponenten (LinienChart, SpaltenWahl, ui)
  /pages        – Seiten (Tag, Langfrist/Auswertung, Allzeit, Lebensmittel, Einstellungen, Benutzer)
  /lib          – API-Client und Hilfsfunktionen
/server
  /routes       – Express-Routen (lebensmittel, eintraege, auswertung, auth, ...)
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
  ballaststoffe_dg_pro_100g (optional, dg je 100 g), packung_gramm (optional),
  bestand_gramm (optional; Vorrat, wird durch „gegessen" reduziert),
  Zeitstempel.
- `eintraege`: id, mandant_id, datum, uhrzeit, lebensmittel_id (FK),
  menge_gramm, gegessen (0/1: zählt nur bei 1 in die Statistik), Zeitstempel.
  kcal/Eiweiß werden live berechnet.
- `vorgaben`: zeitversionierte Ziele + Gesamtumsatz (gueltig_ab, kcal_ziel,
  kcal_ziel_typ, eiweiss_ziel_dg, eiweiss_ziel_typ, gesamtumsatz). Für einen
  Tag gilt die jüngste Vorgabe mit `gueltig_ab ≤ Tag`; vor der ersten die
  älteste. Das Defizit rechnet je Tag mit dem damals gültigen Gesamtumsatz.
- `abnehmziele`: gueltig_ab, ziel_gramm. Aktiv ist das jüngste Ziel mit
  `gueltig_ab ≤ heute`; nötiges Defizit = ziel_gramm/1000 × 7000 kcal.
- `bewegung`: datum, uhrzeit, beschreibung, kcal (Aktivitätskalorien; je Tag
  zum Gesamtverbrauch addiert).
- `gewicht`: datum, gramm, fett_promille (optional), aus_trend (0/1). Ein
  Tagesgewicht je (mandant_id, datum).
- `meilenstein_prognosen`: quelle ('trend'|'median'), gramm, prognose,
  erreicht, festgehalten_am. Eingefrorene Prognosen; Update nur beim Erreichen
  eines Zwischenziels bzw. bei geänderter Meilenstein-Liste.
- `einstellungen`: Key-Value je Mandant – Migrationsquelle für `vorgaben` UND
  Speicher der Körperdaten (`koerper_*`, `gesamtumsatz_modus`,
  `gesamtumsatz_formel`).
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
- Nährwerte IMMER als Ganzzahl speichern (siehe Einheiten-Konvention).
- Logik nach `/shared` bzw. `/server` auslagern, Komponenten klein halten.
- Zu neuer Funktionalität mindestens einen Test schreiben.
- **Neue oder geänderte Features in FEATURES.md dokumentieren** (nicht hier).
- Schema-Änderungen idempotent über `ensureColumn`/`CREATE TABLE IF NOT
  EXISTS` in `server/db/schema.ts` (Migration läuft beim Start).

## Was Claude NICHT tun soll

- KEINE externen Dienste, Cloud-APIs, CDNs, Telemetrie oder extern geladene
  Schriften einbauen – die App bleibt vollständig lokal. Einzige, ausdrücklich
  vom Nutzer freigegebene Ausnahme: der lesende Open-Food-Facts-Import per
  Server-Proxy (opt-in). Keine weiteren Außenkontakte ohne erneute Rücksprache.
- Keine Abhängigkeiten hinzufügen, ohne kurz zu begründen warum.
- Keine bestehenden Tests löschen oder durch Auskommentieren „grün machen".
- Keine Secrets, Passwörter oder echten Gesundheitsdaten in Commits ablegen.
