# Funktionsumfang von Kaloriendingens

> Referenz aller Funktionen der App – wird bei jeder Feature-Änderung
> mitgepflegt (siehe CLAUDE.md, Abschnitt „Konventionen und Regeln").
> Architektur, Datenmodell und Entwicklungsregeln stehen in der CLAUDE.md.

## Lebensmittel (Stammdaten)

Anlegen/Bearbeiten/Löschen mit kcal und Eiweiß, jeweils bezogen auf 100 g,
optional zusätzlich **Fett, Kohlenhydrate und Ballaststoffe** je 100 g
(Dezigramm-Ganzzahlen wie Eiweiß, null = nicht erfasst), plus optionaler
**Packungsgröße** (g). Die Liste zeigt je Zeile zusätzlich abgeleitete (nicht
editierbare) Kennzahlen: **Eiweiß/kcal** (g Eiweiß je kcal), **g/kcal** (Gramm
je kcal) und **g/g Eiweiß** (Gramm je Gramm Eiweiß) sowie **kcal/Packung**
(kcal der ganzen Packung, „—" ohne Packungsgröße). Die Tabelle ist per Klick
auf die Spaltenköpfe sortierbar (erneuter Klick dreht die Richtung; leere
Werte ans Ende). „Bearbeiten" öffnet die Eingabefelder **inline direkt unter
der Tabellenzeile** (kein Hochscrollen); das obere Formular dient nur dem
Anlegen. Ein Lebensmittel, das noch in Einträgen verwendet wird, kann NICHT
gelöscht werden (strikter Löschschutz).

## Bestand (Vorrat)

Je Lebensmittel optional ein **Bestand** in Gramm (`bestand_gramm`; leer =
Bestand wird nicht geführt). Beim Ankreuzen von „gegessen" wird die Menge des
Eintrags abgezogen; Abwählen, Löschen oder Mengen-Änderung eines gegessenen
Eintrags buchen symmetrisch zurück bzw. um (`passeBestandAn` in
`server/repos/eintraege.ts`). Der Bestand darf dadurch negativ werden (rote
Anzeige statt stillem Deckel); die „gegessen"-Migration (alle bis gestern)
lässt den Bestand bewusst unberührt. Im Formular gibt es eine **Eingabehilfe**
„Anzahl × Packungsgröße = übernehmen"; die Tabelle zeigt den Bestand
(Tooltip: ≈ Packungen).

## Open-Food-Facts-Import

Import per **Namenssuche** oder präzise per **Barcode/EAN**: Der Server ruft
OFF ab (`GET /api/lebensmittel/off-suche?q=` über Search-a-licious bzw.
`GET /api/lebensmittel/off-produkt?code=` über die API v2; `server/off.ts`,
`sucheOpenFoodFacts`/`holeOffProdukt`/`mapOffProdukt`), liefert Treffer mit
Name (Marke vorangestellt), kcal/100 g (kJ→kcal-Fallback), Eiweiß, Fett,
Kohlenhydraten und Ballaststoffen je 100 g sowie Packungsgröße (g/kg; ml/l
werden verworfen). EAN = 8–14 Ziffern (`istGueltigeEan`); unbekannte Barcodes
→ 404. „Übernehmen" füllt NUR leere Felder – bereits eingegebene/bestehende
Werte bleiben unverändert (auch der Bearbeiten-Modus bleibt erhalten). Das ist
der einzige Außenkontakt der App (siehe CLAUDE.md, Datenschutz).

## Tageserfassung & „gegessen"

Je Eintrag Uhrzeit, Lebensmittel (Auswahl), Menge in g und ein
**„gegessen"-Häkchen**. kcal und Eiweiß eines Eintrags werden LIVE aus dem
Lebensmittel und der Menge berechnet, nicht gespeichert (ändert man die
Nährwerte, ändern sich vergangene Auswertungen entsprechend mit). Hat das
gewählte Lebensmittel eine Packungsgröße, füllt ein Button „ganze Packung" die
Menge. Mahlzeiten lassen sich inline bearbeiten (Uhrzeit + Menge).

**Nur als „gegessen" markierte Einträge zählen in die Statistik** (Tages-
Summen, Ziele, Zusammenfassung/Defizit, alle Verläufe und Langfrist-
Auswertungen); nicht gegessene Einträge bleiben in der Mahlzeiten-Liste
sichtbar (ausgegraut, mit Häkchen umschaltbar) und dienen der Planung. Neu
angelegte Einträge sind per UI zunächst **nicht** gegessen; das Repo
(`createEintrag`) nimmt ohne Angabe hingegen „gegessen" an (programmatischer
Standard). Umschalten per `PATCH /api/eintraege/:id/gegessen`; **beim
Ankreuzen** wird zugleich die Uhrzeit auf die aktuelle Zeit gesetzt
(tatsächliche Essenszeit; optionales `{ uhrzeit }`, beim Abwählen
unverändert). Für Bestandsdaten gibt es unter „Einstellungen" einen Button,
der einmalig alle bis **einschließlich gestern** erfassten Mahlzeiten als
gegessen markiert (`POST /api/eintraege/migriere-gegessen`,
`markiereGegessenBis`).

