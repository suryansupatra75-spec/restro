import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import crypto from "crypto";

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    
    const tableId = (await props.params).id;

    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some(r => r.restaurantId === table.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const qrCode = await prisma.qRCode.findFirst({
      where: {
        tableId,
        status: "ACTIVE",
      },
    });

    if (!qrCode) {
      return NextResponse.json({ error: "QR Code not found" }, { status: 404 });
    }

    return NextResponse.json(qrCode);
  } catch (error) {
    console.error("GET /api/v1/tables/[id]/qr error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    
    const tableId = (await props.params).id;

    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found" }, { status: 404 });
    }

    const hasAccess = user.restaurants.some(r => r.restaurantId === table.restaurantId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Deactivate old QR codes for this table
    await prisma.qRCode.updateMany({
      where: { tableId, status: "ACTIVE" },
      data: { status: "INACTIVE" },
    });

    const token = crypto.randomBytes(8).toString("hex");
    const appUrl = process.env.APP_URL || "http://localhost:3000";
    const qrUrl = `${appUrl}/q/${token}`;

    const newQrCode = await prisma.qRCode.create({
      data: {
        restaurantId: table.restaurantId,
        tableId,
        token,
        url: qrUrl,
        status: "ACTIVE",
      },
    });

    return NextResponse.json(newQrCode, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/tables/[id]/qr error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
