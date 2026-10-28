import { NextRequest, NextResponse } from "next/server";
import { requireAuthMember } from "@/lib/auth-guard";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { markCashPaymentPaid } from "@/lib/payments/service";
import { deductStockForOrder, reverseStockForOrder } from "@/lib/inventory/service";
import { notifyOrderStatusChanged } from "@/lib/notifications/service";
import { releaseOrderPromotionRedemption } from "@/lib/promotions/service";
import {
  awardLoyaltyPointsForOrder,
  refundOrReverseLoyaltyPointsForOrder,
} from "@/lib/loyalty/service";
import { dispatchTenantWebhookEvent } from "@/lib/integrations/webhooks";
import { recordAuditLog } from "@/lib/audit/service";

const VALID_TRANSITIONS: Record<string, string[]> = {
  "PENDING": ["ACCEPTED", "PREPARING", "REJECTED"],
  "ACCEPTED": ["PREPARING", "REJECTED"],
  "PREPARING": ["READY", "REJECTED"],
  "READY": ["COMPLETED"],
};

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    // 1. Authenticate & verify tenant membership FIRST before touching Order data
    const auth = await requireAuthMember(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { user, restaurantId, role } = auth.context;

    const { id } = await props.params;
    const rawText = await req.text();
    const body = rawText ? JSON.parse(rawText) : {};
    const { status, paymentStatus } = body;

    if (!status && !paymentStatus) {
      return NextResponse.json({ error: "status or paymentStatus is required" }, { status: 400 });
    }

    if (paymentStatus && !hasPermission(role, "payments.manage")) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions (payments.manage)" },
        { status: 403 }
      );
    }

    if (
      status &&
      !hasPermission(role, "orders.manage") &&
      !hasPermission(role, "kitchen.manage")
    ) {
      return NextResponse.json(
        { error: "Forbidden: Insufficient permissions to update order status" },
        { status: 403 }
      );
    }

    // 2. Fetch order after auth succeeds and verify tenant ownership
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, restaurantId: true, status: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (order.restaurantId !== restaurantId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Handle payment status update if requested (e.g. marking cash payment as PAID)
    if (paymentStatus && paymentStatus === "PAID") {
      await markCashPaymentPaid({
        orderId: id,
        restaurantId,
      });
    }

    // Handle order lifecycle status transition if requested
    if (status) {
      const allowedNextStates = VALID_TRANSITIONS[order.status] || [];
      if (!allowedNextStates.includes(status)) {
        return NextResponse.json({ 
          error: `Invalid status transition from ${order.status} to ${status}` 
        }, { status: 400 });
      }

      const updatedOrder = await prisma.order.update({
        where: { 
          id,
          status: order.status
        },
        data: { status },
        include: {
          table: true,
          payments: {
            orderBy: { createdAt: "desc" },
            take: 1
          },
          items: {
            include: {
              selectedVariant: true,
              selectedAddons: true
            }
          }
        }
      });

      // Run Inventory, Promotion Redemption Release, Loyalty Lifecycle & Notification Hooks concurrently
      const hookResults = await Promise.allSettled([
        (async () => {
          if (status === "ACCEPTED" || status === "PREPARING") {
            await deductStockForOrder(id, restaurantId, user.name);
          } else if (status === "COMPLETED") {
            await awardLoyaltyPointsForOrder({
              restaurantId,
              orderId: id,
              actorUserId: user.id,
            });
          } else if (status === "REJECTED" || status === "CANCELLED") {
            await reverseStockForOrder(id, restaurantId, user.name);
            await releaseOrderPromotionRedemption(
              id,
              status === "REJECTED" ? "ORDER_REJECTED" : "ORDER_CANCELLED"
            );
            await refundOrReverseLoyaltyPointsForOrder({
              restaurantId,
              orderId: id,
              reason: status === "REJECTED" ? "ORDER_REJECTED" : "ORDER_CANCELLED",
              actorUserId: user.id,
            });
          }
        })(),
        notifyOrderStatusChanged({
          restaurantId,
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          previousStatus: order.status,
          newStatus: updatedOrder.status,
          tableName: updatedOrder.table?.name,
          tableNumber: updatedOrder.table?.number,
          actorUserId: user.id,
        }),
        dispatchTenantWebhookEvent(restaurantId, "order.status_changed", {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          previousStatus: order.status,
          newStatus: updatedOrder.status,
          tableName: updatedOrder.table?.name,
          total: Number(updatedOrder.total),
        }),
        recordAuditLog({
          restaurantId,
          actorId: user.id,
          actorEmail: user.email,
          actorName: user.name,
          actorRole: role,
          action: "ORDER_STATUS_UPDATED",
          resourceType: "ORDER",
          resourceId: updatedOrder.id,
          resourceName: updatedOrder.orderNumber,
          outcome: "SUCCESS",
          metadata: {
            previousStatus: order.status,
            newStatus: updatedOrder.status,
            tableName: updatedOrder.table?.name,
          },
          req,
        }),
      ]);

      for (const res of hookResults) {
        if (res.status === "rejected") {
          console.error("Order status side-effect hook failed:", res.reason);
        }
      }

      return NextResponse.json({ order: updatedOrder });
    }

    // Return refreshed order with updated payment status
    const refreshedOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        table: true,
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        items: {
          include: {
            selectedVariant: true,
            selectedAddons: true
          }
        }
      }
    });

    return NextResponse.json({ order: refreshedOrder });
  } catch (error) {
    console.error("PATCH /api/v1/orders/admin/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
