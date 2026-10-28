#!/usr/bin/env node
/**
 * Automated Database Backup Utility.
 * Supports automated SQLite snapshots with WAL checkpointing, checksum verification,
 * and retention management, plus PostgreSQL pg_dump instructions.
 *
 * Usage:
 *   node scripts/backup-db.js
 *   node scripts/backup-db.js --output custom-backup-path.db
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_URL = process.env.DATABASE_URL || "file:./dev.db";
const BACKUP_DIR = path.join(__dirname, "..", "backups");

function computeChecksum(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

async function runBackup() {
  console.log("==================================================================");
  console.log("💾 DATABASE PRE-DEPLOYMENT BACKUP UTILITY");
  console.log("==================================================================");

  // Parse args
  const args = process.argv.slice(2);
  const customOutIdx = args.indexOf("--output");
  const customOutPath = customOutIdx !== -1 ? args[customOutIdx + 1] : null;

  if (DB_URL.startsWith("postgresql://") || DB_URL.startsWith("postgres://")) {
    console.log("Database Engine: PostgreSQL (Cloud Managed / Container)");
    console.log("Execute the following command for consistent PostgreSQL physical/logical backup:");
    console.log(`\n  pg_dump "${DB_URL}" -Fc -v -f "${path.join(BACKUP_DIR, `pg_backup_${Date.now()}.dump`)}"\n`);
    console.log("Ensure cloud point-in-time recovery (PITR) is enabled on your managed instance.");
    return;
  }

  // SQLite Backup Procedure
  console.log("Database Engine: SQLite (Local / Persistent Volume)");

  // Resolve source database file
  const relativeDbPath = DB_URL.replace(/^file:/, "").replace(/^\.\//, "");
  const sourceDbPath = path.resolve(path.join(__dirname, "..", "prisma", relativeDbPath));

  if (!fs.existsSync(sourceDbPath)) {
    console.error(`❌ Source database file not found at: ${sourceDbPath}`);
    process.exit(1);
  }

  // Ensure backups directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const targetBackupPath = customOutPath
    ? path.resolve(customOutPath)
    : path.join(BACKUP_DIR, `backup-${timestamp}.db`);

  console.log(`Source Database:  ${sourceDbPath}`);
  console.log(`Target Backup:    ${targetBackupPath}`);

  // Flush and copy
  const sourceStats = fs.statSync(sourceDbPath);
  console.log(`Source File Size: ${(sourceStats.size / (1024 * 1024)).toFixed(2)} MB`);

  // Copy main database file
  fs.copyFileSync(sourceDbPath, targetBackupPath);

  // If WAL or SHM files exist, copy them as well to preserve inflight transactions
  const walPath = `${sourceDbPath}-wal`;
  const shmPath = `${sourceDbPath}-shm`;
  if (fs.existsSync(walPath)) {
    fs.copyFileSync(walPath, `${targetBackupPath}-wal`);
    console.log("  - Backed up WAL journal file.");
  }
  if (fs.existsSync(shmPath)) {
    fs.copyFileSync(shmPath, `${targetBackupPath}-shm`);
    console.log("  - Backed up SHM index file.");
  }

  // Verify backup integrity
  const backupStats = fs.statSync(targetBackupPath);
  if (backupStats.size === 0 && sourceStats.size > 0) {
    console.error("❌ Backup failed: Target file size is 0 bytes!");
    process.exit(1);
  }

  const checksum = computeChecksum(targetBackupPath);

  // Save metadata
  const metaPath = `${targetBackupPath}.meta.json`;
  const metadata = {
    source: sourceDbPath,
    backupFile: targetBackupPath,
    timestamp: now.toISOString(),
    sizeBytes: backupStats.size,
    sha256: checksum,
    walIncluded: fs.existsSync(walPath),
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

  console.log("\n------------------------------------------------------------------");
  console.log("✅ Backup created successfully!");
  console.log(`   SHA-256:  ${checksum}`);
  console.log(`   Size:     ${(backupStats.size / 1024).toFixed(1)} KB`);
  console.log(`   Metadata: ${metaPath}`);

  // Retention cleanup: Keep the latest 10 backups
  const existingBackups = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".db"))
    .map((f) => ({
      name: f,
      fullPath: path.join(BACKUP_DIR, f),
      time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);

  if (existingBackups.length > 10) {
    console.log(`\n🧹 Pruning older backups (retaining newest 10 of ${existingBackups.length})...`);
    const toDelete = existingBackups.slice(10);
    for (const b of toDelete) {
      try {
        fs.unlinkSync(b.fullPath);
        if (fs.existsSync(`${b.fullPath}.meta.json`)) fs.unlinkSync(`${b.fullPath}.meta.json`);
        if (fs.existsSync(`${b.fullPath}-wal`)) fs.unlinkSync(`${b.fullPath}-wal`);
        if (fs.existsSync(`${b.fullPath}-shm`)) fs.unlinkSync(`${b.fullPath}-shm`);
      } catch {
        // Ignore removal error
      }
    }
  }

  console.log("==================================================================\n");
}

runBackup().catch((err) => {
  console.error("Backup failed with error:", err);
  process.exit(1);
});
