import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tableSchema } from "@/lib/validations/tables";
import { z } from "zod";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    
    const tableId = (await props.params).id;
    const body = await req.json();
    
    const data = tableSchema.partial().parse(body);

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

    if (data.name && data.name !== table.name) {
      const existingTable = await prisma.table.findFirst({
        where: {
          restaurantId: table.restaurantId,
          name: data.name,
        },
      });

      if (existingTable) {
        return NextResponse.json({ error: "Table name already exists" }, { status: 400 });
      }
    }

    const updatedTable = await prisma.table.update({
      where: { id: tableId },
      data,
    });

    return NextResponse.json(updatedTable);
  } catch (error) {
    console.error("PATCH /api/v1/tables/[id] error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation Error" }, { status: 400 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation Error" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