## Planung / Zukunftsdaten

Zu jedem Tag – auch in der Zukunft – lassen sich Daten erfassen (Planung).
Tage mit Datum > heute fließen in KEINE Statistik ein (Defizit, Prognosen,
Verläufe, Diagramme, „letzte Tage"). Nur die Tagesansicht selbst zeigt den
geplanten Tag; sie ist als „geplant" gekennzeichnet.

## Bewegung erfassen

Zweiter Abschnitt auf der Tagesseite. Je Eintrag Datum, Uhrzeit, Beschreibung
und Aktivitätskalorien. Die Aktivitätskalorien eines Tages werden zum
Gesamtverbrauch dieses Tages hinzugezählt (Gesamtverbrauch = Gesamtumsatz +
Aktivitätskalorien) und erhöhen so das Tagesdefizit. Ein Tag zählt fürs
Defizit weiterhin nur, wenn er Lebensmittel-Einträge hat; die Aktivität erhöht
dann den Verbrauch dieses Tages.

## Tagesgewicht & Körperfettanteil

Pro Tag lässt sich ein Gewicht (kg) eingeben (eine Waage-Eingabe je Tag,
Upsert), optional mit **Körperfettanteil** in % (`fett_promille`,
Promille-Ganzzahl: 25,4 % = 254; Basis für Katch-McArdle). Wird auf der
Auswertungsseite als Liniendiagramm über den gewählten Zeitraum gezeigt
(y-Achse skaliert auf den Datenbereich, nicht ab 0). Je Messung lässt sich
„**Aus Trendberechnung ausschließen**" setzen (`aus_trend`): der Punkt bleibt
in der Kurve sichtbar (hohl dargestellt), fließt aber nicht in die
Regressionsgerade/Trendrate ein – gedacht für die ersten Tage mit starkem
Wasserverlust. Die Ausschluss-Liste ist auf der Auswertungsseite einklappbar
unter dem Gewichtsdiagramm erreichbar.

## Ziele & zeitversionierte Vorgaben

Kalorien- und Eiweißziel, je als Minimum ODER Maximum definierbar. Ziele und
Gesamtumsatz werden je Stichtag (`gueltig_ab`) gespeichert. Eine neue Vorgabe
ändert nur Tage ab ihrem Stichtag; frühere Tage behalten die davor gültige
Vorgabe. So lässt sich der mit sinkendem Gewicht sinkende Gesamtumsatz korrekt
über die Zeit abbilden.

## Gesamtumsatz (manuell / Mifflin-St Jeor / Katch-McArdle)

Täglicher Gesamtumsatz (kcal/Tag) als Grundlage für das Kaloriendefizit.
Umschaltbar **manuell** (versionierter Wert je Vorgabe) oder **berechnet** aus
Körperdaten und dem **an dem Tag gültigen Gewicht** (letzte Messung ≤ Tag).
Die Grundumsatz-**Formel** ist wählbar (`formel`): **Mifflin-St Jeor** (Größe,
Geschlecht, Geburtsjahr) oder **Katch-McArdle** (370 + 21,6 × Magermasse;
Magermasse = Gewicht × (1 − tagesgültiger Fettanteil)). Fehlt an einem Tag der
Fettwert, gilt der **letzte davor** (Carry-forward, KEIN Rückgriff auf spätere
Messungen); für Tage vor der ersten Fettmessung – und wenn nie einer erfasst
wurde – greift Mifflin als Rückfall (sofern Größe/Geburtsjahr gesetzt), ohne
Gewicht der manuelle Wert. Die Aktivitätsstufen (PAL) folgen den
DGE-Referenzwerten (`AKTIVITAETSSTUFEN` in `shared/umsatz.ts`). Der
Gesamtumsatz sinkt so automatisch mit dem Gewicht. (`shared/umsatz.ts`:
`grundumsatzMifflin`/`grundumsatzKatchMcArdle`, Körperdaten in der
Key-Value-Tabelle, `gesamtumsatzFuerTag` in `server/repos/auswertung.ts`.)

## Abnehmziel, Prognosen & Meilensteine

Abnehmziel = abzunehmendes Gewicht (kg) ab einem Stichtag; nötiges
Gesamtdefizit = Gewicht × 7000 kcal/kg. Die Auswertungsseite zeigt den
Fortschritt in Prozent: erreichtes Defizit seit dem Stichtag (nur Tage mit
Einträgen, je Tag mit dem damals gültigen Gesamtumsatz) / nötiges Defizit.
Das erste angelegte Abnehmziel bekommt als Startdatum standardmäßig
„heute − 1 Monat". Drei Prognosen für das Erreichen des Restdefizits: beim
Median-Tagesdefizit seit Festlegung, beim Defizit wie am Vortag und – rein
messbasiert – **aus dem Gewichtstrend** (lineare Regression über die nicht
ausgeschlossenen Messungen; `prognose_gewichtstrend`,
`trend_gramm_pro_woche`).

Neben dem Defizit-Balken gibt es zwei Gewichtsbalken: (a) **seit Festlegung**
(Startgewicht = erste NICHT ausgeschlossene Messung ab `gueltig_ab`, ohne
Wasser-Tage) und (b) **ab der ersten Messung** (allererste Messung inkl.
ausgeschlossener Tage). Beide gegen das aktuelle Gewicht, im Verhältnis zum
Ziel. Für den „ab erster Messung"-Balken wird das Ziel um die anfängliche
(ausgeschlossene) Abnahme erweitert (`ziel_gesamt_gramm`), damit beide Balken
beim selben Zielgewicht 100 % erreichen.

**Meilenstein-Karten:** Der Gewichtstrend steht in einer eigenen Karte samt
**5-kg-Meilenstein-Übersicht** (`meilensteine`): je durch 5 teilbarem ganzen
Kilo bis zum Ziel die Prognose bzw. – wenn erreicht – das tatsächliche Datum
plus „X Tage früher/später". Zusätzlich enthält die Liste die Gewichte an den
**BMI-Grenzen 30** (Adipositas-Grenze) und **25** (Obergrenze Normalgewicht)
als markierte Meilensteine („(BMI 30)"/„(BMI 25)", Feld `bmi`) – absteigend
einsortiert, sofern die Größe gesetzt ist und der jeweilige Wert unter dem
Startgewicht liegt; sie können auch hinter dem Zielgewicht liegen. Fällt eine
BMI-Grenze exakt auf einen 5-kg-Schritt, wird dieser markiert. Die
**BMI-Formel ist in den Körperdaten wählbar** (`bmi_formel`):
**Standard** (WHO, kg/m² → Gewicht = 25 × m²) oder **Trefethen-Korrektur**
(Nick Trefethen, 2013: BMI = 1,3 · kg / m^2,5 → Gewicht = 25 × m^2,5 / 1,3;
gleicht aus, dass der klassische BMI große Menschen zu dick und kleine zu dünn
rechnet). `gewichtBeiBmi` in `shared/umsatz.ts`; ein Formelwechsel ändert die
Meilenstein-Liste und löst damit das Neu-Festhalten der Prognosen aus. Eine **zweite Karte „Defizit-Median (gleitend,
7 Tage)"** zeigt dieselbe Tabelle (gemeinsame Komponente
`MeilensteinTabelle`), aber die Prognose stammt aus dem **gleitenden
7-Tage-Median des Tagesdefizits**: Abnahmerate = Median_kcal / 7
(7000 kcal/kg); vergangene Tage aufsummiert, Zukunft linear extrapoliert.
„Erreicht am" stammt immer aus den echten Messungen. Felder:
`defizit_median_kcal`, `defizit_median_gramm_pro_woche`,
`prognose_defizit_median`, `meilensteine_defizit_median` (`gleitenderMedian`
in shared/naehrwerte).

