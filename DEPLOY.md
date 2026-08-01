# Betrieb im Docker-Container

Diese Anleitung beschreibt, wie Kaloriendingens in einem eigenen
Docker-Container installiert und **ohne Datenverlust** aktualisiert wird. Der
App-Code wird dabei bei jeder Installation und jedem Update **frisch aus dem
Git-Repository** geholt.

## Konzept in einem Satz

Das Image baut sich, indem es den Quellcode aus Git klont und das Frontend
baut. Die **Datenbank liegt außerhalb des Images** in einem Docker-Volume
(`cal-data`, eingebunden unter `/app/data`). Ein Update tauscht nur das Image
aus – das Volume bleibt unangetastet, die Daten bleiben erhalten.

```
Git-Repository ──(clone beim Build)──► Image ──► Container
                                                    │
                          /app/data  ◄── Volume "cal-data" (Daten, bleibt bei Updates)
```

## Voraussetzungen

- Docker mit Docker-Compose-Plugin (`docker compose ...`).
- Netzwerkzugriff des Build-Hosts auf das Git-Repository
  (`https://github.com/jmoekamp/kaloriendingens.git`) und auf die
  npm-Registry.

## Benötigte Dateien

Für den Betrieb genügen **zwei Dateien**: `Dockerfile` und `compose.yaml`
(beide liegen im Repo bei). Alles Weitere holt sich der Build aus Git. Lege dir
auf dem Docker-Host am besten einen eigenen Ordner an und kopiere nur diese
beiden Dateien hinein, z. B.:

```
~/docker/kaloriendingens/
├── Dockerfile
└── compose.yaml
```

> Hinweis: Die `token.env` aus dem Projekt ist ein Geheimnis (in `.gitignore`)
> und wird bewusst **nicht** mit ins Image gebaut. Sie wird im Container nicht
> benötigt.

## Erstinstallation

Im Ordner mit `compose.yaml`:

```bash
docker volume create cal-data   # einmalig (Volume ist als external deklariert)
docker compose up -d --build
```

Das klont die App aus Git, baut das Image und startet den Container mit dem
Volume `cal-data`. Beim ersten Start wird die leere SQLite-Datenbank samt
Schema automatisch angelegt.

> Das Volume ist in der `compose.yaml` als `external` deklariert, weil es auf
> Bestandssystemen noch unter dem früheren Projektnamen angelegt wurde –
> Compose würde sonst bei jedem `up` eine Besitz-Warnung ausgeben. Existiert
> es bereits (Update/Umbenennung), entfällt das `docker volume create`.

Aufrufen im Browser:

```
http://<host>:3010
```

**Erste Anmeldung:** Beim allerersten Start werden zwei Nutzer angelegt:

- `admin` / `admin` – Administrator (Mandant 0): nur Nutzerverwaltung, kein Datenzugriff.
- `joerg` / `joerg` – Daten-Nutzer (Mandant 1): erfasst Lebensmittel, Mahlzeiten,
  Bewegung und Gewicht.

