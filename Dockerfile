# syntax=docker/dockerfile:1

############################################################
# Build-Stage: Quellcode aus Git holen, Abhängigkeiten und
# Frontend (dist/) bauen. Enthält die Build-Toolchain für das
# native Modul better-sqlite3.
############################################################
FROM node:20-bookworm-slim AS builder

# git zum Klonen; python3/make/g++ als Fallback, falls für
# better-sqlite3 kein vorgefertigtes Binary verfügbar ist.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git ca-certificates python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Woher und welcher Stand geholt wird – über Build-Args steuerbar.
ARG GIT_REPO=https://github.com/jmoekamp/kaloriendingens.git
ARG GIT_REF=main
# Update-Hebel: Mit einem GEÄNDERTEN Wert (z. B. CACHEBUST=$(date +%s)) wird der
# Clone – und nur ab hier alles Folgende – neu ausgeführt. Die darüberliegende
# apt-get-Schicht bleibt im Cache, es werden also KEINE System-Pakete neu
# geladen. Deshalb beim Update NICHT mehr `--no-cache` verwenden (siehe DEPLOY.md).
ARG CACHEBUST=1

RUN git clone --depth 1 --branch "${GIT_REF}" "${GIT_REPO}" . \
 && rm -rf .git

# WICHTIG: hier KEIN NODE_ENV=production setzen – sonst lässt npm die
# devDependencies aus, die zum Bauen (vite, typescript) und zum Betrieb
# (tsx, cross-env) gebraucht werden.
#
# --mount=type=cache: persistenter npm-Cache (/root/.npm), der über Builds hinweg
# erhalten bleibt (auch bei --no-cache). Bereits geladene Pakete werden daraus
# installiert, statt sie erneut aus dem Netz zu holen. npm ci läuft trotzdem
# gegen das frisch geklonte Lockfile – die Abhängigkeiten bleiben also korrekt.
RUN --mount=type=cache,target=/root/.npm npm ci

# Frontend nach dist/ bauen. Der Server läuft zur Laufzeit direkt aus dem
# TypeScript-Quellcode über tsx – er wird NICHT vorkompiliert.
RUN npm run build

############################################################
# Runtime-Stage: schlankes Image ohne Build-Toolchain.
############################################################
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3010 \
    DB_FILE=/app/data/kalorien.sqlite

WORKDIR /app

# Fertig gebautes App-Verzeichnis inkl. node_modules übernehmen (der Server
# benötigt tsx zur Laufzeit, daher werden alle Module mitgenommen).
COPY --from=builder /app /app

# Die SQLite-Datenbank liegt in diesem Pfad – als Volume eingebunden
# überlebt sie Updates und Neuaufbauten des Containers.
# Datenverzeichnis dem unprivilegierten node-Nutzer geben; die App braucht
# sonst keine Schreibrechte im Image.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME ["/app/data"]

# Nicht als root laufen (Standard-Nutzer des Node-Images).
USER node

EXPOSE 3010

# Healthcheck über den DB-gestützten /api/health-Endpunkt (Node hat fetch).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3010)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# NODE_ENV=production (oben gesetzt) sorgt dafür, dass der Server das
# gebaute Frontend aus dist/ ausliefert.
CMD ["npx", "tsx", "server/index.ts"]