**Eingefrorene Prognosen:** Die Meilenstein- und Zieltermin-Prognosen beider
Karten werden festgehalten (Tabelle `meilenstein_prognosen`,
`frierePrognosenEin` in `server/repos/prognosen.ts`) und ändern sich NUR, wenn
ein Zwischenziel erreicht wird (oder sich die Meilenstein-Liste ändert, z. B.
neues Abnehmziel) – sonst würde der vorhergesagte Termin mit jeder Messung
wandern und taugte nicht als Vergleichsbasis. Erreichte Meilensteine behalten
ihre damals festgehaltene Prognose dauerhaft; „früher/später" rechnet gegen
sie. Die Raten (kg/Woche, Median kcal/Tag) bleiben live. Felder
`prognosen_stand_trend`/`_median` zeigen das Festhalte-Datum.

## Tagesauswertung

Lebensmittel eines Tages mit kcal/Eiweiß, Summen und Abweichung vom Ziel.
Default ist heute; jeder Tag ist anwählbar (Datumsnavigation). Über der
Zusammenfassung stehen vier Kacheln: **Kalorien (gegessen)** und **Eiweiß
(gegessen)** mit Zielbewertung sowie **Kalorien (geplant)** und **Eiweiß
(geplant)** als reine Summen der noch nicht gegessenen Einträge. Die
Mahlzeiten-Tabelle zeigt im Fuß drei Summenzeilen: **Summe (gegessen)**,
**Summe (geplant)** und **Summe (gegessen + geplant)**. Eine
**Zusammenfassungs-Karte** zeigt „Gesamtumsatz + Bewegung − Aufnahme =
Defizit" in zwei Zeilen: „gegessen:" (nur gegessene Aufnahme, wie in der
Statistik) und „inkl. geplant:" (Aufnahme = gegessen + geplant). Die
Eiweiß-Zielkarte zeigt zusätzlich das **Eiweiß je kg Körpergewicht** des Tages
(g/kg, Richtwert 1,6–2,0 g/kg) auf Basis des tagesgültigen
(Carry-forward-)Gewichts (`eiweissProKgKoerper` in `shared/naehrwerte.ts`).

