import { Router } from 'express';
import { getDb } from '../db/index.ts';
import {
  erzeugeMandantBackup,
  erzeugeVollBackup,
  mandantBackupDateiname,
  vollBackupDateiname,
  type BackupErgebnis,
} from '../backup.ts';
import type { AuthRequest } from '../auth/middleware.ts';

export const backupRouter = Router();

/**
 * GET /api/backup – liefert einen Snapshot als Download.
 * - Admin (Mandant 0): Vollbackup der gesamten DB (alle Mandanten + Nutzer).
 * - Daten-Nutzer: Backup nur der Daten des eigenen Mandanten.
 * Die temporaere Datei wird nach dem Download wieder geloescht.
 */
backupRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const user = req.user!;
    let ergebnis: BackupErgebnis;
    let dateiname: string;
    if (user.istAdmin) {
      ergebnis = await erzeugeVollBackup(getDb());
      dateiname = vollBackupDateiname();
    } else {
      ergebnis = erzeugeMandantBackup(getDb(), user.mandantId);
      dateiname = mandantBackupDateiname(user.mandantId);
    }
    res.download(ergebnis.pfad, dateiname, (err) => {
      ergebnis.aufraeumen();
      if (err && !res.headersSent) next(err);
    });
  } catch (e) {
    next(e);
  }
});
