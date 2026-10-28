import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import {
  buildSalesLedgerExport,
  buildTaxReportExport,
  buildProfitLossExport,
} from "@/lib/integrations/exports";
import { exportLedgerQuerySchema } from "@/lib/validations/integrations";

export async function GET(req: NextRequest) {
  try {
    const { errorResponse, context } = await requireAuthMember(req, "integrations.view");
    if (errorResponse) return errorResponse;

    const url = new URL(req.url);
    const rawQuery = {
      type: url.searchParams.get("type"),
      startDate: url.searchParams.get("startDate"),
      endDate: url.searchParams.get("endDate"),
      format: url.searchParams.get("format") || "csv",
    };

    const parsed = exportLedgerQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid export query parameters" },
        { status: 400 }
      );
    }

    const { type, startDate, endDate, format } = parsed.data;

    let exportData: string | object = "";
    let filenameBase = "";

    switch (type) {
      case "sales_ledger":
        exportData = await buildSalesLedgerExport(context.restaurantId, startDate, endDate, format);
        filenameBase = "sales_ledger";
        break;
      case "tax_report":
        exportData = await buildTaxReportExport(context.restaurantId, startDate, endDate, format);
        filenameBase = "tax_invoicing_report";
        break;
      case "profit_loss":
        exportData = await buildProfitLossExport(context.restaurantId, startDate, endDate, format);
        filenameBase = "profit_loss_cogs_summary";
        break;
    }

    if (format === "json") {
      return NextResponse.json(exportData);
    }

    // CSV File response
    const filename = `${filenameBase}_${startDate}_to_${endDate}.csv`;
    return new NextResponse(exportData as string, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  } catch (error: any) {
    console.error("GET /api/v1/integrations/exports error:", error);
    return NextResponse.json(
      { error: "Failed to generate accounting export" },
      { status: 500 }
    );
  }
}