## Langfrist-Auswertung (Diagramme)

Liniengraphen für einen wählbaren Zeitraum (Default: letzte 30 Tage), alle
mit derselben datumsbasierten x-Achse (von–bis); jeder Punkt liegt an seinem
echten Datum, an Tagen ohne Daten wird nichts gezeichnet:

1. **Kalorien pro Tag** und 2. **Eiweiß pro Tag** – Linie bricht an Lücken ab
   (nur aufeinanderfolgende Kalendertage verbunden).
2. **Gewicht (kg)** – durchgehende Linie über die Messpunkte (`verbinden`),
   gestrichelte **lineare Ausgleichsgerade** (Regression) mit Trendrate
   kg/Woche, kleines Label je Messpunkt mit der **Gewichtsreduktion in kg**
   gegenüber der vorherigen Messung (`punktLabel`), plus blaue Linie mit dem
   **auf Defizitbasis prognostizierten Gewichtsverlust** (ab dem ersten nicht
   ausgeschlossenen Punkt je Tag Tagesdefizit / 7 als Gramm abgezogen).
3. **Umsatz & Aufnahme** – drei Linien (Gesamtumsatz, Gesamtumsatz + Bewegung
   = Verbrauch, Aufnahme); die Fläche zwischen Verbrauch und Aufnahme ist als
   Tagesdefizit grün/rot geschattet (`differenz`-Prop des LinienChart).
4. **Tagesdefizit** – (Gesamtumsatz + Bewegung − Aufnahme) gegen eine
   Null-Linie, grün/rot geschattet (`/api/auswertung/defizit-verlauf`).
5. **Kumulierter Gewichtsverlust** – erwarteter Verlust aus dem kumulierten
   Defizit (÷ 7000 kcal/kg) vs. gemessener Verlust (Anker − Messung), beide
   als Abnahme ab der ersten nicht ausgeschlossenen Messung
   (`kumulierteAbnahme` in `shared/naehrwerte.ts`).
