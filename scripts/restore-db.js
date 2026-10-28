#!/usr/bin/env node
/**
 * Database Restore & Drill Verification Utility.
 * Allows safe verification of database restore drills and emergency production recovery.
 *
 * Usage:
 *   node scripts/restore-db.js                             # Restores latest backup to prisma/restore-verify.db (Safe Drill)
 *   node scripts/restore-db.js <backup-file>               # Restores specified backup to test verification DB
 *   node scripts/restore-db.js <backup-file> --target dev.db --force  # Overwrites active DB with pre-restore safety copy
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const BACKUP_DIR = path.join(__dirname, "..", "backups");
const PRISMA_DIR = path.join(__dirname, "..", "prisma");

function computeChecksum(filePath) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest("hex");
}

async function runRestore() {
  console.log("==================================================================");
  console.log("🔄 DATABASE RESTORE & DRILL VERIFICATION UTILITY");
  console.log("==================================================================");

  const args = process.argv.slice(2);
  const isForce = args.includes("--force");
  const targetIdx = args.indexOf("--target");
  const customTarget = targetIdx !== -1 ? args[targetIdx + 1] : null;

  // Find candidate backup file
  let backupFile = args.find((a) => !a.startsWith("--") && a !== customTarget);

  if (!backupFile) {
    // Pick latest backup in BACKUP_DIR
    if (!fs.existsSync(BACKUP_DIR)) {
      console.error("❌ No backups directory found.");
      process.exit(1);
    }
    const backups = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".db"))
      .map((f) => ({
        name: f,
        fullPath: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);

    if (backups.length === 0) {
      console.error("❌ No backup files found in backups directory.");
      process.exit(1);
    }

    backupFile = backups[0].fullPath;
    console.log(`Auto-selected latest backup: ${path.basename(backupFile)}`);
  } else {
    backupFile = path.resolve(backupFile);
  }

  if (!fs.existsSync(backupFile)) {
    console.error(`❌ Specified backup file not found: ${backupFile}`);
    process.exit(1);
  }

  // Determine target database path
  const isTargetingActive = customTarget === "dev.db" || customTarget === path.join(PRISMA_DIR, "dev.db");
  const targetPath = customTarget
    ? path.resolve(customTarget.includes(path.sep) ? customTarget : path.join(PRISMA_DIR, customTarget))
    : path.join(PRISMA_DIR, "restore-verify.db");

  console.log(`Source Backup:  ${backupFile}`);
  console.log(`Destination:    ${targetPath}`);
  console.log(`Operation Mode: ${isTargetingActive ? "⚠️  ACTIVE PRODUCTION RECOVERY" : "✅ SAFE DRILL VERIFICATION"}`);

  // Safety protection for active database
  if (isTargetingActive && !isForce) {
    console.error("\n❌ SAFETY HALT: Overwriting active database requires explicit '--force' flag.");
    console.error("   Example: node scripts/restore-db.js <backup> --target dev.db --force");
    process.exit(1);
  }

  // Check backup integrity
  const backupStats = fs.statSync(backupFile);
  const backupChecksum = computeChecksum(backupFile);
  console.log(`Backup Size:    ${(backupStats.size / 1024).toFixed(1)} KB`);
  console.log(`Backup SHA-256: ${backupChecksum}`);

  // If overwriting active DB, create an emergency safety backup first!
  if (isTargetingActive && fs.existsSync(targetPath)) {
    const safetyBackupPath = path.join(BACKUP_DIR, `pre-restore-safety-${Date.now()}.db`);
    console.log(`\n🛡️  Creating emergency pre-restore safety copy: ${safetyBackupPath}`);
    fs.copyFileSync(targetPath, safetyBackupPath);
  }

  // Copy backup to target
  fs.copyFileSync(backupFile, targetPath);

  // If WAL exists for this backup, restore it too
  const walSrc = `${backupFile}-wal`;
  if (fs.existsSync(walSrc)) {
    fs.copyFileSync(walSrc, `${targetPath}-wal`);
    console.log("  - Restored associated WAL journal.");
  }

  console.log("\n------------------------------------------------------------------");
  console.log("🔍 Verifying restored database accessibility and integrity...");

  // Open the restored database with Prisma to verify record counts
  const tempDbUrl = `file:${path.relative(PRISMA_DIR, targetPath).replace(/\\/g, "/")}`;
  const verifyPrisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${targetPath.replace(/\\/g, "/")}`,
      },
    },
  });

  try {
    const [userCount, restaurantCount, orderCount, auditCount] = await Promise.all([
      verifyPrisma.user.count(),
      verifyPrisma.restaurant.count(),
      verifyPrisma.order.count(),
      verifyPrisma.auditLog.count(),
    ]);

    console.log("✅ Restored database verified successfully!");
    console.log(`   - Users:        ${userCount}`);
    console.log(`   - Restaurants:  ${restaurantCount}`);
    console.log(`   - Orders:       ${orderCount}`);
    console.log(`   - Audit Events: ${auditCount}`);

    // If this was a drill, clean up the temporary drill database
    if (!isTargetingActive && path.basename(targetPath) === "restore-verify.db") {
      await verifyPrisma.$disconnect();
      try {
        fs.unlinkSync(targetPath);
        if (fs.existsSync(`${targetPath}-wal`)) fs.unlinkSync(`${targetPath}-wal`);
        if (fs.existsSync(`${targetPath}-shm`)) fs.unlinkSync(`${targetPath}-shm`);
        console.log("🧹 Cleaned up temporary drill database.");
      } catch {
        // Ignore unlink error
      }
    } else {
      await verifyPrisma.$disconnect();
    }

    console.log("==================================================================\n");
  } catch (err) {
    console.error("❌ Verification failed! Restored database is unreadable or corrupted:", err);
    await verifyPrisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

runRestore().catch((err) => {
  console.error("Restore process failed with error:", err);
  process.exit(1);
});
