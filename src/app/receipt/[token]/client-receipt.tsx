"use client";

import { useState } from "react";
import {
  Printer,
  Copy,
  Check,
  Share2,
  Receipt,
  Building2,
  Calendar,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Mail,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

interface ClientReceiptProps {
  receiptData: {
    id: string;
    receiptNumber: string;
    receiptToken: string;
    issueDate: string | Date;
    paymentStatus: string;
    paymentMethod: string | null;
    currency: string;
    isTaxInvoice: boolean;
    snapshot: {
      receiptNumber: string;
      issueDate: string | Date;
      currency: string;
      isTaxInvoice: boolean;
      restaurant: {
        name: string;
        address: string | null;
        city: string | null;
        state: string | null;
        country: string | null;
        phone: string | null;
        email: string | null;
        gstNumber: string | null;
        taxPercentage: number | null;
        accentColor: string | null;
      };
      table: {
        name: string;
        number: string | null;
      };
      customer: {
        name: string;
        maskedPhone: string;
        maskedEmail: string;
      } | null;
      order: {
        orderNumber: string;
        specialInstructions: string | null;
        createdAt: string;
      };
      items: Array<{
        id: string;
        name: string;
        price: number;
        quantity: number;
        lineTotal: number;
        specialInstructions: string | null;
        selectedVariant: { name: string; price: number } | null;
        selectedAddons: Array<{ name: string; price: number }>;
      }>;
      financials: {
        subtotal: number;
        discountAmount: number;
        promotionCode: string | null;
        loyaltyDiscount: number;
        taxableAmount: number;
        taxPercentage: number;
        taxAmount: number;
        finalTotal: number;
      };
      payment: {
        provider: string;
        paymentMethod: string;
        status: string;
        transactionId: string | null;
        paidAt: string | null;
      };
    };
    refundDetails?: {
      refundedAt: string | Date;
      reason: string;
      amount: number;
    } | null;
    deliveryLogs?: Array<{
      id: string;
      channel: string;
      recipient: string;
      status: string;
      createdAt: string | Date;
    }>;
  };
}

export function ClientReceiptView({ receiptData }: ClientReceiptProps) {
  const [copied, setCopied] = useState(false);
  const { snapshot, paymentStatus, isTaxInvoice, refundDetails, deliveryLogs } = receiptData;
  const { restaurant, table, customer, order, items, financials, payment } = snapshot;

  const fmtCurrency = (val: number) => {
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: receiptData.currency || "USD",
      }).format(val);
    } catch {
      return `${receiptData.currency} ${val.toFixed(2)}`;
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const formattedDate = format(new Date(snapshot.issueDate), "MMMM d, yyyy h:mm a");

  return (
    <div className="min-h-screen bg-stone-100 dark:bg-stone-950 py-8 px-4 sm:px-6">
      {/* Top Action Bar (Hidden in Print) */}
      <div className="max-w-2xl mx-auto mb-6 print:hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-stone-900 p-4 rounded-2xl shadow-xs border border-stone-200 dark:border-stone-800">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-600" />
            <span className="font-bold text-sm text-stone-900 dark:text-stone-100">
              Verified Digital Receipt
            </span>
            <span
              className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                paymentStatus === "PAID"
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
              }`}
            >
              {paymentStatus}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="gap-1.5 text-xs h-9 cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" /> Share Link
                </>
              )}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 text-xs h-9 cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print Receipt
            </Button>
          </div>
        </div>
      </div>

      {/* Main Receipt Paper Card */}
      <div
        id="printable-receipt"
        className="max-w-2xl mx-auto bg-white dark:bg-stone-900 rounded-3xl shadow-lg border border-stone-200 dark:border-stone-800 overflow-hidden print:shadow-none print:border-none print:m-0 print:p-0 print:w-full"
      >
        {/* Receipt Header Banner */}
        <div
          className="p-8 text-center border-b border-stone-200 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-900/50"
          style={{
            borderTop: restaurant.accentColor
              ? `6px solid ${restaurant.accentColor}`
              : "6px solid #10b981",
          }}
        >
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-stone-100 tracking-tight">
            {restaurant.name}
          </h1>

          <div className="mt-2 text-xs text-stone-500 dark:text-stone-400 space-y-0.5">
            {restaurant.address && (
              <p>
                {restaurant.address}
                {restaurant.city ? `, ${restaurant.city}` : ""}
                {restaurant.state ? `, ${restaurant.state}` : ""}
                {restaurant.country ? `, ${restaurant.country}` : ""}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1">
              {restaurant.phone && <span>Tel: {restaurant.phone}</span>}
              {restaurant.email && <span>Email: {restaurant.email}</span>}
            </div>
            {isTaxInvoice && restaurant.gstNumber && (
              <p className="pt-1.5 font-mono text-stone-700 dark:text-stone-300 font-bold">
                Tax/GST ID: {restaurant.gstNumber}
              </p>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-dashed border-stone-200 dark:border-stone-800 flex items-center justify-center gap-2">
            <span className="text-xs uppercase tracking-widest font-extrabold text-stone-600 dark:text-stone-400">
              {isTaxInvoice ? "OFFICIAL TAX INVOICE" : "CUSTOMER RECEIPT"}
            </span>
          </div>
        </div>

        {/* Refund Banner if Refunded */}
        {paymentStatus === "REFUNDED" && refundDetails && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900/50 p-4 text-center">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
              Order Refunded
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              Amount: <span className="font-bold">{fmtCurrency(refundDetails.amount)}</span> &bull;{" "}
              Reason: {refundDetails.reason} &bull;{" "}
              {format(new Date(refundDetails.refundedAt), "MMM d, yyyy")}
            </p>
          </div>
        )}

        {/* Order Meta Bar */}
        <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs border-b border-stone-100 dark:border-stone-800/60 bg-stone-50/30 dark:bg-stone-900/30">
          <div>
            <p className="text-stone-400 dark:text-stone-500 font-semibold uppercase text-[10px]">
              Receipt Number
            </p>
            <p className="font-mono font-bold text-stone-900 dark:text-stone-100 mt-0.5">
              {snapshot.receiptNumber}
            </p>
          </div>

          <div>
            <p className="text-stone-400 dark:text-stone-500 font-semibold uppercase text-[10px]">
              Order Number
            </p>
            <p className="font-mono font-bold text-stone-900 dark:text-stone-100 mt-0.5">
              #{order.orderNumber}
            </p>
          </div>

          <div>
            <p className="text-stone-400 dark:text-stone-500 font-semibold uppercase text-[10px]">
              Table / Location
            </p>
            <p className="font-bold text-stone-900 dark:text-stone-100 mt-0.5">
              {table.name}
            </p>
          </div>

          <div>
            <p className="text-stone-400 dark:text-stone-500 font-semibold uppercase text-[10px]">
              Date & Time
            </p>
            <p className="font-medium text-stone-900 dark:text-stone-100 mt-0.5">
              {formattedDate}
            </p>
          </div>
        </div>

        {/* Customer Info (if present) */}
        {customer && (
          <div className="px-6 py-3 border-b border-stone-100 dark:border-stone-800/60 text-xs flex flex-wrap items-center justify-between text-stone-600 dark:text-stone-400">
            <span>
              Billed To: <strong className="text-stone-900 dark:text-stone-100">{customer.name}</strong>
            </span>
            <span className="font-mono text-[11px]">
              {customer.maskedPhone !== "—" ? customer.maskedPhone : customer.maskedEmail}
            </span>
          </div>
        )}

        {/* Itemized Line Items */}
        <div className="p-6">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 dark:border-stone-800 text-[10px] uppercase font-bold text-stone-400 dark:text-stone-500">
                <th className="pb-2.5">Item Description</th>
                <th className="pb-2.5 text-center w-12">Qty</th>
                <th className="pb-2.5 text-right w-20">Price</th>
                <th className="pb-2.5 text-right w-24">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-stone-800/60">
              {items.map((item) => (
                <tr key={item.id} className="align-top">
                  <td className="py-3">
                    <p className="font-bold text-stone-900 dark:text-stone-100 text-sm">
                      {item.name}
                    </p>
                    {item.selectedVariant && (
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        Variant: {item.selectedVariant.name}
                      </p>
                    )}
                    {item.selectedAddons?.length > 0 && (
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        Add-ons: {item.selectedAddons.map((a) => a.name).join(", ")}
                      </p>
                    )}
                    {item.specialInstructions && (
                      <p className="text-[11px] text-stone-400 dark:text-stone-500 italic mt-0.5">
                        Note: &ldquo;{item.specialInstructions}&rdquo;
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-center font-bold text-stone-700 dark:text-stone-300">
                    {item.quantity}
                  </td>
                  <td className="py-3 text-right text-stone-600 dark:text-stone-400">
                    {fmtCurrency(item.price)}
                  </td>
                  <td className="py-3 text-right font-extrabold text-stone-900 dark:text-stone-100">
                    {fmtCurrency(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Subtotal & Calculations */}
          <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-800 flex justify-end">
            <div className="w-full sm:w-72 space-y-2 text-xs">
              <div className="flex justify-between text-stone-600 dark:text-stone-400">
                <span>Subtotal</span>
                <span className="font-semibold text-stone-900 dark:text-stone-100">
                  {fmtCurrency(financials.subtotal)}
                </span>
              </div>

              {financials.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>
                    Discount {financials.promotionCode ? `(${financials.promotionCode})` : ""}
                  </span>
                  <span className="font-semibold">-{fmtCurrency(financials.discountAmount)}</span>
                </div>
              )}

              {financials.taxAmount > 0 && (
                <div className="flex justify-between text-stone-600 dark:text-stone-400">
                  <span>
                    Tax {financials.taxPercentage ? `(${financials.taxPercentage}%)` : ""}
                  </span>
                  <span className="font-semibold text-stone-900 dark:text-stone-100">
                    {fmtCurrency(financials.taxAmount)}
                  </span>
                </div>
              )}

              <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex justify-between items-baseline">
                <span className="text-sm font-extrabold text-stone-900 dark:text-stone-100">
                  Total Paid
                </span>
                <span className="text-xl font-black text-stone-900 dark:text-stone-100">
                  {fmtCurrency(financials.finalTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Summary Footer */}
        <div className="p-6 bg-stone-50 dark:bg-stone-900/60 border-t border-stone-200 dark:border-stone-800 text-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-stone-400" />
                <span className="font-bold text-stone-900 dark:text-stone-100">
                  Payment Method: {payment.paymentMethod}
                </span>
              </div>
              {payment.transactionId && (
                <p className="text-[11px] font-mono text-stone-500">
                  Ref / Txn ID: {payment.transactionId}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
              <span>Verified Payment Settled</span>
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="p-6 text-center text-xs text-stone-400 dark:text-stone-500 border-t border-stone-100 dark:border-stone-800/40">
          <p className="font-medium text-stone-600 dark:text-stone-400">
            Thank you for dining with us!
          </p>
          <p className="mt-1 text-[10px]">
            This digital receipt is an immutable proof of purchase issued on behalf of{" "}
            {restaurant.name}.
          </p>
        </div>
      </div>

      {/* Delivery Logs Summary (for Customer reference, hidden in print) */}
      {deliveryLogs && deliveryLogs.length > 0 && (
        <div className="max-w-2xl mx-auto mt-6 print:hidden">
          <div className="bg-white dark:bg-stone-900 rounded-2xl p-4 border border-stone-200 dark:border-stone-800 text-xs">
            <p className="font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider text-[10px] mb-2">
              Receipt Delivery Activity
            </p>
            <div className="space-y-2">
              {deliveryLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between py-1 text-stone-500 dark:text-stone-400"
                >
                  <div className="flex items-center gap-2">
                    {log.channel === "EMAIL" ? (
                      <Mail className="w-3.5 h-3.5" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {log.channel} to {log.recipient}
                    </span>
                  </div>
                  <span
                    className={`font-semibold text-[10px] px-2 py-0.5 rounded-full ${
                      log.status === "SENT" || log.status === "DELIVERED"
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : log.status === "NOT_CONFIGURED"
                        ? "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                    }`}
                  >
                    {log.status === "NOT_CONFIGURED" ? "Not Enabled" : log.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