Beide Standard-Passwörter direkt nach dem ersten Login in den Einstellungen ändern
(Karte „Passwort ändern"). Sicherheitshinweis: Der Login läuft über lokales HTTP; bei
Erreichbarkeit über ein echtes Netz einen HTTPS-Reverse-Proxy davorschalten.

Status prüfen:

```bash
docker compose ps
docker compose logs -f app
curl http://localhost:3010/api/health      # {"status":"ok",...}
```

## Update (ohne Datenverlust)

Der Build holt den Code per `git clone`. Damit Docker dabei wirklich den
aktuellen Stand zieht (statt der zwischengespeicherten Clone-Schicht), wird der
Build-Arg `CACHEBUST` mit einem neuen Wert übergeben – das löst nur den Clone
und alles danach neu aus:

```bash
docker compose build --build-arg CACHEBUST=$(date +%s)
docker compose up -d
```

> **Wichtig – die `Dockerfile` liegt auf dem Docker-Host** (nicht im Image) und
> wird NICHT über den Clone aktualisiert. Nach Änderungen am Dockerfile (z. B. am
> CACHEBUST-Mechanismus) muss die neue `Dockerfile` aus dem Repo **auf den Host
> kopiert** werden, sonst baut Docker weiter nach der alten Vorlage.

> **BuildKit-Fallstrick (Grund, warum CACHEBUST scheinbar wirkungslos ist):**
> Unter BuildKit (durch `# syntax=docker/dockerfile:1` aktiv) invalidiert ein
> `ARG`, das im folgenden `RUN` **nicht referenziert** wird, den Cache NICHT –
> der `git clone` käme trotz neuem Wert aus dem Cache. Deshalb referenziert der
> `RUN` das `CACHEBUST` jetzt aktiv (`echo "cachebust=${CACHEBUST}"`). Mit einer
> älteren Dockerfile-Version bleibt der alte Stand hängen; einmalig hilft dann
> `docker compose build --no-cache`.

**Verifizieren, dass der neue Stand wirklich im Container ist:**

```bash
# Datum des laufenden Images
docker compose images
# Stichprobe im laufenden Container (Beispiel: ein Merkmal des neuen Stands)
docker compose exec app grep -c meilenstein_prognosen server/db/schema.ts   # > 0 = neuer Stand
```

**Wichtig:** beim Update **kein `--no-cache`** verwenden. So bleibt die
`apt-get`-Schicht im Cache (keine System-Pakete neu laden) und der persistente
npm-Cache greift – bereits geladene Pakete werden **nicht erneut
heruntergeladen**, sondern aus dem Cache installiert. Nur tatsächlich geänderte
Abhängigkeiten werden noch geladen.

> Der npm-Cache ist ein BuildKit-Cache-Mount (`/root/.npm`). Voraussetzung ist
> BuildKit, das in aktuellen Docker-Versionen Standard ist (Docker Compose v2).
> Der Cache überlebt Builds; geleert wird er nur bewusst mit
> `docker builder prune`.

`docker compose up -d` ersetzt den laufenden Container durch einen neuen aus dem
frischen Image. **Das Volume `cal-data` bleibt dabei erhalten** – die Daten
sind unverändert vorhanden.

Aufräumen alter, ungenutzter Images (optional):

```bash
docker image prune -f
```

### Auf einen bestimmten Stand aktualisieren

Standardmäßig wird der Branch `main` geholt. Für einen reproduzierbaren Stand
einen Tag oder Commit angeben – entweder in `compose.yaml` unter
`build.args.GIT_REF` oder einmalig auf der Kommandozeile (mit `CACHEBUST`, damit
der Clone neu läuft):

```bash
docker compose build --build-arg GIT_REF=v1.2.0 --build-arg CACHEBUST=$(date +%s)
docker compose up -d
```

### Vollständiger Neuaufbau (selten)

Falls doch einmal alles frisch gebaut werden soll (z. B. neue Node-Basis):

```bash
docker compose build --no-cache
docker compose up -d
```

Auch hier bleibt der npm-Cache erhalten – die Paket-Downloads fallen also nicht
komplett neu an.

## Daten sichern und wiederherstellen

**Schnellweg (in der App):** In den Einstellungen gibt es „Backup herunterladen".
Der Daten-Nutzer erhält eine eigenständige SQLite-Datei mit nur seinen Daten, der
Admin eine Vollkopie aller Mandanten (inkl. Nutzertabelle). Das Backup ist konsistent,
auch während die App läuft (kein Stopp nötig).

Für ein vollständiges Volume-Backup auf Dateiebene weiterhin der folgende Weg.
Die Datenbank nutzt den WAL-Modus (zusätzliche `-wal`/`-shm`-Dateien). Für ein
konsistentes Backup den Container kurz anhalten und das ganze Volume sichern.

**Backup:**

```bash
docker compose stop app
docker run --rm \
  -v cal-data:/data:ro \
  -v "$PWD":/backup \
  busybox sh -c "tar czf /backup/cal-backup-$(date +%F).tar.gz -C /data ."
docker compose start app
```

Es entsteht eine Datei `cal-backup-JJJJ-MM-TT.tar.gz` im aktuellen Ordner.
Diese Datei an einen sicheren Ort kopieren.

**Wiederherstellen** (überschreibt die aktuellen Daten im Volume):

```bash
docker compose stop app
docker run --rm \
  -v cal-data:/data \
  -v "$PWD":/backup \
  busybox sh -c "rm -rf /data/* && tar xzf /backup/cal-backup-JJJJ-MM-TT.tar.gz -C /data"
docker compose start app
```

Ein Update sollte man am besten erst **nach** einem frischen Backup machen.

## Konfiguration

Alles über Umgebungsvariablen bzw. Build-Args steuerbar:

| Stelle                         | Variable   | Standard                    | Zweck                                                                |
| ------------------------------ | ---------- | --------------------------- | -------------------------------------------------------------------- |
| `compose.yaml` → `ports`       | –          | `3010:3010`                 | Host-Port (links) frei wählbar, z. B. `8080:3010`.                   |
| `compose.yaml` → `environment` | `PORT`     | `3010`                      | Port **im** Container. Bei Änderung auch rechte Port-Seite anpassen. |
| `compose.yaml` → `environment` | `DB_FILE`  | `/app/data/kalorien.sqlite` | Pfad der DB-Datei (im Volume belassen).                              |
| `compose.yaml` → `build.args`  | `GIT_REPO` | GitHub-URL                  | Quelle des Codes.                                                    |
| `compose.yaml` → `build.args`  | `GIT_REF`  | `main`                      | Branch, Tag oder Commit.                                             |

### Privates Git-Repository

**Bei einem öffentlichen Repository ist für den Build KEINE Anmeldung nötig** –
die Standard-URL genügt (ein Token braucht nur, wer pusht). Nur falls das
Repository privat ist, die Zugangsdaten in `GIT_REPO`
mitgeben (am besten ein **lesendes** GitHub-Token (Fine-grained PAT, Contents: Read)):

```yaml
GIT_REPO: https://<benutzer>:<token>@github.com/jmoekamp/kaloriendingens.git
```

> Sicherheitshinweis: Build-Args können über `docker history` sichtbar sein.
> Für eine reine LAN-Installation ist das meist vertretbar; verwende dennoch ein
> Token mit minimalen Rechten und keinesfalls dein Hauptpasswort.

## Wichtige Warnungen

- **Niemals** `docker compose down -v` benutzen – das `-v` löscht das Volume und
  damit **alle Daten**. Ein einfaches `docker compose down` (ohne `-v`) ist
  ungefährlich; das Volume bleibt erhalten.
- Das benannte Volume `cal-data` ist die einzige Stelle, an der deine Daten
  liegen. Es wird durch Image-Neubauten, Container-Neustarts und Updates **nicht**
  berührt.

## Troubleshooting

- **`dist/ nicht gefunden` im Log:** Der Frontend-Build ist fehlgeschlagen. Build
  mit `docker compose build --no-cache --progress=plain` wiederholen und die
  Ausgabe prüfen.
- **better-sqlite3 lässt sich nicht installieren:** Die Build-Stage enthält
  bereits `python3`, `make` und `g++` als Fallback. Schlägt es trotzdem fehl,
  meist fehlender Netzzugang beim Build – Erreichbarkeit von npm-Registry und
  Repository prüfen.
- **Container „unhealthy":** `docker compose logs app` ansehen. Health-Check ruft
  intern `/api/health` auf; antwortet die App dort nicht, startet sie nicht
  korrekt (z. B. DB-Pfad/Volume-Rechte).
- **Welcher Stand läuft gerade?** `docker compose logs app | head` zeigt den
  Startlog; für den genauen Commit `GIT_REF` auf einen Tag/Commit pinnen.
