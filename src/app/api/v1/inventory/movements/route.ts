import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import {
  createMovementSchema,
  movementQuerySchema,
} from "@/lib/validations/inventory";
import { recordStockMovement } from "@/lib/inventory/service";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "inventory.viewHistory");
    if (errorResponse) return errorResponse;

    const { restaurantId, role } = context;
    const url = new URL(req.url);

    const queryResult = movementQuerySchema.safeParse({
      page: url.searchParams.get("page") || 1,
      limit: url.searchParams.get("limit") || 20,
      itemId: url.searchParams.get("itemId") || undefined,
      type: url.searchParams.get("type") || undefined,
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: queryResult.error.issues[0]?.message || "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { page, limit, itemId, type, startDate, endDate } = queryResult.data;
    const canViewCosts = hasPermission(role, "inventory.viewCosts");

    const where: any = {
      restaurantId,
    };

    if (itemId) {
      where.itemId = itemId;
    }
    if (type && type !== "ALL") {
      where.type = type;
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [total, movements] = await Promise.all([
      prisma.inventoryMovement.count({ where }),
      prisma.inventoryMovement.findMany({
        where,
        include: {
          item: {
            select: { id: true, name: true, sku: true, unit: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    return NextResponse.json({
      success: true,
      movements: movements.map((m) => ({
        id: m.id,
        itemId: m.itemId,
        itemName: m.item.name,
        itemSku: m.item.sku,
        type: m.type,
        quantityChange: Number(m.quantityChange),
        resultingBalance: Number(m.resultingBalance),
        unit: m.unit,
        costPerUnit: canViewCosts && m.costPerUnit ? Number(m.costPerUnit) : null,
        reason: m.reason,
        actorId: m.actorId,
        actorName: m.actorName,
        orderId: m.orderId,
        createdAt: m.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("GET /api/v1/inventory/movements error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "inventory.view");
    if (errorResponse) return errorResponse;

    const { restaurantId, user, role } = context;

    let body: any = {};
    try {
      const rawText = await req.text();
      if (rawText && rawText.trim().length > 0) body = JSON.parse(rawText);
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsed = createMovementSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid movement data" },
        { status: 400 }
      );
    }

    const { itemId, type, quantity, unit, costPerUnit, reason } = parsed.data;

    // Granular permission check by movement type
    if (type === "STOCK_RECEIVED") {
      if (!hasPermission(role, "inventory.receive")) {
        return NextResponse.json(
          { error: "Forbidden: You lack permission to receive stock" },
          { status: 403 }
        );
      }
    } else {
      // ADJUSTMENT_INCREASE, ADJUSTMENT_DECREASE, WASTE
      if (!hasPermission(role, "inventory.adjust")) {
        return NextResponse.json(
          { error: "Forbidden: You lack permission to record adjustments or waste" },
          { status: 403 }
        );
      }
    }

    try {
      const result = await recordStockMovement({
        restaurantId,
        itemId,
        type,
        quantity,
        unit,
        costPerUnit: hasPermission(role, "inventory.viewCosts") ? costPerUnit : null,
        reason,
        actorId: user.id,
        actorName: user.name,
      });

      return NextResponse.json(
        {
          success: true,
          item: {
            id: result.item.id,
            name: result.item.name,
            currentStock: Number(result.item.currentStock),
            unit: result.item.unit,
          },
          movement: {
            id: result.movement.id,
            type: result.movement.type,
            quantityChange: Number(result.movement.quantityChange),
            resultingBalance: Number(result.movement.resultingBalance),
            unit: result.movement.unit,
            createdAt: result.movement.createdAt,
          },
        },
        { status: 201 }
      );
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  } catch (error) {
    console.error("POST /api/v1/inventory/movements error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
