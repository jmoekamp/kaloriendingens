import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDb } from './db/index.ts';
import { seedUsers } from './db/seed.ts';
import { AppError } from './errors.ts';
import {
  authMiddleware,
  requireAdmin,
  requireDatenNutzer,
} from './auth/middleware.ts';
import { authAuthedRouter, authPublicRouter } from './routes/auth.ts';
import { usersRouter } from './routes/users.ts';
import { backupRouter } from './routes/backup.ts';
import { healthRouter } from './routes/health.ts';
import { lebensmittelRouter } from './routes/lebensmittel.ts';
import { eintraegeRouter } from './routes/eintraege.ts';
import { bewegungRouter } from './routes/bewegung.ts';
import { vorgabenRouter } from './routes/vorgaben.ts';
import { abnehmzieleRouter } from './routes/abnehmziele.ts';
import { auswertungRouter } from './routes/auswertung.ts';

const PORT = Number(process.env.PORT ?? 3010);
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json());

// DB beim Start oeffnen (legt Datei + Schema an) und Erst-Accounts seeden.
getDb();
seedUsers(getDb());

// Oeffentliche Routen (ohne Login): Healthcheck + Login/Logout.
app.use('/api', healthRouter);
app.use('/api/auth', authPublicRouter);

// Ab hier ist eine gueltige Session Pflicht; der Mandant des Nutzers wird gesetzt.
app.use('/api', authMiddleware);

// Konto-Routen jedes angemeldeten Nutzers (eigene Daten / Passwort).
app.use('/api/auth', authAuthedRouter);

// Nutzerverwaltung nur fuer den Admin (Mandant 0).
app.use('/api/users', requireAdmin, usersRouter);

// Fachdaten – nur fuer Daten-Nutzer (Mandant >= 1); der Admin ist hier gesperrt.
app.use('/api/lebensmittel', requireDatenNutzer, lebensmittelRouter);
app.use('/api/eintraege', requireDatenNutzer, eintraegeRouter);
app.use('/api/bewegung', requireDatenNutzer, bewegungRouter);
app.use('/api/vorgaben', requireDatenNutzer, vorgabenRouter);
app.use('/api/abnehmziele', requireDatenNutzer, abnehmzieleRouter);
app.use('/api/auswertung', requireDatenNutzer, auswertungRouter);

// Backup: fuer beide Rollen erlaubt, Inhalt richtet sich nach der Rolle.
app.use('/api/backup', backupRouter);

// In Produktion das gebaute Frontend (dist) ausliefern.
if (isProd) {
  const distDir = resolve(process.cwd(), 'dist');
  if (existsSync(distDir)) {
    app.use(express.static(distDir));
    // SPA-Fallback: alles ausser /api auf index.html
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(resolve(distDir, 'index.html'));
    });
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      'dist/ nicht gefunden – bitte zuerst "npm run build" ausfuehren.',
    );
  }
}

// Zentrale Fehler-Middleware: uebersetzt AppError in { error }, alles andere 500.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // eslint-disable-next-line no-console
  console.error('Unerwarteter Fehler:', err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend laeuft auf http://localhost:${PORT} (api unter /api)`);
});
