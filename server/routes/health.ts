import { Router } from 'express';
import { getDb } from '../db/index.ts';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  // Leichter DB-Ping, damit der Status auch die Datenbank abdeckt.
  const row = getDb().prepare('SELECT 1 AS ok').get() as { ok: number };
  res.json({
    status: row.ok === 1 ? 'ok' : 'degraded',
    time: new Date().toISOString(),
  });
});
