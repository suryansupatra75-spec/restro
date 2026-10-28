const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { SignJWT } = require("jose");

const prisma = new PrismaClient();
const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const secretKey = new TextEncoder().encode(JWT_SECRET);

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = "") {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName} ${detail ? "(" + detail + ")" : ""}`);
    failed++;
  }
}

const originalFetch = global.fetch;
global.fetch = async function (url, options = {}) {
  const headers = { ...(options.headers || {}), Connection: "close" };
  const res = await originalFetch(url, { ...options, headers });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { _raw: text };
  }
  await new Promise((r) => setTimeout(r, 100));
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    text: async () => text,
    json: async () => json,
    _data: json,
  };
};

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text, error: `Invalid JSON response (HTTP ${res.status})` };
  }
}

async function createSessionCookie(userId, email) {
  const token = await new SignJWT({ userId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretKey);
  return `session=${token}`;
}

async function runPhase10Audit() {
  console.log("=================================================================");
  console.log("  PHASE 10: STAFF MANAGEMENT, ROLES & PERMISSIONS SECURITY AUDIT");
  console.log("=================================================================\n");

  try {
    // 0. Server Health Check
    console.log("[0/9] Checking server availability at " + BASE_URL + "...");
    let serverReady = false;
    for (let i = 0; i < 15; i++) {
      try {
        const res = await fetch(`${BASE_URL}/`);
        if (res.status < 500) {
          serverReady = true;
          break;
        }
      } catch (e) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!serverReady) {
      throw new Error("Server not responding at " + BASE_URL);
    }
    console.log("Server is online.\n");

    // 1. Setup Test Database Context (Tenants and Users)
    console.log("[1/9] Setting up test context for Restaurant A and Restaurant B...");
    let restaurantA = await prisma.restaurant.findFirst({
      where: { status: "ACTIVE" },
      include: { users: { include: { user: true } } },
    });

    if (!restaurantA) {
      throw new Error("No active restaurant found in database. Please run seed or onboarding first.");
    }

    // Identify or ensure Owner A
    let ownerAMembership = restaurantA.users.find((u) => u.role === "OWNER");
    let ownerAUser = ownerAMembership?.user;

    if (!ownerAUser) {
      if (restaurantA.users.length > 0) {
        ownerAUser = restaurantA.users[0].user;
        await prisma.restaurantUser.update({
          where: { id: restaurantA.users[0].id },
          data: { role: "OWNER", status: "ACTIVE" },
        });
      } else {
        const salt = crypto.randomBytes(16).toString("hex");
        ownerAUser = await prisma.user.create({
          data: {
            name: "Owner A",
            email: `owner_a_${Date.now()}@example.com`,
            passwordHash: salt,
          },
        });
        await prisma.restaurantUser.create({
          data: {
            restaurantId: restaurantA.id,
            userId: ownerAUser.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        });
      }
    }

    const ownerACookie = await createSessionCookie(ownerAUser.id, ownerAUser.email);
    assert(!!ownerACookie, `Owner A authenticated (${ownerAUser.email})`);

    // Create or find Restaurant B for Multi-Tenant IDOR testing
    let restaurantB = await prisma.restaurant.findFirst({
      where: { id: { not: restaurantA.id } },
      include: { users: { include: { user: true } } },
    });

    let ownerBUser;
    if (!restaurantB) {
      ownerBUser = await prisma.user.create({
        data: {
          name: "Owner B",
          email: `owner_b_${Date.now()}@example.com`,
          passwordHash: "hash_placeholder",
        },
      });
      restaurantB = await prisma.restaurant.create({
        data: {
          name: "Restaurant B (Cross-Tenant)",
          slug: `restaurant-b-${Date.now()}`,
          users: {
            create: {
              userId: ownerBUser.id,
              role: "OWNER",
              status: "ACTIVE",
            },
          },
        },
        include: { users: { include: { user: true } } },
      });
    } else {
      ownerBUser = restaurantB.users[0]?.user;
      if (!ownerBUser) {
        ownerBUser = await prisma.user.create({
          data: {
            name: "Owner B",
            email: `owner_b_${Date.now()}@example.com`,
            passwordHash: "hash_placeholder",
          },
        });
        await prisma.restaurantUser.create({
          data: {
            restaurantId: restaurantB.id,
            userId: ownerBUser.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        });
      }
    }

    const ownerBCookie = await createSessionCookie(ownerBUser.id, ownerBUser.email);
    assert(!!ownerBCookie, `Owner B authenticated for Tenant B (${restaurantB.name})`);

    // Clean up any old test invitation records from previous runs
    const testEmails = [
      "p10_manager@test.com",
      "p10_staff@test.com",
      "p10_kitchen@test.com",
      "p10_owner_escalate@test.com",
    ];
    await prisma.staffInvitation.deleteMany({
      where: { email: { in: testEmails } },
    });
    // Remove memberships for test users if any
    const existingTestUsers = await prisma.user.findMany({
      where: { email: { in: testEmails } },
    });
    if (existingTestUsers.length > 0) {
      const testUserIds = existingTestUsers.map((u) => u.id);
      await prisma.restaurantUser.deleteMany({
        where: { userId: { in: testUserIds } },
      });
    }

    // 2. Staff Invitation Creation & Verification Security
    console.log("\n[2/9] Testing Staff Invitation Flow & Cryptographic Verification...");

    // 2.1 Unauthenticated request returns 401
    const unauthInviteRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "p10_manager@test.com", role: "MANAGER" }),
    });
    assert(unauthInviteRes.status === 401, "Unauthenticated invitation creation returns 401 Unauthorized");

    // 2.2 Owner A invites a Manager
    const inviteMgrRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerACookie,
      },
      body: JSON.stringify({ email: "p10_manager@test.com", role: "MANAGER" }),
    });
    const inviteMgrData = await safeJson(inviteMgrRes);
    assert(inviteMgrRes.status === 200 && inviteMgrData.success, "Owner can invite a MANAGER (200 OK)");
    assert(typeof inviteMgrData.inviteUrl === "string" && inviteMgrData.inviteUrl.includes("/invite/"), "Returns formatted invitation URL");

    const mgrToken = inviteMgrData.inviteUrl.split("/invite/")[1];
    const mgrInviteId = inviteMgrData.invitation.id;
    assert(mgrToken.length === 64, `Generated 32-byte cryptographic hex token (length: ${mgrToken.length})`);

    // 2.3 Verify invitation token
    const verifyRes = await fetch(`${BASE_URL}/api/v1/staff/invitations/verify?token=${mgrToken}`);
    const verifyData = await safeJson(verifyRes);
    assert(verifyRes.status === 200 && verifyData.valid === true, "Public token verification succeeds for valid token");
    assert(verifyData.invitation && verifyData.invitation.role === "MANAGER", "Token verification accurately returns target role MANAGER");

    // 2.4 Tampered token verification
    const tamperedRes = await fetch(`${BASE_URL}/api/v1/staff/invitations/verify?token=deadbeefdeadbeefdeadbeef`);
    const tamperedData = await safeJson(tamperedRes);
    assert(tamperedRes.status === 404 && tamperedData.valid === false, "Tampered/invalid token returns 404 invalid");

    // 2.5 Cancel invitation
    const cancelRes = await fetch(`${BASE_URL}/api/v1/staff/invitations/${mgrInviteId}`, {
      method: "DELETE",
      headers: { Cookie: ownerACookie },
    });
    assert(cancelRes.status === 200, "Owner can cancel a pending invitation (200 OK)");

    // 2.6 Verifying cancelled token returns 400
    const verifyCancelledRes = await fetch(`${BASE_URL}/api/v1/staff/invitations/verify?token=${mgrToken}`);
    const verifyCancelledData = await safeJson(verifyCancelledRes);
    assert(verifyCancelledRes.status === 400 && verifyCancelledData.valid === false, "Cancelled invitation verification fails with 400");

    // 3. Invitation Acceptance & Single-Use Invariant
    console.log("\n[3/9] Testing Invitation Acceptance & Single-Use Security...");

    // Re-invite Manager
    const reInviteRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerACookie,
      },
      body: JSON.stringify({ email: "p10_manager@test.com", role: "MANAGER" }),
    });
    const reInviteData = await safeJson(reInviteRes);
    const activeMgrToken = reInviteData.inviteUrl.split("/invite/")[1];

    // Accept invitation with new account
    const acceptRes = await fetch(`${BASE_URL}/api/v1/staff/invitations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: activeMgrToken,
        name: "Test Manager Bob",
        password: "StrongPassword123!",
      }),
    });
    const acceptData = await safeJson(acceptRes);
    assert(acceptRes.status === 200 && acceptData.success, "New user accepts invitation and creates account (200 OK)");

    // Verify Manager user in database
    const mgrUserInDb = await prisma.user.findUnique({
      where: { email: "p10_manager@test.com" },
      include: { restaurants: true },
    });
    assert(!!mgrUserInDb, "Manager User record created in database");
    assert(mgrUserInDb.restaurants.some((r) => r.restaurantId === restaurantA.id && r.role === "MANAGER"), "User assigned MANAGER role in restaurant");

    const mgrCookie = await createSessionCookie(mgrUserInDb.id, mgrUserInDb.email);

    // 3.3 Single-Use Token Enforcement: Replay the same token
    const replayRes = await fetch(`${BASE_URL}/api/v1/staff/invitations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: activeMgrToken,
        name: "Duplicate User",
        password: "StrongPassword123!",
      }),
    });
    assert(replayRes.status === 400, "Replaying accepted token is rejected with 400 (Single-Use Enforced)");

    // 4. Role Hierarchy & Permission Boundaries
    console.log("\n[4/9] Testing Role Hierarchy & Privilege Boundaries...");

    // 4.1 Manager invites a Floor Staff
    const mgrInviteStaffRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgrCookie,
      },
      body: JSON.stringify({ email: "p10_staff@test.com", role: "STAFF" }),
    });
    const mgrInviteStaffData = await safeJson(mgrInviteStaffRes);
    assert(mgrInviteStaffRes.status === 200 && mgrInviteStaffData.success, "Manager can invite Floor STAFF (200 OK)");
    const staffToken = mgrInviteStaffData.inviteUrl.split("/invite/")[1];

    // 4.2 Manager invites Kitchen Chef
    const mgrInviteKitchenRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgrCookie,
      },
      body: JSON.stringify({ email: "p10_kitchen@test.com", role: "KITCHEN" }),
    });
    const mgrInviteKitchenData = await safeJson(mgrInviteKitchenRes);
    assert(mgrInviteKitchenRes.status === 200 && mgrInviteKitchenData.success, "Manager can invite KITCHEN staff (200 OK)");
    const kitchenToken = mgrInviteKitchenData.inviteUrl.split("/invite/")[1];

    // 4.3 Manager attempts to invite an OWNER -> Blocked (Owner Protection)
    const mgrInviteOwnerRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgrCookie,
      },
      body: JSON.stringify({ email: "p10_owner_escalate@test.com", role: "OWNER" }),
    });
    assert(mgrInviteOwnerRes.status === 403, "Manager cannot invite an OWNER (403 Forbidden - Owner Protection)");

    // Accept Staff invitation
    await fetch(`${BASE_URL}/api/v1/staff/invitations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: staffToken,
        name: "Test Staff Alice",
        password: "StaffPassword123!",
      }),
    });
    const staffUserInDb = await prisma.user.findUnique({
      where: { email: "p10_staff@test.com" },
      include: { restaurants: true },
    });
    const staffCookie = await createSessionCookie(staffUserInDb.id, staffUserInDb.email);

    // Accept Kitchen invitation
    await fetch(`${BASE_URL}/api/v1/staff/invitations/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: kitchenToken,
        name: "Chef Gordon",
        password: "ChefPassword123!",
      }),
    });
    const kitchenUserInDb = await prisma.user.findUnique({
      where: { email: "p10_kitchen@test.com" },
      include: { restaurants: true },
    });
    const kitchenCookie = await createSessionCookie(kitchenUserInDb.id, kitchenUserInDb.email);

    // 4.6 Staff attempts to invite someone -> Blocked (403)
    const staffAttemptInviteRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: staffCookie,
      },
      body: JSON.stringify({ email: "random@test.com", role: "STAFF" }),
    });
    assert(staffAttemptInviteRes.status === 403, "Staff cannot invite new members (403 Forbidden)");

    // 4.7 Kitchen attempts to invite someone -> Blocked (403)
    const kitchenAttemptInviteRes = await fetch(`${BASE_URL}/api/v1/staff/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: kitchenCookie,
      },
      body: JSON.stringify({ email: "random@test.com", role: "STAFF" }),
    });
    assert(kitchenAttemptInviteRes.status === 403, "Kitchen cannot invite new members (403 Forbidden)");

    // 5. Staff Updates, Hierarchy & Self-Escalation Protection
    console.log("\n[5/9] Testing Staff Updates, Hierarchy & Self-Escalation Guards...");

    const staffMembership = staffUserInDb.restaurants.find((r) => r.restaurantId === restaurantA.id);
    const mgrMembership = mgrUserInDb.restaurants.find((r) => r.restaurantId === restaurantA.id);
    const ownerMembership = await prisma.restaurantUser.findFirst({
      where: { restaurantId: restaurantA.id, role: "OWNER" },
    });

    // 5.1 Manager updates Staff member role to KITCHEN
    const mgrUpdateStaffRes = await fetch(`${BASE_URL}/api/v1/staff/${staffMembership.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgrCookie,
      },
      body: JSON.stringify({ role: "KITCHEN" }),
    });
    assert(mgrUpdateStaffRes.status === 200, "Manager can update Staff member to Kitchen (200 OK)");

    // 5.2 Staff attempts to update another staff -> Blocked (403)
    const staffUpdateRes = await fetch(`${BASE_URL}/api/v1/staff/${mgrMembership.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: staffCookie,
      },
      body: JSON.stringify({ role: "STAFF" }),
    });
    assert(staffUpdateRes.status === 403, "Staff cannot update other staff members (403 Forbidden)");

    // 5.3 Self-Escalation Block: Manager attempts to update own role
    const mgrSelfEscalateRes = await fetch(`${BASE_URL}/api/v1/staff/${mgrMembership.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgrCookie,
      },
      body: JSON.stringify({ role: "OWNER" }),
    });
    assert(mgrSelfEscalateRes.status === 403, "Self-Escalation Block: Manager cannot alter own role/membership (403 Forbidden)");

    // 5.4 Owner Protection: Manager attempts to modify Owner
    const mgrTamperOwnerRes = await fetch(`${BASE_URL}/api/v1/staff/${ownerMembership.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgrCookie,
      },
      body: JSON.stringify({ role: "STAFF", status: "DISABLED" }),
    });
    assert(mgrTamperOwnerRes.status === 403, "Owner Protection: Manager cannot modify or disable Owner (403 Forbidden)");

    // 5.5 Manager attempts to assign OWNER role to someone else
    const mgrPromoteToOwnerRes = await fetch(`${BASE_URL}/api/v1/staff/${staffMembership.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgrCookie,
      },
      body: JSON.stringify({ role: "OWNER" }),
    });
    assert(mgrPromoteToOwnerRes.status === 403, "Manager cannot promote any member to OWNER (403 Forbidden)");

    // 6. Staff Deactivation & Session Security Guard
    console.log("\n[6/9] Testing Staff Deactivation & Disabled Session Guard...");

    // 6.1 Manager deactivates staff member
    const disableRes = await fetch(`${BASE_URL}/api/v1/staff/${staffMembership.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: mgrCookie,
      },
      body: JSON.stringify({ status: "DISABLED" }),
    });
    const disableData = await safeJson(disableRes);
    assert(disableRes.status === 200 && disableData.member && disableData.member.status === "DISABLED", "Manager successfully disables staff member (status: DISABLED)");

    // 6.2 Disabled staff member calling API is immediately rejected
    const disabledStaffCallRes = await fetch(`${BASE_URL}/api/v1/staff`, {
      headers: { Cookie: staffCookie },
    });
    assert(disabledStaffCallRes.status === 403, "Disabled staff session immediately blocked at API guard (403 Forbidden)");

    // 6.3 Re-enabling staff member
    const reEnableRes = await fetch(`${BASE_URL}/api/v1/staff/${staffMembership.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerACookie,
      },
      body: JSON.stringify({ status: "ACTIVE", role: "STAFF" }),
    });
    assert(reEnableRes.status === 200, "Owner can re-activate disabled staff member (status: ACTIVE)");

    // 7. Multi-Tenant Isolation & IDOR Protection
    console.log("\n[7/9] Testing Multi-Tenant Isolation (IDOR Defense)...");

    // 7.1 Owner B fetches staff -> does not leak Restaurant A's staff
    const tenantBListRes = await fetch(`${BASE_URL}/api/v1/staff`, {
      headers: { Cookie: ownerBCookie },
    });
    const tenantBListData = await safeJson(tenantBListRes);
    const hasLeakedStaff = (tenantBListData.members || []).some((m) => m.restaurantId === restaurantA.id);
    assert(tenantBListRes.status === 200 && !hasLeakedStaff, "Tenant B member list contains NO members from Tenant A");

    // 7.2 Owner B attempts to modify Tenant A's staff member via IDOR
    const idorPatchRes = await fetch(`${BASE_URL}/api/v1/staff/${staffMembership.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerBCookie,
      },
      body: JSON.stringify({ status: "DISABLED" }),
    });
    assert(idorPatchRes.status === 404 || idorPatchRes.status === 403, "Cross-Tenant IDOR: Owner B cannot modify Tenant A staff (404/403)");

    // 7.3 Owner B attempts to delete Tenant A's staff member via IDOR
    const idorDeleteRes = await fetch(`${BASE_URL}/api/v1/staff/${staffMembership.id}`, {
      method: "DELETE",
      headers: { Cookie: ownerBCookie },
    });
    assert(idorDeleteRes.status === 404 || idorDeleteRes.status === 403, "Cross-Tenant IDOR: Owner B cannot remove Tenant A staff (404/403)");

    // 8. Safe Staff Removal & Invariants
    console.log("\n[8/9] Testing Safe Staff Removal & Invariants...");

    const kitchenMembership = kitchenUserInDb.restaurants.find((r) => r.restaurantId === restaurantA.id);

    // 8.1 Manager attempts to remove Owner -> Blocked
    const mgrDeleteOwnerRes = await fetch(`${BASE_URL}/api/v1/staff/${ownerMembership.id}`, {
      method: "DELETE",
      headers: { Cookie: mgrCookie },
    });
    assert(mgrDeleteOwnerRes.status === 403, "Owner Protection: Owner cannot be removed by any staff (403 Forbidden)");

    // 8.2 Manager attempts to remove themselves -> Blocked
    const mgrSelfDeleteRes = await fetch(`${BASE_URL}/api/v1/staff/${mgrMembership.id}`, {
      method: "DELETE",
      headers: { Cookie: mgrCookie },
    });
    assert(mgrSelfDeleteRes.status === 400 || mgrSelfDeleteRes.status === 403, "Self-Removal Block: User cannot delete own membership via staff API (400/403)");

    // 8.3 Owner removes Kitchen Chef -> Allowed
    const ownerDeleteKitchenRes = await fetch(`${BASE_URL}/api/v1/staff/${kitchenMembership.id}`, {
      method: "DELETE",
      headers: { Cookie: ownerACookie },
    });
    assert(ownerDeleteKitchenRes.status === 200, "Owner can remove staff member safely (200 OK)");

    // Verify Kitchen RestaurantUser is gone, but User record is preserved
    const deletedMembership = await prisma.restaurantUser.findUnique({
      where: { id: kitchenMembership.id },
    });
    const preservedUser = await prisma.user.findUnique({
      where: { id: kitchenUserInDb.id },
    });
    assert(!deletedMembership, "RestaurantUser membership successfully revoked from database");
    assert(!!preservedUser, "User account preserved in database for historical record integrity");

    // 9. Staff Audit Trail Verification
    console.log("\n[9/9] Verifying Security Audit Trail Logs...");

    const staffListRes = await fetch(`${BASE_URL}/api/v1/staff`, {
      headers: { Cookie: ownerACookie },
    });
    const staffListData = await safeJson(staffListRes);

    const loggedActions = (staffListData.auditLogs || []).map((l) => l.action);
    console.log("  Audit Actions Recorded:", loggedActions);

    assert(loggedActions.includes("STAFF_INVITED"), "Audit trail captured STAFF_INVITED");
    assert(loggedActions.includes("INVITATION_ACCEPTED"), "Audit trail captured INVITATION_ACCEPTED");
    assert(loggedActions.includes("ROLE_CHANGED"), "Audit trail captured ROLE_CHANGED");
    assert(loggedActions.includes("STAFF_DISABLED"), "Audit trail captured STAFF_DISABLED");
    assert(loggedActions.includes("STAFF_ENABLED"), "Audit trail captured STAFF_ENABLED");
    assert(loggedActions.includes("STAFF_REMOVED"), "Audit trail captured STAFF_REMOVED");
    assert(loggedActions.includes("INVITATION_CANCELLED"), "Audit trail captured INVITATION_CANCELLED");

    console.log("\n=================================================================");
    console.log(`  AUDIT COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================\n");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test Suite Execution Failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase10Audit();
