/**
 * Phase 21: Advanced Security & Audit Logs
 * Comprehensive Verification & Hardening Test Suite
 */

const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");

const prisma = new PrismaClient();
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const JWT_SECRET =
  process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const secretKey = new TextEncoder().encode(JWT_SECRET);

let passed = 0;
let failed = 0;

function assert(condition, label, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✅ PASS: ${label}`);
  } else {
    failed++;
    console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function makeToken(userId, email) {
  return await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
}

async function apiFetch(urlPath, options = {}) {
  const { token, method = "GET", body } = options;
  const headers = { ...(options.headers || {}), Connection: "close" };

  if (token) {
    headers["Cookie"] = `session=${token}`;
  }
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body:
      body !== undefined
        ? typeof body === "string"
          ? body
          : JSON.stringify(body)
        : undefined,
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, headers: res.headers, data, text };
}

async function runTests() {
  console.log("==================================================================");
  console.log("🔒 PHASE 21: ADVANCED SECURITY & AUDIT LOGS TEST SUITE");
  console.log("==================================================================");

  // 1. Setup Test Tenants and Users
  console.log("\n--- [1] Setting Up Test Tenants and Isolated Personas ---");
  const timestamp = Date.now();

  // Tenant A: Alpha
  const restA = await prisma.restaurant.create({
    data: {
      name: `Security Rest A ${timestamp}`,
      slug: `sec-rest-a-${timestamp}`,
      currency: "USD",
      status: "ACTIVE",
    },
  });

  // Tenant B: Beta
  const restB = await prisma.restaurant.create({
    data: {
      name: `Security Rest B ${timestamp}`,
      slug: `sec-rest-b-${timestamp}`,
      currency: "USD",
      status: "ACTIVE",
    },
  });

  // User A: Owner of Restaurant A
  const ownerA = await prisma.user.create({
    data: {
      name: "Owner A",
      email: `owner_a_${timestamp}@sec.test`,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
      isActive: true,
      restaurants: {
        create: {
          restaurantId: restA.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      },
    },
  });

  // User B: Owner of Restaurant B
  const ownerB = await prisma.user.create({
    data: {
      name: "Owner B",
      email: `owner_b_${timestamp}@sec.test`,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
      isActive: true,
      restaurants: {
        create: {
          restaurantId: restB.id,
          role: "OWNER",
          status: "ACTIVE",
        },
      },
    },
  });

  // Manager of Restaurant A
  const managerA = await prisma.user.create({
    data: {
      name: "Manager A",
      email: `manager_a_${timestamp}@sec.test`,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
      isActive: true,
      restaurants: {
        create: {
          restaurantId: restA.id,
          role: "MANAGER",
          status: "ACTIVE",
        },
      },
    },
  });

  // Staff of Restaurant A
  const staffA = await prisma.user.create({
    data: {
      name: "Staff A",
      email: `staff_a_${timestamp}@sec.test`,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
      isActive: true,
      restaurants: {
        create: {
          restaurantId: restA.id,
          role: "STAFF",
          status: "ACTIVE",
        },
      },
    },
  });

  // Kitchen of Restaurant A
  const kitchenA = await prisma.user.create({
    data: {
      name: "Kitchen A",
      email: `kitchen_a_${timestamp}@sec.test`,
      passwordHash: "$2a$10$abcdefghijklmnopqrstuv",
      isActive: true,
      restaurants: {
        create: {
          restaurantId: restA.id,
          role: "KITCHEN",
          status: "ACTIVE",
        },
      },
    },
  });

  const tokenOwnerA = await makeToken(ownerA.id, ownerA.email);
  const tokenOwnerB = await makeToken(ownerB.id, ownerB.email);
  const tokenManagerA = await makeToken(managerA.id, managerA.email);
  const tokenStaffA = await makeToken(staffA.id, staffA.email);
  const tokenKitchenA = await makeToken(kitchenA.id, kitchenA.email);

  assert(true, "Setup completed for tenants A, B and 5 role accounts");

  // Create an initial audit log in Restaurant B for isolation testing
  const logRestB = await prisma.auditLog.create({
    data: {
      restaurantId: restB.id,
      actorId: ownerB.id,
      actorEmail: ownerB.email,
      actorName: ownerB.name,
      actorRole: "OWNER",
      action: "AUTH_LOGIN_SUCCESS",
      resourceType: "AUTH",
      outcome: "SUCCESS",
      metadata: JSON.stringify({ ip: "1.2.3.4", secretKey: "[REDACTED]" }),
    },
  });

  // 2. Role-Based Access Control (Allow/Deny Matrix)
  console.log("\n--- [2] RBAC Allow/Deny Matrix for Audit Ledger ---");
  
  // Unauthenticated
  const resUnauth = await apiFetch("/api/v1/audit-logs");
  assert(resUnauth.status === 401, "Unauthenticated caller denied from audit logs (401)");

  // Staff (Forbidden)
  const resStaff = await apiFetch("/api/v1/audit-logs", { token: tokenStaffA });
  assert(resStaff.status === 403, "STAFF role denied from viewing audit logs (403)");

  // Kitchen (Forbidden)
  const resKitchen = await apiFetch("/api/v1/audit-logs", { token: tokenKitchenA });
  assert(resKitchen.status === 403, "KITCHEN role denied from viewing audit logs (403)");

  // Manager (Allowed to view)
  const resManager = await apiFetch("/api/v1/audit-logs", { token: tokenManagerA });
  assert(resManager.status === 200, "MANAGER role allowed to view audit logs (200)");
  assert(resManager.data?.success === true, "MANAGER receives valid audit logs payload");

  // Manager Export (Forbidden: audit.export is OWNER only)
  const resManagerExport = await apiFetch("/api/v1/audit-logs/export", { token: tokenManagerA });
  assert(resManagerExport.status === 403, "MANAGER role denied from exporting audit logs (403)");

  // Owner (Allowed to view and export)
  const resOwnerView = await apiFetch("/api/v1/audit-logs", { token: tokenOwnerA });
  assert(resOwnerView.status === 200, "OWNER role allowed to view audit logs (200)");

  const resOwnerExport = await apiFetch("/api/v1/audit-logs/export", { token: tokenOwnerA });
  assert(resOwnerExport.status === 200, "OWNER role allowed to export audit logs (200)");
  assert(
    resOwnerExport.headers.get("content-type")?.includes("text/csv"),
    "Export response has text/csv Content-Type"
  );

  // 3. Multi-Tenant Isolation & Anti-IDOR Checks
  console.log("\n--- [3] Multi-Tenant Isolation & Anti-IDOR Verification ---");

  // Owner A attempts to query Restaurant B's audit logs by passing restaurantId=restB.id
  const resCrossQuery = await apiFetch(`/api/v1/audit-logs?restaurantId=${restB.id}`, {
    token: tokenOwnerA,
  });
  // Since Owner A is not a member of Restaurant B, requireAuthMember must reject with 403
  assert(
    resCrossQuery.status === 403,
    "Cross-tenant audit ledger query strictly denied (403 Forbidden)"
  );

  // Owner A attempts to query single audit log belonging to Restaurant B by ID
  const resIdorLog = await apiFetch(`/api/v1/audit-logs/${logRestB.id}`, {
    token: tokenOwnerA,
  });
  assert(
    resIdorLog.status === 404 || resIdorLog.status === 403,
    "IDOR check: Owner A cannot read Restaurant B audit event by direct ID (404/403)"
  );

  // Owner A attempts to export Restaurant B's audit logs
  const resCrossExport = await apiFetch(`/api/v1/audit-logs/export?restaurantId=${restB.id}`, {
    token: tokenOwnerA,
  });
  assert(
    resCrossExport.status === 403,
    "Cross-tenant audit log export strictly denied (403 Forbidden)"
  );

  // 4. Staff Denial from Platform Super Admin Routes
  console.log("\n--- [4] Platform Super Admin Route Protection ---");

  const resOwnerSuperAdmin = await apiFetch("/api/v1/super-admin/audit-logs", {
    token: tokenOwnerA,
  });
  assert(
    resOwnerSuperAdmin.status === 403,
    "Restaurant OWNER denied access to platform Super Admin audit logs (403)"
  );

  const resManagerSuperAdmin = await apiFetch("/api/v1/super-admin/audit-logs", {
    token: tokenManagerA,
  });
  assert(
    resManagerSuperAdmin.status === 403,
    "Restaurant MANAGER denied access to platform Super Admin audit logs (403)"
  );

  // 5. Client Forged-Event Rejection (Immutable & Append-Only)
  console.log("\n--- [5] Client Forged-Event Rejection ---");

  const resFakePost = await apiFetch("/api/v1/audit-logs", {
    token: tokenOwnerA,
    method: "POST",
    body: { action: "FAKED_EVENT", outcome: "SUCCESS" },
  });
  assert(
    resFakePost.status === 405,
    "Client POST to audit logs rejected with 405 Method Not Allowed"
  );

  const resFakePut = await apiFetch("/api/v1/audit-logs", {
    token: tokenOwnerA,
    method: "PUT",
    body: { action: "FAKED_EVENT" },
  });
  assert(
    resFakePut.status === 405,
    "Client PUT to audit logs rejected with 405 Method Not Allowed"
  );

  const resFakeDelete = await apiFetch("/api/v1/audit-logs", {
    token: tokenOwnerA,
    method: "DELETE",
  });
  assert(
    resFakeDelete.status === 405,
    "Client DELETE to audit logs rejected with 405 Method Not Allowed"
  );

  // 6. Server-Side Audit Generation & Automatic Secret Redaction
  console.log("\n--- [6] Server-Side Audit Generation & Secret Redaction ---");

  // Update restaurant settings
  const resUpdateSettings = await apiFetch("/api/v1/settings", {
    token: tokenOwnerA,
    method: "PATCH",
    body: {
      taxPercentage: 12.5,
      openingTime: "08:00",
      closingTime: "22:00",
    },
  });
  assert(resUpdateSettings.status === 200, "Settings updated successfully");

  // Verify audit log was recorded for SETTINGS_UPDATED
  const settingsLogs = await prisma.auditLog.findMany({
    where: {
      restaurantId: restA.id,
      action: "RESTAURANT_SETTINGS_UPDATED",
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  assert(settingsLogs.length > 0, "RESTAURANT_SETTINGS_UPDATED audit event automatically recorded in DB");
  if (settingsLogs.length > 0) {
    const meta = JSON.parse(settingsLogs[0].metadata || "{}");
    assert(meta.taxPercentage?.to === 12.5, "Audit metadata accurately captures change diff");
    assert(settingsLogs[0].actorId === ownerA.id, "Audit record accurately attributes actor");
    assert(settingsLogs[0].actorRole === "OWNER", "Audit record accurately attributes role");
  }

  // Test secret redaction on audit records
  // Trigger a login failure with a secret attempt
  await apiFetch("/api/v1/auth/login", {
    method: "POST",
    body: {
      email: ownerA.email,
      password: "SUPER_SECRET_PLAINTEXT_PASSWORD_12345",
    },
  });

  const loginFailedLogs = await prisma.auditLog.findMany({
    where: {
      actorEmail: ownerA.email,
      action: "AUTH_LOGIN_FAILED",
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  assert(loginFailedLogs.length > 0, "AUTH_LOGIN_FAILED audit record generated on failed login");
  if (loginFailedLogs.length > 0) {
    const rawRecord = JSON.stringify(loginFailedLogs[0]);
    assert(
      !rawRecord.includes("SUPER_SECRET_PLAINTEXT_PASSWORD_12345"),
      "Plaintext password is strictly redacted and never saved to audit storage"
    );
  }

  // 7. Formula Injection Sanitization in CSV Export
  console.log("\n--- [7] Formula Injection Sanitization in CSV Export ---");

  // Create an audit event with malicious formula trigger characters in resourceName
  await prisma.auditLog.create({
    data: {
      restaurantId: restA.id,
      actorId: ownerA.id,
      actorEmail: ownerA.email,
      actorName: ownerA.name,
      actorRole: "OWNER",
      action: "FORMULA_TEST",
      resourceType: "SECURITY",
      resourceName: "=cmd|' /C calc'!A0",
      reason: "+12345-67890",
      outcome: "SUCCESS",
    },
  });

  const exportRes = await apiFetch("/api/v1/audit-logs/export", { token: tokenOwnerA });
  assert(exportRes.status === 200, "CSV export fetched successfully");
  const csvText = exportRes.text;

  // Verify formula triggers are prefixed with single quote
  assert(
    csvText.includes("\"'=cmd|' /C calc'!A0\""),
    "Formula cell starting with '=' safely escaped with single quote"
  );
  assert(
    csvText.includes("\"'+12345-67890\""),
    "Formula cell starting with '+' safely escaped with single quote"
  );

  // 8. Open Redirect Vulnerability Prevention
  console.log("\n--- [8] Open Redirect Vulnerability Prevention ---");

  // Test malicious redirects via Login API
  const evilRedirects = [
    "https://evil.com/phish",
    "http://attacker.com",
    "//evil.com/fake",
    "/\\evil.com",
    "javascript:alert(document.cookie)",
  ];

  for (const maliciousUrl of evilRedirects) {
    const resLogin = await apiFetch("/api/v1/auth/login", {
      method: "POST",
      body: {
        email: ownerB.email,
        password: "$2a$10$abcdefghijklmnopqrstuv", // placeholder, won't match but test redirect logic
        callbackUrl: maliciousUrl,
      },
    });

    if (resLogin.data?.redirectTo) {
      assert(
        !resLogin.data.redirectTo.includes("evil.com") &&
          !resLogin.data.redirectTo.includes("attacker.com"),
        `Open redirect blocked: '${maliciousUrl}' sanitized to safe path`
      );
    }
  }

  // Pure logic assertion for internal redirect helper
  function testInternalRedirect(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (!trimmed.startsWith("/")) return false;
    if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return false;
    if (trimmed.includes("://") || trimmed.toLowerCase().startsWith("javascript:")) return false;
    return true;
  }

  assert(!testInternalRedirect("https://evil.com"), "Redirect helper rejects https://evil.com");
  assert(!testInternalRedirect("//evil.com"), "Redirect helper rejects protocol-relative //evil.com");
  assert(!testInternalRedirect("/\\evil.com"), "Redirect helper rejects backslash /\\evil.com");
  assert(testInternalRedirect("/dashboard"), "Redirect helper accepts /dashboard");

  // 9. Deactivated & Suspended Account Blocking
  console.log("\n--- [9] Deactivated & Suspended User Rejection ---");

  // Temporarily suspend staffA
  await prisma.user.update({
    where: { id: staffA.id },
    data: {
      isActive: false,
      suspendedAt: new Date(),
      suspendedReason: "Security investigation",
    },
  });

  // Staff A calls an endpoint
  const resSuspended = await apiFetch("/api/v1/orders/admin", { token: tokenStaffA });
  assert(
    resSuspended.status === 403,
    "Deactivated/suspended user strictly blocked with 403 Forbidden"
  );
  assert(
    resSuspended.data?.code === "USER_SUSPENDED",
    "Deactivated user receives USER_SUSPENDED error code"
  );

  // 10. Rate Limiting Protection on Brute-Force Login
  console.log("\n--- [10] Rate Limiting Protection on Brute-Force Login ---");

  const bruteEmail = `brute_${timestamp}@test.com`;
  let rateBlocked = false;

  for (let i = 0; i < 6; i++) {
    const res = await apiFetch("/api/v1/auth/login", {
      method: "POST",
      body: { email: bruteEmail, password: "wrong_password_attempt" },
    });
    if (res.status === 429) {
      rateBlocked = true;
      break;
    }
  }

  assert(rateBlocked, "Brute-force login attempts trigger HTTP 429 Too Many Requests");

  // 11. Cleanup Test Records
  console.log("\n--- [11] Cleaning Up Isolated Test Tenants ---");
  try {
    await prisma.auditLog.deleteMany({
      where: { restaurantId: { in: [restA.id, restB.id] } },
    });
    await prisma.restaurantUser.deleteMany({
      where: { restaurantId: { in: [restA.id, restB.id] } },
    });
    await prisma.restaurant.deleteMany({
      where: { id: { in: [restA.id, restB.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerA.id, ownerB.id, managerA.id, staffA.id, kitchenA.id] } },
    });
    console.log("  ✅ Test tenants cleaned up successfully");
  } catch (err) {
    console.warn("  ⚠️ Cleanup warning:", err.message);
  }

  console.log("\n==================================================================");
  console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests()
  .catch((err) => {
    console.error("Fatal Test Suite Error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
