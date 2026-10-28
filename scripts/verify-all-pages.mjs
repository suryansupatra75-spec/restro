import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const BASE_URL = "http://localhost:3000";
const JWT_SECRET = process.env.JWT_SECRET || "default_super_secret_key_change_me_in_production";
const prisma = new PrismaClient();

async function makeToken(userId, email, isSuperAdmin = false) {
  const secretKey = new TextEncoder().encode(JWT_SECRET);
  return await new SignJWT({ userId, email, isSuperAdmin })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey);
}

async function checkPage(name, path, headers = {}) {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        ...headers,
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      },
      redirect: "manual",
    });
    const duration = performance.now() - start;
    const text = await res.text();
    const hasError = text.includes("Application error") || text.includes("Internal Server Error") || text.includes("Unhandled Runtime Error");
    
    // Check for common layout markers
    const hasHtml = text.includes("<html") || text.includes("<!DOCTYPE");
    const titleMatch = text.match(/<title>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : "N/A";

    return {
      name,
      path,
      status: res.status,
      duration: Number(duration.toFixed(2)),
      sizeKB: Number((text.length / 1024).toFixed(1)),
      ok: res.ok && !hasError,
      title,
      hasError,
      redirect: res.status >= 300 && res.status < 400 ? res.headers.get("location") : null,
    };
  } catch (err) {
    const duration = performance.now() - start;
    return {
      name,
      path,
      status: 0,
      duration: Number(duration.toFixed(2)),
      sizeKB: 0,
      ok: false,
      title: "ERROR",
      hasError: true,
      error: err.message,
    };
  }
}

async function main() {
  console.log("==================================================================");
  console.log("🌐 COMPREHENSIVE FULL-PAGE SPEED & LAYOUT VERIFICATION");
  console.log("==================================================================");

  // 1. Get sample active restaurant, table QR, and user
  const qr = await prisma.qRCode.findFirst({
    where: { status: "ACTIVE" },
    include: { table: true, restaurant: true },
  });

  const owner = await prisma.user.findFirst({
    where: { isActive: true, isSuperAdmin: false },
  });

  const superAdmin = await prisma.user.findFirst({
    where: { isSuperAdmin: true },
  });

  if (!qr) {
    console.error("❌ No active QR code found.");
    process.exit(1);
  }

  const ownerToken = owner ? await makeToken(owner.id, owner.email, false) : "";
  const adminToken = superAdmin ? await makeToken(superAdmin.id, superAdmin.email, true) : "";

  const ownerHeaders = { Cookie: `session=${ownerToken}` };
  const adminHeaders = { Cookie: `session=${adminToken}` };

  console.log(`\n📋 Testing with Context:`);
  console.log(`   Restaurant: ${qr.restaurant.name}`);
  console.log(`   Table: ${qr.table.name}`);
  console.log(`   Active QR Token: ${qr.token}`);
  console.log(`   Owner: ${owner?.email || "none"}`);
  console.log(`   SuperAdmin: ${superAdmin?.email || "none"}\n`);

  const pagesToTest = [
    // Public / Marketing
    { name: "Public Landing Page", path: "/" },
    { name: "Login Screen", path: "/login" },
    { name: "Registration Screen", path: "/register" },
    
    // Customer Mobile-First Experience
    { name: "Customer QR Menu (Mobile)", path: `/q/${qr.token}` },

    // Owner Dashboard Pages
    { name: "Dashboard Overview", path: "/dashboard", headers: ownerHeaders },
    { name: "Live Orders POS", path: "/dashboard/orders", headers: ownerHeaders },
    { name: "Kitchen Display (KDS)", path: "/dashboard/kitchen", headers: ownerHeaders },
    { name: "Menu Management", path: "/dashboard/menu", headers: ownerHeaders },
    { name: "Categories Manager", path: "/dashboard/menu/categories", headers: ownerHeaders },
    { name: "New Menu Item Form", path: "/dashboard/menu/items/new", headers: ownerHeaders },
    { name: "Menu Preview", path: "/dashboard/menu/preview", headers: ownerHeaders },
    { name: "Tables & QR Manager", path: "/dashboard/tables", headers: ownerHeaders },
    { name: "Inventory Control", path: "/dashboard/inventory", headers: ownerHeaders },
    { name: "Customer CRM", path: "/dashboard/customers", headers: ownerHeaders },
    { name: "Analytics Dashboard", path: "/dashboard/analytics", headers: ownerHeaders },
    { name: "Promotions & Discounts", path: "/dashboard/promotions", headers: ownerHeaders },
    { name: "Loyalty Program", path: "/dashboard/loyalty", headers: ownerHeaders },
    { name: "Digital Receipts List", path: "/dashboard/receipts", headers: ownerHeaders },
    { name: "Settings & Google Link", path: "/dashboard/settings", headers: ownerHeaders },
    { name: "Integrations & Webhooks", path: "/dashboard/integrations", headers: ownerHeaders },
    { name: "Staff Management", path: "/dashboard/staff", headers: ownerHeaders },
    { name: "Audit Logs", path: "/dashboard/audit-logs", headers: ownerHeaders },
    { name: "Subscription & Billing", path: "/dashboard/billing", headers: ownerHeaders },

    // Super Admin Platform
    { name: "Super Admin Overview", path: "/super-admin", headers: adminHeaders },
    { name: "Super Admin Restaurants", path: "/super-admin/restaurants", headers: adminHeaders },
    { name: "Super Admin Users", path: "/super-admin/users", headers: adminHeaders },
    { name: "Super Admin Plans", path: "/super-admin/plans", headers: adminHeaders },
    { name: "Super Admin Audit Logs", path: "/super-admin/audit-logs", headers: adminHeaders },
  ];

  console.log(`Executing inspection across ${pagesToTest.length} platform pages...\n`);

  const results = [];
  for (const page of pagesToTest) {
    const res = await checkPage(page.name, page.path, page.headers);
    results.push(res);
    const statusIcon = res.ok ? "✅" : res.status === 307 || res.status === 302 ? "↪️" : "❌";
    console.log(`${statusIcon} [${res.status}] ${res.name.padEnd(28)} | ${res.path.padEnd(32)} | ${String(res.duration).padStart(7)} ms | ${String(res.sizeKB).padStart(6)} KB`);
  }

  console.log("\n==================================================================");
  console.log("📊 SUMMARY MATRIX");
  console.log("==================================================================");
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  console.log(`Total Pages Visited: ${total}`);
  console.log(`Passed Cleanly:      ${passed} / ${total} (${((passed/total)*100).toFixed(1)}%)`);
  
  const avgDuration = (results.reduce((a, b) => a + b.duration, 0) / total).toFixed(2);
  console.log(`Average Load Time:   ${avgDuration} ms`);

  await prisma.$disconnect();
}

main().catch(console.error);
