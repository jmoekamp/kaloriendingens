import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applySchema } from './db/schema.ts';

/**
 * Datensicherung der SQLite-Datei.
 *
 * Zwei Varianten:
 * - Vollbackup (Admin): konsistenter Snapshot der GANZEN Datei (alle Mandanten
 *   inkl. Nutzertabelle) ueber die online-Backup-API von better-sqlite3.
 * - Mandant-Backup (Daten-Nutzer): eine frische DB mit Schema, in die nur die
 *   Zeilen des eigenen Mandanten kopiert werden. Enthaelt KEINE Nutzer/Sessions
 *   und keine fremden Mandanten.
 *
 * In beiden Faellen entsteht eine eigenstaendige, direkt wiederherstellbare
 * SQLite-Datei in einem temporaeren Verzeichnis; der Aufrufer raeumt sie ueber
 * Ergebnis.aufraeumen() wieder weg.
 */

export interface BackupErgebnis {
  /** Pfad zur erzeugten Snapshot-Datei in einem temporaeren Verzeichnis. */
  pfad: string;
  /** Loescht das temporaere Verzeichnis samt Snapshot. Nach dem Ausliefern aufrufen. */
  aufraeumen: () => void;
}

/** Dateiname fuer ein Vollbackup, mit Datum. */
export function vollBackupDateiname(datum = new Date()): string {
  return `cal-o-matic_komplett_${datum.toISOString().slice(0, 10)}.sqlite`;
}

/** Dateiname fuer ein Mandant-Backup, mit Mandant und Datum. */
export function mandantBackupDateiname(
  mandantId: number,
  datum = new Date(),
): string {
  return `cal-o-matic_mandant${mandantId}_${datum
    .toISOString()
    .slice(0, 10)}.sqlite`;
}

// Geschaeftstabellen in FK-sicherer Einfuege-Reihenfolge (Eltern vor Kindern).
const MANDANT_TABELLEN = [
  'lebensmittel',
  'eintraege',
  'bewegung',
  'vorgaben',
  'abnehmziele',
  'einstellungen',
] as const;

function tempZiel(): { verzeichnis: string; pfad: string } {
  const verzeichnis = mkdtempSync(join(tmpdir(), 'cal-backup-'));
  return { verzeichnis, pfad: join(verzeichnis, 'backup.sqlite') };
}

/** Vollbackup der gesamten DB (alle Mandanten + Nutzer). */
export async function erzeugeVollBackup(
  db: Database.Database,
): Promise<BackupErgebnis> {
  const { verzeichnis, pfad } = tempZiel();
  await db.backup(pfad);
  // Sessions gehoeren nicht ins Backup: die Tokens liegen dort im Klartext,
  // wer die Datei in die Finger bekommt, koennte laufende Sessions
  // uebernehmen. Nach dem Restore meldet man sich schlicht neu an.
  const kopie = new Database(pfad);
  try {
    kopie.prepare('DELETE FROM sessions').run();
  } finally {
    kopie.close();
  }
  return {
    pfad,
    aufraeumen: () => rmSync(verzeichnis, { recursive: true, force: true }),
  };
}

function kopiereTabelle(
  quelle: Database.Database,
  ziel: Database.Database,
  tabelle: string,
  mandantId: number,
): void {
  const rows = quelle
    .prepare(`SELECT * FROM ${tabelle} WHERE mandant_id = ?`)
    .all(mandantId) as Record<string, unknown>[];
  if (rows.length === 0) return;
  const spalten = Object.keys(rows[0]);
  const insert = ziel.prepare(
    `INSERT INTO ${tabelle} (${spalten.join(', ')}) ` +
      `VALUES (${spalten.map((s) => '@' + s).join(', ')})`,
  );
  const tx = ziel.transaction((rs: Record<string, unknown>[]) => {
    for (const r of rs) insert.run(r);
  });
  tx(rows);
}

/** Backup nur der Daten eines Mandanten (eigenstaendige SQLite-Datei). */
export function erzeugeMandantBackup(
  db: Database.Database,
  mandantId: number,
): BackupErgebnis {
  const { verzeichnis, pfad } = tempZiel();
  const ziel = new Database(pfad);
  try {
    ziel.pragma('foreign_keys = ON');
    applySchema(ziel);
    for (const tabelle of MANDANT_TABELLEN) {
      kopiereTabelle(db, ziel, tabelle, mandantId);
    }
  } finally {
    ziel.close();
  }
  return {
    pfad,
    aufraeumen: () => rmSync(verzeichnis, { recursive: true, force: true }),
  };
}
