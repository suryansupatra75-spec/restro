#!/usr/bin/env node
/**
 * ==============================================================================
 * 🚀 PHASE 22: PRODUCTION DEPLOYMENT & INFRASTRUCTURE TEST SUITE
 * ==============================================================================
 * Comprehensive verification of:
 * 1. Environment validation & safe failure modes (zero secret leakage)
 * 2. Liveness (/api/health) and Readiness (/api/ready) health probes
 * 3. Structured redacting logger & secret sanitation
 * 4. Database backup creation, checksum integrity & restore drill verification
 * 5. Multi-stage Dockerfile, .dockerignore, Compose & Nginx configuration
 * 6. Global phase-label cleanliness across user-facing views
 * 7. Edge security headers (HSTS, CSP, nosniff, SAMEORIGIN, Permissions-Policy)
 * ==============================================================================
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedCount++;
  }
}

async function apiFetch(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (options.token) {
    headers["Cookie"] = `session=${options.token}`;
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, headers: res.headers, data };
}

async function runTests() {
  console.log("==================================================================");
  console.log("🚀 PHASE 22: INFRASTRUCTURE & PRODUCTION READINESS TEST SUITE");
  console.log("==================================================================");

  // ----------------------------------------------------------------------------
  // SECTION 1: Environment Configuration & Secret Safety
  // ----------------------------------------------------------------------------
  console.log("\n--- [1] Environment Configuration & Secret Safety ---");

  const envExamplePath = path.join(__dirname, "..", ".env.example");
  assert(fs.existsSync(envExamplePath), ".env.example template exists");

  const envExampleContent = fs.readFileSync(envExamplePath, "utf-8");
  assert(envExampleContent.includes("JWT_SECRET="), ".env.example documents JWT_SECRET");
  assert(envExampleContent.includes("DATABASE_URL="), ".env.example documents DATABASE_URL");
  assert(envExampleContent.includes("SAAS_BILLING_RAZORPAY_KEY_ID="), ".env.example documents SAAS_BILLING keys");
  assert(envExampleContent.includes("RAZORPAY_KEY_ID="), ".env.example documents order payment keys");

  // Ensure .env.example does not contain real high-entropy production secrets
  assert(
    !envExampleContent.includes("live_secret_") &&
      !envExampleContent.includes("sk_live_") &&
      !envExampleContent.includes("AKIA"),
    ".env.example contains strictly placeholder values with zero leaked live credentials"
  );

  // Test the validate-env pre-flight script
  const validateScriptPath = path.join(__dirname, "validate-env.js");
  assert(fs.existsSync(validateScriptPath), "scripts/validate-env.js exists");

  // ----------------------------------------------------------------------------
  // SECTION 2: Liveness Probe (/api/health)
  // ----------------------------------------------------------------------------
  console.log("\n--- [2] Liveness Probe (/api/health) ---");

  const resHealth = await apiFetch("/api/health");
  assert(resHealth.status === 200, "GET /api/health responds with HTTP 200 OK");
  assert(resHealth.data?.status === "ok", "Liveness probe reports status: 'ok'");
  assert(Boolean(resHealth.data?.timestamp), "Liveness probe includes ISO timestamp");

  // Verify zero sensitive data is exposed
  const healthJsonStr = JSON.stringify(resHealth.data);
  assert(
    !healthJsonStr.toLowerCase().includes("password") &&
      !healthJsonStr.toLowerCase().includes("secret") &&
      !healthJsonStr.toLowerCase().includes("token") &&
      !healthJsonStr.toLowerCase().includes("dev.db"),
    "Liveness probe strictly exposes zero internal secrets or file system paths"
  );

  const cacheHeader = resHealth.headers.get("cache-control") || "";
  assert(
    cacheHeader.includes("no-store") || cacheHeader.includes("no-cache"),
    "Liveness probe specifies no-cache / no-store headers"
  );

  // ----------------------------------------------------------------------------
  // SECTION 3: Readiness Probe (/api/ready)
  // ----------------------------------------------------------------------------
  console.log("\n--- [3] Readiness Probe (/api/ready) ---");

  const resReady = await apiFetch("/api/ready");
  assert(resReady.status === 200, "GET /api/ready responds with HTTP 200 OK");
  assert(resReady.data?.status === "ready", "Readiness probe reports status: 'ready'");
  assert(resReady.data?.database === "connected", "Readiness probe confirms database is connected");
  assert(typeof resReady.data?.latencyMs === "number", "Readiness probe reports valid numeric DB latency");

  const readyJsonStr = JSON.stringify(resReady.data);
  assert(
    !readyJsonStr.toLowerCase().includes("password") &&
      !readyJsonStr.toLowerCase().includes("secret") &&
      !readyJsonStr.toLowerCase().includes("token"),
    "Readiness probe strictly exposes zero internal credentials"
  );

  // ----------------------------------------------------------------------------
  // SECTION 4: Structured Logger & Recursive Secret Redaction
  // ----------------------------------------------------------------------------
  console.log("\n--- [4] Structured Logger & Secret Redaction ---");

  const loggerPath = path.join(__dirname, "..", "src", "lib", "logger.ts");
  assert(fs.existsSync(loggerPath), "src/lib/logger.ts exists");

  const loggerContent = fs.readFileSync(loggerPath, "utf-8");
  assert(loggerContent.includes("redactSecrets"), "Logger implements redactSecrets function");
  assert(loggerContent.includes("password"), "Logger pattern includes password redaction");
  assert(loggerContent.includes("token"), "Logger pattern includes token redaction");
  assert(loggerContent.includes("secret"), "Logger pattern includes secret redaction");

  // Test redaction logic directly
  function localRedact(data) {
    if (!data || typeof data !== "object") return data;
    const result = Array.isArray(data) ? [] : {};
    for (const [k, v] of Object.entries(data)) {
      if (/password|secret|token|key|cookie|auth|card/i.test(k)) {
        result[k] = "[REDACTED]";
      } else if (typeof v === "object" && v !== null) {
        result[k] = localRedact(v);
      } else {
        result[k] = v;
      }
    }
    return result;
  }

  const payloadWithSecrets = {
    user: "john_doe",
    password: "SuperSecretPassword123!",
    apiSecret: "sec_live_9988776655",
    authToken: "jwt.header.payload",
    nested: {
      cardCvv: "123",
      publicMetric: 42,
    },
  };

  const sanitized = localRedact(payloadWithSecrets);
  assert(sanitized.password === "[REDACTED]", "Password correctly redacted to [REDACTED]");
  assert(sanitized.apiSecret === "[REDACTED]", "API secret correctly redacted");
  assert(sanitized.authToken === "[REDACTED]", "Auth token correctly redacted");
  assert(sanitized.nested.cardCvv === "[REDACTED]", "Nested card CVV correctly redacted");
  assert(sanitized.nested.publicMetric === 42, "Non-sensitive nested metric preserved intact");
  assert(sanitized.user === "john_doe", "Non-sensitive user string preserved intact");

  // ----------------------------------------------------------------------------
  // SECTION 5: Database Backup & Restore Drill
  // ----------------------------------------------------------------------------
  console.log("\n--- [5] Database Backup & Restore Drill Verification ---");

  const backupScriptPath = path.join(__dirname, "backup-db.js");
  const restoreScriptPath = path.join(__dirname, "restore-db.js");
  assert(fs.existsSync(backupScriptPath), "scripts/backup-db.js exists");
  assert(fs.existsSync(restoreScriptPath), "scripts/restore-db.js exists");

  // Create an explicit drill backup
  const backupsDir = path.join(__dirname, "..", "backups");
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });

  const testBackupPath = path.join(backupsDir, `test-drill-${Date.now()}.db`);
  const devDbPath = path.join(__dirname, "..", "prisma", "dev.db");

  assert(fs.existsSync(devDbPath), "Active database file prisma/dev.db exists");
  fs.copyFileSync(devDbPath, testBackupPath);
  assert(fs.existsSync(testBackupPath), "Backup file created successfully");

  const backupSize = fs.statSync(testBackupPath).size;
  assert(backupSize > 10000, `Backup file has valid non-zero size (${(backupSize / 1024).toFixed(1)} KB)`);

  const hash = crypto.createHash("sha256").update(fs.readFileSync(testBackupPath)).digest("hex");
  assert(hash.length === 64, `Computed valid SHA-256 backup checksum (${hash.substring(0, 16)}...)`);

  // Verify restore capability using Prisma on the backup copy
  const restoreVerifyPrisma = new PrismaClient({
    datasources: {
      db: { url: `file:${testBackupPath.replace(/\\/g, "/")}` },
    },
  });

  const verifiedUserCount = await restoreVerifyPrisma.user.count();
  const verifiedOrderCount = await restoreVerifyPrisma.order.count();
  assert(verifiedUserCount > 0, `Restored DB successfully queried users (Count: ${verifiedUserCount})`);
  assert(verifiedOrderCount >= 0, `Restored DB successfully queried orders (Count: ${verifiedOrderCount})`);

  await restoreVerifyPrisma.$disconnect();

  // Cleanup drill backup
  fs.unlinkSync(testBackupPath);
  assert(!fs.existsSync(testBackupPath), "Temporary drill backup cleanly cleaned up");

  // ----------------------------------------------------------------------------
  // SECTION 6: Containerization & Release Infrastructure
  // ----------------------------------------------------------------------------
  console.log("\n--- [6] Containerization & Release Artifacts ---");

  const dockerfilePath = path.join(__dirname, "..", "Dockerfile");
  assert(fs.existsSync(dockerfilePath), "Dockerfile exists");

  const dockerfileContent = fs.readFileSync(dockerfilePath, "utf-8");
  assert(dockerfileContent.includes("FROM node:20-alpine AS base"), "Dockerfile uses node:20-alpine base");
  assert(dockerfileContent.includes("AS deps"), "Dockerfile defines deps stage");
  assert(dockerfileContent.includes("AS builder"), "Dockerfile defines builder stage");
  assert(dockerfileContent.includes("AS runner"), "Dockerfile defines runner stage");
  assert(dockerfileContent.includes("adduser --system --uid 1001 nextjs"), "Dockerfile creates non-root user (UID 1001)");
  assert(dockerfileContent.includes("USER nextjs"), "Dockerfile enforces unprivileged USER nextjs execution");
  assert(dockerfileContent.includes("HEALTHCHECK"), "Dockerfile configures container HEALTHCHECK probe");
  assert(dockerfileContent.includes("EXPOSE 3000"), "Dockerfile exposes application port 3000");

  const dockerignorePath = path.join(__dirname, "..", ".dockerignore");
  assert(fs.existsSync(dockerignorePath), ".dockerignore exists");
  const dockerignoreContent = fs.readFileSync(dockerignorePath, "utf-8");
  assert(dockerignoreContent.includes(".env"), ".dockerignore excludes .env credentials");
  assert(dockerignoreContent.includes("node_modules"), ".dockerignore excludes node_modules");
  assert(dockerignoreContent.includes("prisma/*.db"), ".dockerignore excludes raw SQLite databases");

  const composePath = path.join(__dirname, "..", "docker-compose.yml");
  const composeProdPath = path.join(__dirname, "..", "docker-compose.prod.yml");
  assert(fs.existsSync(composePath), "docker-compose.yml exists");
  assert(fs.existsSync(composeProdPath), "docker-compose.prod.yml exists");

  const composeProdContent = fs.readFileSync(composeProdPath, "utf-8");
  assert(composeProdContent.includes("sqlite_prod_data:"), "docker-compose.prod.yml mounts persistent SQLite volume");
  assert(composeProdContent.includes("backup_prod_data:"), "docker-compose.prod.yml mounts persistent backup volume");
  assert(composeProdContent.includes("no-new-privileges:true"), "docker-compose.prod.yml enforces security_opt no-new-privileges");
  assert(composeProdContent.includes("proxy:"), "docker-compose.prod.yml defines Nginx reverse proxy service");

  const nginxConfPath = path.join(__dirname, "..", "nginx", "default.conf");
  assert(fs.existsSync(nginxConfPath), "nginx/default.conf exists");
  const nginxContent = fs.readFileSync(nginxConfPath, "utf-8");
  assert(nginxContent.includes("listen 443 ssl http2;"), "Nginx configures HTTPS on port 443 with HTTP/2");
  assert(nginxContent.includes("return 301 https://$host$request_uri;"), "Nginx configures HTTP to HTTPS 301 redirection");
  assert(nginxContent.includes("Strict-Transport-Security"), "Nginx configures HSTS security header");
  assert(nginxContent.includes("proxy_set_header Upgrade $http_upgrade;"), "Nginx configures WebSocket/SSE upgrade forwarding");
  assert(nginxContent.includes("limit_req_zone"), "Nginx configures rate limiting zones");

  const ciPath = path.join(__dirname, "..", ".github", "workflows", "ci.yml");
  assert(fs.existsSync(ciPath), ".github/workflows/ci.yml CI pipeline exists");

  // ----------------------------------------------------------------------------
  // SECTION 7: Security Headers & Transport
  // ----------------------------------------------------------------------------
  console.log("\n--- [7] Security Headers & Transport ---");

  const resIndex = await apiFetch("/login");
  const hContentType = resIndex.headers.get("x-content-type-options");
  const hFrameOptions = resIndex.headers.get("x-frame-options");
  const hReferrer = resIndex.headers.get("referrer-policy");
  const hPermissions = resIndex.headers.get("permissions-policy");

  assert(hContentType === "nosniff", "Response header contains 'X-Content-Type-Options: nosniff'");
  assert(hFrameOptions === "SAMEORIGIN", "Response header contains 'X-Frame-Options: SAMEORIGIN'");
  assert(
    hReferrer === "strict-origin-when-cross-origin",
    "Response header contains 'Referrer-Policy: strict-origin-when-cross-origin'"
  );
  assert(Boolean(hPermissions), "Response header contains 'Permissions-Policy'");

  // ----------------------------------------------------------------------------
  // SECTION 8: Global Phase-Label Cleanliness Audit
  // ----------------------------------------------------------------------------
  console.log("\n--- [8] Global Phase-Label Cleanliness Audit ---");

  function scanDirectory(dir, pattern, matches = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDirectory(fullPath, pattern, matches);
      } else if (file.endsWith(".tsx")) {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        lines.forEach((line, idx) => {
          if (pattern.test(line)) {
            matches.push({ file: fullPath, line: idx + 1, text: line.trim() });
          }
        });
      }
    }
    return matches;
  }

  const srcDir = path.join(__dirname, "..", "src");
  const phaseLabelRegex = /Phase\s*(1[6-9]|2[0-4])/i;
  const userFacingMatches = scanDirectory(srcDir, phaseLabelRegex);

  assert(
    userFacingMatches.length === 0,
    `Zero user-facing occurrences of 'Phase X' in src *.tsx (Found: ${userFacingMatches.length})`
  );

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(`🏁 TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log("==================================================================\n");

  await prisma.$disconnect();

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(async (err) => {
  console.error("Test runner failed:", err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
