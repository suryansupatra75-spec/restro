import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { recordTenantPrintJob } from "@/lib/integrations/service";
import { recordPrintJobSchema } from "@/lib/validations/integrations";

export async function POST(req: NextRequest) {
  try {
    // Both orders.view and kitchen.view staff can trigger print jobs
    const { errorResponse, context } = await requireAuthMember(req, "orders.view");
    if (errorResponse) return errorResponse;

    const body = await req.json();
    const parsed = recordPrintJobSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid print request payload" },
        { status: 400 }
      );
    }

    const job = await recordTenantPrintJob({
      restaurantId: context.restaurantId,
      orderId: parsed.data.orderId,
      printType: parsed.data.printType,
      printedBy: context.user.name || context.role,
      printerName: parsed.data.printerName,
    });

    return NextResponse.json({
      success: true,
      printJob: job,
    });
  } catch (error: any) {
    console.error("POST /api/v1/integrations/print error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to record print job" },
      { status: 400 }
    );
  }
}
