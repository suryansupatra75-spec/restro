#!/usr/bin/env node
/**
 * Safe Server-Side Super Admin Provisioning & Recovery Script
 *
 * Usage:
 *   node scripts/provision-super-admin.js --email admin@platform.local --password "StrongPassword123!" --name "Platform Super Admin"
 *
 * Or via environment variables:
 *   SUPER_ADMIN_EMAIL=admin@platform.local SUPER_ADMIN_PASSWORD="StrongPassword123!" node scripts/provision-super-admin.js
 *
 * Security notes:
 * - Public registration (/api/v1/auth/register) can NEVER grant Super Admin privileges.
 * - This CLI tool runs only with direct server/database access and records a PlatformAuditLog entry.
 */

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const emailRaw = args.email || process.env.SUPER_ADMIN_EMAIL;
  const password = args.password || process.env.SUPER_ADMIN_PASSWORD;
  const name = args.name || process.env.SUPER_ADMIN_NAME || "Platform Super Admin";

  if (!emailRaw) {
    console.error(
      "Error: Missing --email <email> (or SUPER_ADMIN_EMAIL environment variable)."
    );
    process.exit(1);
  }

  const email = String(emailRaw).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Error: Invalid email address "${email}".`);
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    const updateData = {
      isSuperAdmin: true,
      isActive: true,
      suspendedReason: null,
      suspendedAt: null,
    };

    if (args.name) {
      updateData.name = name;
    }

    if (password) {
      if (String(password).length < 8) {
        console.error("Error: Password must be at least 8 characters long.");
        process.exit(1);
      }
      updateData.passwordHash = await bcrypt.hash(String(password), 10);
    }

    const updated = await prisma.user.update({
      where: { id: existing.id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        isSuperAdmin: true,
        isActive: true,
      },
    });

    await prisma.platformAuditLog.create({
      data: {
        actorId: updated.id,
        actorEmail: updated.email,
        action: "SUPER_ADMIN_PROVISIONED_CLI",
        targetType: "USER",
        targetId: updated.id,
        targetLabel: updated.email,
        reason: "Provisioned or recovered Super Admin via server CLI script",
        metadata: JSON.stringify({
          mode: "PROMOTE_EXISTING",
          passwordUpdated: Boolean(password),
        }),
      },
    });

    console.log(
      JSON.stringify({
        status: "PROMOTED_EXISTING_USER",
        user: updated,
      })
    );
    return;
  }

  if (!password || String(password).length < 8) {
    console.error(
      "Error: Creating a new Super Admin user requires --password (at least 8 characters)."
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(String(password), 10);
  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      isSuperAdmin: true,
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      email: true,
      isSuperAdmin: true,
      isActive: true,
    },
  });

  await prisma.platformAuditLog.create({
    data: {
      actorId: created.id,
      actorEmail: created.email,
      action: "SUPER_ADMIN_PROVISIONED_CLI",
      targetType: "USER",
      targetId: created.id,
      targetLabel: created.email,
      reason: "Created new Super Admin via server CLI script",
      metadata: JSON.stringify({
        mode: "CREATE_NEW",
      }),
    },
  });

  console.log(
    JSON.stringify({
      status: "CREATED_SUPER_ADMIN",
      user: created,
    })
  );
}

main()
  .catch((err) => {
    console.error("Failed to provision Super Admin:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