6. **Abweichung Trend vs. Defizitprognose (kg/Woche)** – je Messtag die
   Differenz zwischen der gemessenen Trend-Steigung (gleitende Regression über
   die letzten 14 Tage, ohne ausgeschlossene Messungen) und der aus dem
   Defizit erwarteten Steigung. Die Erwartung wird bewusst mit **demselben
   Schätzer an denselben Stützstellen** berechnet: Regression über die
   projizierte Gewichtskurve aus dem kumulierten Defizit (−kum/7,
   7000 kcal/kg) an den Messtagen des Fensters – dadurch erzeugt eine
   Defizit-Änderung (z. B. 1500 → 1000 kcal) KEINEN Übergangs-Artefakt;
   verbleibende Ausschläge sind real (Wasser/Glykogen, Erfassung, Umsatz).
   Anzeige als Linie gegen eine Null-Linie: rot (> 0) = Abnahme langsamer als
   das Defizit erwarten ließe, grün (< 0) = schneller. Gestrichelte
   Hilfslinien markieren das Normalband ±0,25 (sehr gute Übereinstimmung) und
   ±0,5 kg/Woche (normales Rauschen); erst dauerhafte Abweichungen darüber
   hinaus sind ein Kalibrier-Signal (`hilfslinien`-Prop des LinienChart). Tage
   ohne zweite Messung bzw. ohne Defizit-Tag im Fenster entfallen
   (`steigungsAbweichung` in `shared/naehrwerte.ts`).

Zusätzlich: Liste der letzten 7 Tage mit Sprung zur jeweiligen Tagesseite
sowie das Kaloriendefizit für Tag, letzte 7 Tage, letzte 30 Tage und den
gesamten Erfassungszeitraum (kumuliert; zählt nur Tage mit Einträgen).

## Reports (Seite „Allzeit")

**Allzeitreport:** Eine Tabelle mit einer Zeile je Kalendertag von der ersten
Erfassung (Eintrag, Bewegung oder Gewicht) bis heute: Datum, gemessenes
Gewicht, Gesamtumsatz, Bewegung, Verbrauch, Aufnahme, Defizit (Verbrauch −
Aufnahme), Eiweiß, Fett, Kohlenhydrate, Ballaststoffe (alles nur gegessene
Mahlzeiten; die optionalen Nährwerte werden über Einträge mit hinterlegtem
Wert summiert – NULL fällt aus der Summe, ein Tag ganz ohne Werte bleibt
leer). Button „Tabelle kopieren" legt den Report als TSV (Tab-getrennt,
deutsche Dezimalkommas, ohne Tausenderpunkte) in die Zwischenablage – mit
Fallback für HTTP ohne Clipboard-API (`kopiereText` in
`src/lib/zwischenablage.ts`). `getAllzeitReport`,
`GET /api/auswertung/allzeit`.

**Detailreport („alles"):** Gleiche Tageszeilen, aber unter jeder stehen
zusätzlich alle Mahlzeiten (inkl. geplanter, als „(geplant)" markiert) und
Bewegungseinträge des Tages chronologisch gemischt – Spalten Datum, Uhrzeit,
Eintrag, Menge plus die Allzeit-Zahlenspalten; Mahlzeiten-kcal in der
Aufnahme-, Bewegungs-kcal in der Bewegungs-Spalte. Eigener
„Tabelle kopieren"-Button (TSV). `getDetailReport`,
`GET /api/auswertung/detail`.

## Tabellen: Spalten ein-/ausblenden

Über jeder Tabelle sitzt ein per Default EINGEKLAPPTES
„Spalten ein-/ausblenden"-Element (`<details>`) mit einer Checkbox je Spalte;
Standard: alle sichtbar. Die Auswahl wird je Tabelle in localStorage gemerkt
(`spalten.<id>`, gespeichert werden nur die ausgeblendeten Schlüssel).
Aktions-Spalten (Buttons) sind immer sichtbar; Summenzeilen passen ihre
colSpans dynamisch an. Die TSV-Exporte der Reports enthalten unabhängig von
der Auswahl immer ALLE Spalten. (`useSpaltenWahl` in
`src/components/SpaltenWahl.tsx`.)

## Datensicherung

In den Einstellungen: „Backup herunterladen" liefert eine eigenständige
SQLite-Datei (`kaloriendingens_*.sqlite`) – der Daten-Nutzer nur seine eigenen
Daten, der Admin eine Vollkopie aller Mandanten (Sessions werden aus dem
Backup entfernt). Konsistent auch im laufenden Betrieb. Details zum
Volume-Backup auf Dateiebene: DEPLOY.md.
