"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Receipt,
  Search,
  Filter,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  Printer,
  Send,
  Mail,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Clock,
  Calendar,
  X,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Loader2,
  Check,
  FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { format, formatDistanceToNow } from "date-fns";

interface ReceiptSummary {
  id: string;
  receiptNumber: string;
  receiptToken: string;
  orderId: string;
  orderNumber: string;
  tableName: string;
  customerId: string | null;
  customerName: string;
  customerContact: string;
  isContactMasked: boolean;
  currency: string;
  subtotal: number;
  discountAmount: number;
  tax: number;
  finalTotal: number;
  paymentMethod: string | null;
  paymentStatus: string;
  isTaxInvoice: boolean;
  issueDate: string;
  createdAt: string;
  deliveryLogs: Array<{
    id: string;
    channel: string;
    recipient: string;
    status: string;
    createdAt: string;
  }>;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ClientReceiptsProps {
  restaurantName: string;
  currency: string;
  currentRole: string;
}

export function ClientReceiptsLedger({
  restaurantName,
  currency,
  currentRole,
}: ClientReceiptsProps) {
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PAID" | "REFUNDED">("ALL");
  const [channelFilter, setChannelFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"recent" | "total" | "receiptNumber">("recent");

  // Detail Modal State
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [receiptDetail, setReceiptDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Resend Action State
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  const fmtCurrency = (val: number) => {
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(val);
    } catch {
      return `${currency} ${val.toFixed(2)}`;
    }
  };

  const fetchReceipts = useCallback(
    async (page = 1) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: "10",
          sortBy,
          status: statusFilter,
          channel: channelFilter,
        });
        if (search.trim()) params.append("search", search.trim());

        const res = await fetch(`/api/v1/receipts?${params.toString()}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to load digital receipts");
        }
        const data = await res.json();
        setReceipts(data.receipts || []);
        setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error fetching receipts");
      } finally {
        setLoading(false);
      }
    },
    [search, statusFilter, channelFilter, sortBy]
  );

  useEffect(() => {
    fetchReceipts(1);
  }, [fetchReceipts]);

  const fetchReceiptDetail = async (id: string) => {
    setSelectedReceiptId(id);
    setDetailLoading(true);
    setResendSuccess(null);
    setResendError(null);
    try {
      const res = await fetch(`/api/v1/receipts/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load receipt details");
      }
      const data = await res.json();
      setReceiptDetail(data.receipt);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error loading receipt detail");
      setSelectedReceiptId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleResend = async (channel: "EMAIL" | "WHATSAPP") => {
    if (!selectedReceiptId) return;
    setResendLoading(true);
    setResendSuccess(null);
    setResendError(null);
    try {
      const res = await fetch(`/api/v1/receipts/${selectedReceiptId}/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to resend receipt");
      }
      setResendSuccess(`Receipt dispatched via ${channel} to ${data.recipient || "customer"}`);
      // Refresh detail logs
      fetchReceiptDetail(selectedReceiptId);
    } catch (err: unknown) {
      setResendError(err instanceof Error ? err.message : "Error resending receipt");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Digital Receipts
            </h1>
            <span className="text-xs bg-primary/10 text-primary font-bold px-2.5 py-0.5 rounded-full border border-primary/20">
              {pagination.total} Issued
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Immutable customer digital receipts, delivery audit logs, and public verification for{" "}
            <span className="font-semibold text-foreground">{restaurantName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchReceipts(pagination.page)}
            disabled={loading}
            className="gap-2 text-xs h-9 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 border-border/80 shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search receipt #, order #, or customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-lg border border-border bg-surface-muted/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs py-2 px-3 rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="PAID">Paid Only</option>
              <option value="REFUNDED">Refunded</option>
            </select>

            {/* Channel Filter */}
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="text-xs py-2 px-3 rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="ALL">All Channels</option>
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="IN_APP">In-App</option>
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs py-2 px-3 rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
            >
              <option value="recent">Sort: Most Recent</option>
              <option value="total">Sort: Highest Total</option>
              <option value="receiptNumber">Sort: Receipt Number</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Receipts Ledger List */}
      <Card className="border-border/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center space-y-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs text-muted-foreground">Loading digital receipts ledger...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
            <p className="text-sm font-semibold text-destructive">{error}</p>
            <Button size="sm" variant="outline" onClick={() => fetchReceipts(pagination.page)}>
              Try Again
            </Button>
          </div>
        ) : receipts.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Receipt className="w-6 h-6" />
            </div>
            <p className="font-bold text-foreground text-sm">No Digital Receipts Found</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Receipts are issued automatically upon verified customer payment completion.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface-muted/40 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                    <th className="py-3 px-4">Receipt #</th>
                    <th className="py-3 px-4">Order / Table</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4">Delivery</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {receipts.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-surface-muted/30 transition cursor-pointer"
                      onClick={() => fetchReceiptDetail(r.id)}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-foreground">
                            {r.receiptNumber}
                          </span>
                          {r.isTaxInvoice && (
                            <span className="text-[9px] bg-purple-500/10 text-purple-700 dark:text-purple-300 font-bold px-1.5 py-0.2 rounded">
                              TAX
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <p className="font-bold text-foreground">#{r.orderNumber}</p>
                        <p className="text-[10px] text-muted-foreground">{r.tableName}</p>
                      </td>

                      <td className="py-3 px-4">
                        <p className="font-semibold text-foreground">{r.customerName}</p>
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {r.customerContact}
                        </p>
                      </td>

                      <td className="py-3 px-4">
                        <p className="font-extrabold text-foreground">{fmtCurrency(r.finalTotal)}</p>
                        {r.discountAmount > 0 && (
                          <p className="text-[10px] text-emerald-600 font-medium">
                            Saved {fmtCurrency(r.discountAmount)}
                          </p>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            r.paymentStatus === "PAID"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {r.paymentStatus}
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {r.paymentMethod || "CASH"}
                        </p>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1">
                          {r.deliveryLogs.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">Unsent</span>
                          ) : (
                            r.deliveryLogs.map((log) => (
                              <span
                                key={log.id}
                                title={`${log.channel}: ${log.status}`}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
                                  log.status === "SENT" || log.status === "DELIVERED"
                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                    : log.status === "NOT_CONFIGURED"
                                    ? "bg-stone-500/10 text-stone-600 dark:text-stone-400"
                                    : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                }`}
                              >
                                {log.channel === "EMAIL" ? "Email" : log.channel === "WHATSAPP" ? "WA" : "App"}
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-muted-foreground">
                        {format(new Date(r.issueDate), "MMM d, h:mm a")}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`/receipt/${r.receiptToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 hover:bg-surface-muted rounded text-muted-foreground hover:text-foreground transition"
                            title="Open Customer Public View"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-2 cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              fetchReceiptDetail(r.id);
                            }}
                          >
                            Details
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View */}
            <div className="md:hidden divide-y divide-border">
              {receipts.map((r) => (
                <div
                  key={r.id}
                  onClick={() => fetchReceiptDetail(r.id)}
                  className="p-4 space-y-2 hover:bg-surface-muted/20 active:bg-surface-muted/30 transition cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-foreground text-sm">
                          {r.receiptNumber}
                        </span>
                        {r.isTaxInvoice && (
                          <span className="text-[9px] bg-purple-500/10 text-purple-700 font-bold px-1.5 py-0.2 rounded">
                            TAX
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Order #{r.orderNumber} &bull; {r.tableName}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-extrabold text-foreground text-sm">
                        {fmtCurrency(r.finalTotal)}
                      </p>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          r.paymentStatus === "PAID"
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-amber-500/10 text-amber-700"
                        }`}
                      >
                        {r.paymentStatus}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40">
                    <span>{r.customerName}</span>
                    <span>{format(new Date(r.issueDate), "MMM d, h:mm a")}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Controls */}
            <div className="px-4 py-3 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3 bg-surface-muted/30 text-xs text-muted-foreground">
              <div>
                Showing page <span className="font-bold text-foreground">{pagination.page}</span> of{" "}
                <span className="font-bold text-foreground">{pagination.totalPages}</span> (
                {pagination.total} receipts)
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs cursor-pointer"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => fetchReceipts(pagination.page - 1)}
                >
                  <ChevronLeft className="w-3.5 h-3.5 mr-1" /> Previous
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs cursor-pointer"
                  disabled={pagination.page >= pagination.totalPages || loading}
                  onClick={() => fetchReceipts(pagination.page + 1)}
                >
                  Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* Receipt Detail Drawer / Modal */}
      {selectedReceiptId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-surface h-full shadow-2xl flex flex-col border-l border-border overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-surface sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-base text-foreground leading-tight">
                      {receiptDetail?.receiptNumber || "Digital Receipt"}
                    </h2>
                    {receiptDetail?.isTaxInvoice && (
                      <span className="text-[10px] bg-purple-500/10 text-purple-700 font-bold px-1.5 py-0.5 rounded">
                        TAX INVOICE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Order #{receiptDetail?.orderNumber} &bull; {receiptDetail?.tableName}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedReceiptId(null);
                  setReceiptDetail(null);
                }}
                className="w-8 h-8 rounded-lg hover:bg-surface-muted flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {detailLoading ? (
                <div className="py-24 text-center flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading receipt snapshot...</p>
                </div>
              ) : receiptDetail ? (
                <>
                  {/* Resend Action Bar */}
                  <div className="bg-surface-muted/40 p-3.5 rounded-xl border border-border space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                        Quick Delivery Dispatch
                      </span>
                      <a
                        href={`/receipt/${receiptDetail.receiptToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
                      >
                        Public Link <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resendLoading}
                        onClick={() => handleResend("EMAIL")}
                        className="gap-1.5 text-xs h-8 flex-1 cursor-pointer"
                      >
                        <Mail className="w-3.5 h-3.5 text-blue-600" /> Resend Email
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={resendLoading}
                        onClick={() => handleResend("WHATSAPP")}
                        className="gap-1.5 text-xs h-8 flex-1 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-600" /> Resend WhatsApp
                      </Button>
                    </div>

                    {resendSuccess && (
                      <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1 pt-1">
                        <Check className="w-3.5 h-3.5" /> {resendSuccess}
                      </p>
                    )}
                    {resendError && (
                      <p className="text-[11px] text-destructive font-semibold flex items-center gap-1 pt-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {resendError}
                      </p>
                    )}
                  </div>

                  {/* Financial & Items Snapshot */}
                  <div className="bg-surface rounded-xl border border-border p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <span className="text-xs font-bold text-muted-foreground uppercase">
                        Line Items ({receiptDetail.snapshot?.items?.length || 0})
                      </span>
                      <span className="text-xs font-mono font-bold text-foreground">
                        Total: {fmtCurrency(receiptDetail.finalTotal)}
                      </span>
                    </div>

                    <div className="space-y-2 divide-y divide-border/40">
                      {(receiptDetail.snapshot?.items || []).map((item: any, idx: number) => (
                        <div key={idx} className="pt-2 first:pt-0 flex justify-between text-xs">
                          <div>
                            <p className="font-semibold text-foreground">
                              {item.quantity}x {item.name}
                            </p>
                            {item.selectedVariant && (
                              <p className="text-[10px] text-muted-foreground">
                                {item.selectedVariant.name}
                              </p>
                            )}
                            {item.selectedAddons?.length > 0 && (
                              <p className="text-[10px] text-muted-foreground">
                                +{item.selectedAddons.map((a: any) => a.name).join(", ")}
                              </p>
                            )}
                          </div>
                          <p className="font-extrabold text-foreground">
                            {fmtCurrency(item.lineTotal)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Financial Totals */}
                    <div className="pt-3 border-t border-border space-y-1 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal</span>
                        <span>{fmtCurrency(receiptDetail.subtotal)}</span>
                      </div>
                      {receiptDetail.discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-600 font-semibold">
                          <span>Discount</span>
                          <span>-{fmtCurrency(receiptDetail.discountAmount)}</span>
                        </div>
                      )}
                      {receiptDetail.tax > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>
                            Tax {receiptDetail.appliedTaxPercentage ? `(${receiptDetail.appliedTaxPercentage}%)` : ""}
                          </span>
                          <span>{fmtCurrency(receiptDetail.tax)}</span>
                        </div>
                      )}
                      <div className="pt-1.5 border-t border-border flex justify-between font-extrabold text-foreground text-sm">
                        <span>Final Total</span>
                        <span>{fmtCurrency(receiptDetail.finalTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Delivery History Audit Logs */}
                  <div className="bg-surface rounded-xl border border-border p-4 space-y-3 shadow-2xs">
                    <span className="text-xs font-bold text-muted-foreground uppercase">
                      Delivery History ({receiptDetail.deliveryLogs?.length || 0})
                    </span>

                    {receiptDetail.deliveryLogs?.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No delivery attempts logged yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {receiptDetail.deliveryLogs.map((log: any) => (
                          <div
                            key={log.id}
                            className="p-2.5 bg-surface-muted/30 rounded-lg text-xs space-y-1 border border-border/50"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-foreground">
                                {log.channel} to {log.recipient}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                  log.status === "SENT" || log.status === "DELIVERED"
                                    ? "bg-emerald-500/10 text-emerald-700"
                                    : log.status === "NOT_CONFIGURED"
                                    ? "bg-stone-500/10 text-stone-600"
                                    : "bg-destructive/10 text-destructive"
                                }`}
                              >
                                {log.status}
                              </span>
                            </div>
                            {log.errorMessage && (
                              <p className="text-[10px] text-destructive">{log.errorMessage}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(log.createdAt), "MMM d, yyyy h:mm:ss a")}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
