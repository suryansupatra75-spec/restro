"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Gift,
  Coins,
  Award,
  Users,
  Settings,
  ListOrdered,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  Sliders,
  DollarSign,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Tag,
  Shield,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

interface ClientLoyaltyManagerProps {
  restaurantId: string;
  restaurantName: string;
  currency: string;
  canManage: boolean;
  canAdjust: boolean;
  currentRole: string;
}

interface LoyaltyProgramData {
  isEnabled: boolean;
  pointsPerCurrencyUnit: number;
  minOrderSubtotalForEarning: number;
  redemptionRate: number;
  minRedemptionPoints: number;
  redemptionStepPoints: number;
  maxBillPercentagePayable: number;
  pointsExpiryDays: number | null;
  eligibleOrderState: string;
}

interface LoyaltyRewardItem {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  rewardType: string;
  discountType: string;
  discountValue: number;
  freeMenuItemId: string | null;
  freeMenuItem?: { id: string; name: string; price: number } | null;
  minOrderSubtotal: number;
  maxRedemptionsTotal: number | null;
  currentRedemptions: number;
  maxRedemptionsPerCustomer: number | null;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

interface LedgerEntryItem {
  id: string;
  type: string;
  points: number;
  balanceAfter: number;
  reason: string;
  actorType: string;
  createdAt: string;
  customer?: { id: string; name: string; phone: string | null; email: string | null } | null;
  order?: { id: string; orderNumber: string; total: number } | null;
  reward?: { id: string; name: string } | null;
}

interface LedgerMetrics {
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalOutstandingPoints: number;
  estimatedLiability: number;
  activeMembers: number;
  programEnabled: boolean;
}

export function ClientLoyaltyManager({
  restaurantId,
  restaurantName,
  currency,
  canManage,
  canAdjust,
  currentRole,
}: ClientLoyaltyManagerProps) {
  const [activeTab, setActiveTab] = useState<"settings" | "rewards" | "ledger" | "adjust">("settings");

  // Program Settings State
  const [program, setProgram] = useState<LoyaltyProgramData | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [programSaving, setProgramSaving] = useState(false);
  const [programSuccess, setProgramSuccess] = useState<string | null>(null);
  const [programError, setProgramError] = useState<string | null>(null);

  // Rewards State
  const [rewards, setRewards] = useState<LoyaltyRewardItem[]>([]);
  const [rewardsLoading, setRewardsLoading] = useState(false);
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [rewardSaving, setRewardSaving] = useState(false);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [rewardForm, setRewardForm] = useState({
    name: "",
    description: "",
    pointsCost: 100,
    rewardType: "DISCOUNT",
    discountType: "FIXED",
    discountValue: 5,
    minOrderSubtotal: 0,
    maxRedemptionsTotal: "",
    isActive: true,
  });

  // Ledger State
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryItem[]>([]);
  const [ledgerMetrics, setLedgerMetrics] = useState<LedgerMetrics | null>(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1);
  const [ledgerFilterType, setLedgerFilterType] = useState<string>("");

  // Adjustment State
  const [adjustCustomerId, setAdjustCustomerId] = useState("");
  const [adjustPoints, setAdjustPoints] = useState<number | "">("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Fetch Program
  const fetchProgram = useCallback(async () => {
    try {
      setProgramLoading(true);
      const res = await fetch(`/api/v1/loyalty/program?restaurantId=${restaurantId}`);
      if (!res.ok) throw new Error("Failed to load loyalty program");
      const data = await res.json();
      setProgram({
        isEnabled: data.program.isEnabled,
        pointsPerCurrencyUnit: Number(data.program.pointsPerCurrencyUnit),
        minOrderSubtotalForEarning: Number(data.program.minOrderSubtotalForEarning),
        redemptionRate: Number(data.program.redemptionRate),
        minRedemptionPoints: data.program.minRedemptionPoints,
        redemptionStepPoints: data.program.redemptionStepPoints,
        maxBillPercentagePayable: data.program.maxBillPercentagePayable,
        pointsExpiryDays: data.program.pointsExpiryDays,
        eligibleOrderState: data.program.eligibleOrderState,
      });
    } catch (err: unknown) {
      setProgramError(err instanceof Error ? err.message : "Error loading program");
    } finally {
      setProgramLoading(false);
    }
  }, [restaurantId]);

  // Fetch Rewards
  const fetchRewards = useCallback(async () => {
    try {
      setRewardsLoading(true);
      const res = await fetch(`/api/v1/loyalty/rewards?restaurantId=${restaurantId}`);
      if (!res.ok) throw new Error("Failed to load rewards");
      const data = await res.json();
      setRewards(data.rewards || []);
    } catch {
      // Ignore
    } finally {
      setRewardsLoading(false);
    }
  }, [restaurantId]);

  // Fetch Ledger
  const fetchLedger = useCallback(async () => {
    try {
      setLedgerLoading(true);
      const query = new URLSearchParams({
        restaurantId,
        page: String(ledgerPage),
        limit: "15",
        ...(ledgerFilterType ? { type: ledgerFilterType } : {}),
      });
      const res = await fetch(`/api/v1/loyalty/ledger?${query.toString()}`);
      if (!res.ok) throw new Error("Failed to load loyalty ledger");
      const data = await res.json();
      setLedgerEntries(data.entries || []);
      setLedgerTotalPages(data.pagination.totalPages || 1);
      setLedgerMetrics(data.metrics || null);
    } catch {
      // Ignore
    } finally {
      setLedgerLoading(false);
    }
  }, [restaurantId, ledgerPage, ledgerFilterType]);

  useEffect(() => {
    fetchProgram();
    fetchLedger();
  }, [fetchProgram, fetchLedger]);

  useEffect(() => {
    if (activeTab === "rewards") {
      fetchRewards();
    } else if (activeTab === "ledger") {
      fetchLedger();
    }
  }, [activeTab, fetchRewards, fetchLedger]);

  // Handle Save Program Settings
  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!program || !canManage) return;

    setProgramSaving(true);
    setProgramSuccess(null);
    setProgramError(null);

    try {
      const res = await fetch(`/api/v1/loyalty/program?restaurantId=${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(program),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update program settings");

      setProgramSuccess("Loyalty program settings saved successfully.");
      setTimeout(() => setProgramSuccess(null), 4000);
      fetchLedger();
    } catch (err: unknown) {
      setProgramError(err instanceof Error ? err.message : "Error saving settings");
    } finally {
      setProgramSaving(false);
    }
  };

  // Handle Create Reward
  const handleCreateReward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setRewardSaving(true);
    setRewardError(null);

    try {
      const payload = {
        name: rewardForm.name.trim(),
        description: rewardForm.description.trim() || undefined,
        pointsCost: Number(rewardForm.pointsCost),
        rewardType: rewardForm.rewardType,
        discountType: rewardForm.discountType,
        discountValue: Number(rewardForm.discountValue),
        minOrderSubtotal: Number(rewardForm.minOrderSubtotal),
        maxRedemptionsTotal: rewardForm.maxRedemptionsTotal ? parseInt(rewardForm.maxRedemptionsTotal, 10) : undefined,
        isActive: rewardForm.isActive,
      };

      const res = await fetch(`/api/v1/loyalty/rewards?restaurantId=${restaurantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create reward");

      setIsRewardModalOpen(false);
      setRewardForm({
        name: "",
        description: "",
        pointsCost: 100,
        rewardType: "DISCOUNT",
        discountType: "FIXED",
        discountValue: 5,
        minOrderSubtotal: 0,
        maxRedemptionsTotal: "",
        isActive: true,
      });
      fetchRewards();
    } catch (err: unknown) {
      setRewardError(err instanceof Error ? err.message : "Error saving reward");
    } finally {
      setRewardSaving(false);
    }
  };

  // Handle Toggle Reward Active
  const handleToggleRewardActive = async (reward: LoyaltyRewardItem) => {
    if (!canManage) return;

    try {
      await fetch(`/api/v1/loyalty/rewards/${reward.id}?restaurantId=${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !reward.isActive }),
      });
      fetchRewards();
    } catch {
      // Ignore
    }
  };

  // Handle Submit Adjustment
  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canAdjust) return;

    if (!adjustCustomerId.trim() || adjustPoints === "" || !adjustReason.trim()) {
      setAdjustError("Please complete all required fields.");
      return;
    }

    setAdjustSubmitting(true);
    setAdjustSuccess(null);
    setAdjustError(null);

    try {
      const res = await fetch(`/api/v1/loyalty/adjust?restaurantId=${restaurantId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: adjustCustomerId.trim(),
          points: Number(adjustPoints),
          reason: adjustReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to apply adjustment");

      setAdjustSuccess(`Points successfully adjusted! New balance: ${data.account.pointsBalance} pts`);
      setAdjustCustomerId("");
      setAdjustPoints("");
      setAdjustReason("");
      fetchLedger();
    } catch (err: unknown) {
      setAdjustError(err instanceof Error ? err.message : "Error adjusting points");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Gift className="w-6 h-6 text-primary" />
            Loyalty & Customer Retention
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage points earning rules, rewards catalogue, and customer ledger for {restaurantName}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {program && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                program.isEnabled
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${program.isEnabled ? "bg-emerald-500" : "bg-amber-500"}`} />
              {program.isEnabled ? "Program Active" : "Program Disabled"}
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchProgram();
              fetchLedger();
              if (activeTab === "rewards") fetchRewards();
            }}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      {ledgerMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border shadow-xs">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Points Issued</p>
                <p className="text-lg font-bold text-foreground">
                  {ledgerMetrics.totalPointsIssued.toLocaleString()} pts
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-xs">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary">
                <ArrowDownRight className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Total Redeemed</p>
                <p className="text-lg font-bold text-foreground">
                  {ledgerMetrics.totalPointsRedeemed.toLocaleString()} pts
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-xs">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-600">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Outstanding Liability</p>
                <p className="text-lg font-bold text-foreground">
                  ${ledgerMetrics.estimatedLiability.toFixed(2)} ({ledgerMetrics.totalOutstandingPoints.toLocaleString()} pts)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border shadow-xs">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Active Members</p>
                <p className="text-lg font-bold text-foreground">
                  {ledgerMetrics.activeMembers.toLocaleString()} diners
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-border flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "settings"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <Settings className="w-4 h-4" /> Program Configuration
        </button>

        <button
          onClick={() => setActiveTab("rewards")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "rewards"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <Award className="w-4 h-4" /> Rewards Catalogue
          {rewards.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
              {rewards.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("ledger")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "ledger"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
          }`}
        >
          <ListOrdered className="w-4 h-4" /> Points Ledger
        </button>

        {canAdjust && (
          <button
            onClick={() => setActiveTab("adjust")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "adjust"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Sliders className="w-4 h-4" /> Manual Adjustment
          </button>
        )}
      </div>

      {/* TAB 1: PROGRAM CONFIGURATION */}
      {activeTab === "settings" && (
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="text-lg">Loyalty Program Settings</CardTitle>
            <CardDescription>
              Configure earning rates, redemption value, and spending limits for food orders.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {programLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading program settings...
              </div>
            ) : program ? (
              <form onSubmit={handleSaveProgram} className="space-y-6">
                {programSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> {programSuccess}
                  </div>
                )}
                {programError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> {programError}
                  </div>
                )}

                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/30">
                  <div>
                    <h3 className="font-semibold text-foreground text-sm">Enable Loyalty Program</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      When enabled, diners earn points on completed orders and can redeem points at checkout.
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={program.isEnabled}
                      onChange={(e) => setProgram({ ...program, isEnabled: e.target.checked })}
                      disabled={!canManage}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-muted peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Points Earning Rate */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Points Earning Rate (Points per 1 {currency})
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.01"
                      max="1000"
                      value={program.pointsPerCurrencyUnit}
                      onChange={(e) =>
                        setProgram({ ...program, pointsPerCurrencyUnit: parseFloat(e.target.value) || 0 })
                      }
                      disabled={!canManage}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground">
                      e.g., 1.0 means customer earns 1 point for every $1 / INR 1 spent on food.
                    </p>
                  </div>

                  {/* Min Subtotal to Earn */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Min Order Subtotal to Earn Points ({currency})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={program.minOrderSubtotalForEarning}
                      onChange={(e) =>
                        setProgram({ ...program, minOrderSubtotalForEarning: parseFloat(e.target.value) || 0 })
                      }
                      disabled={!canManage}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground">
                      Orders below this subtotal will not award loyalty points.
                    </p>
                  </div>

                  {/* Redemption Rate */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Redemption Value ({currency} per 1 Point)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.0001"
                      value={program.redemptionRate}
                      onChange={(e) => setProgram({ ...program, redemptionRate: parseFloat(e.target.value) || 0 })}
                      disabled={!canManage}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground">
                      e.g. 0.05 means 100 points = $5.00 discount on the bill.
                    </p>
                  </div>

                  {/* Min Redemption Points */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Minimum Redemption Balance (Points)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={program.minRedemptionPoints}
                      onChange={(e) =>
                        setProgram({ ...program, minRedemptionPoints: parseInt(e.target.value, 10) || 0 })
                      }
                      disabled={!canManage}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground">
                      Customer must have at least this many points to redeem at checkout.
                    </p>
                  </div>

                  {/* Max Bill Percentage Payable */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Max Bill Payable via Points (%)
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="100"
                      value={program.maxBillPercentagePayable}
                      onChange={(e) =>
                        setProgram({ ...program, maxBillPercentagePayable: parseInt(e.target.value, 10) || 0 })
                      }
                      disabled={!canManage}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-xs text-muted-foreground">
                      Prevents 100% free orders if desired (e.g. 50% max of order subtotal).
                    </p>
                  </div>

                  {/* Eligible Order State */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Points Award Trigger State
                    </label>
                    <select
                      value={program.eligibleOrderState}
                      onChange={(e) => setProgram({ ...program, eligibleOrderState: e.target.value })}
                      disabled={!canManage}
                      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="COMPLETED">When Order is Marked COMPLETED (Recommended)</option>
                      <option value="READY">When Order is Marked READY</option>
                      <option value="PAID">When Payment is Marked PAID</option>
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Points are issued automatically once the order enters this state.
                    </p>
                  </div>
                </div>

                {canManage && (
                  <div className="flex justify-end pt-4 border-t border-border">
                    <Button type="submit" disabled={programSaving} className="gap-2">
                      {programSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Save Configuration
                    </Button>
                  </div>
                )}
              </form>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* TAB 2: REWARDS CATALOGUE */}
      {activeTab === "rewards" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Define catalog rewards that diners can unlock with points.
            </p>
            {canManage && (
              <Button size="sm" onClick={() => setIsRewardModalOpen(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> Add Reward
              </Button>
            )}
          </div>

          {rewardsLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading rewards...
            </div>
          ) : rewards.length === 0 ? (
            <Card className="border-border">
              <CardContent className="p-12 text-center">
                <Award className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-foreground text-base">No Rewards Created</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Create rewards like $5 off or special perks that diners can redeem with loyalty points.
                </p>
                {canManage && (
                  <Button size="sm" onClick={() => setIsRewardModalOpen(true)} className="mt-4 gap-1.5">
                    <Plus className="w-4 h-4" /> Create First Reward
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {rewards.map((reward) => (
                <Card key={reward.id} className={`border-border ${!reward.isActive ? "opacity-60 bg-muted/20" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-semibold">{reward.name}</CardTitle>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          reward.isActive
                            ? "bg-emerald-500/10 text-emerald-600"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {reward.isActive ? "Active" : "Archived"}
                      </span>
                    </div>
                    {reward.description && (
                      <CardDescription className="text-xs line-clamp-2">{reward.description}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Points Cost:</span>
                      <span className="text-sm font-bold text-primary flex items-center gap-1">
                        <Coins className="w-4 h-4" /> {reward.pointsCost} pts
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex justify-between">
                        <span>Benefit:</span>
                        <span className="font-semibold text-foreground">
                          {reward.discountType === "PERCENTAGE"
                            ? `${reward.discountValue}% Off`
                            : `$${reward.discountValue.toFixed(2)} Off`}
                        </span>
                      </div>
                      {reward.minOrderSubtotal > 0 && (
                        <div className="flex justify-between">
                          <span>Min Subtotal:</span>
                          <span className="font-semibold text-foreground">${reward.minOrderSubtotal.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Times Redeemed:</span>
                        <span className="font-semibold text-foreground">{reward.currentRedemptions}</span>
                      </div>
                    </div>

                    {canManage && (
                      <div className="pt-2 border-t border-border flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleRewardActive(reward)}
                          className="text-xs h-8"
                        >
                          {reward.isActive ? "Archive Reward" : "Re-activate"}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: POINTS LEDGER */}
      {activeTab === "ledger" && (
        <Card className="border-border">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
            <div>
              <CardTitle className="text-lg">Points Ledger & Audit History</CardTitle>
              <CardDescription>
                Auditable append-only ledger tracking all points issued, redeemed, reversed, and adjusted.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={ledgerFilterType}
                onChange={(e) => {
                  setLedgerFilterType(e.target.value);
                  setLedgerPage(1);
                }}
                className="px-3 py-1.5 rounded-lg border border-border bg-background text-foreground text-xs"
              >
                <option value="">All Transaction Types</option>
                <option value="EARNED">Earned</option>
                <option value="REDEEMED">Redeemed</option>
                <option value="ADJUSTED">Adjusted</option>
                <option value="REFUNDED">Refunded</option>
              </select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {ledgerLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading transactions...
              </div>
            ) : ledgerEntries.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <ListOrdered className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No ledger entries found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b border-border text-muted-foreground font-semibold">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Points Delta</th>
                      <th className="p-3 text-right">Balance After</th>
                      <th className="p-3">Reason / Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {ledgerEntries.map((entry) => {
                      const isPositive = entry.points > 0;
                      return (
                        <tr key={entry.id} className="hover:bg-muted/20">
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {new Date(entry.createdAt).toLocaleString()}
                          </td>
                          <td className="p-3 font-medium text-foreground">
                            {entry.customer?.name || "Guest Diners"}
                            {entry.customer?.phone && (
                              <span className="block text-[11px] text-muted-foreground font-normal">
                                {entry.customer.phone}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-md font-semibold text-[10px] ${
                                entry.type === "EARNED"
                                  ? "bg-emerald-500/10 text-emerald-600"
                                  : entry.type === "REDEEMED"
                                  ? "bg-primary/10 text-primary"
                                  : entry.type === "REFUNDED"
                                  ? "bg-blue-500/10 text-blue-600"
                                  : "bg-purple-500/10 text-purple-600"
                              }`}
                            >
                              {entry.type}
                            </span>
                          </td>
                          <td className={`p-3 text-right font-bold ${isPositive ? "text-emerald-600" : "text-primary"}`}>
                            {isPositive ? `+${entry.points}` : entry.points}
                          </td>
                          <td className="p-3 text-right font-medium text-foreground">{entry.balanceAfter} pts</td>
                          <td className="p-3 text-muted-foreground max-w-xs truncate">
                            {entry.reason}
                            {entry.order && (
                              <span className="block text-[11px] text-foreground font-medium">
                                Order #{entry.order.orderNumber}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {ledgerTotalPages > 1 && (
              <div className="flex items-center justify-between p-3 border-t border-border text-xs">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ledgerPage <= 1}
                  onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </Button>
                <span className="text-muted-foreground">
                  Page {ledgerPage} of {ledgerTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ledgerPage >= ledgerTotalPages}
                  onClick={() => setLedgerPage((p) => p + 1)}
                  className="gap-1 text-xs"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 4: MANUAL ADJUSTMENT */}
      {activeTab === "adjust" && canAdjust && (
        <Card className="border-border max-w-2xl">
          <CardHeader>
            <CardTitle className="text-lg">Manual Points Adjustment</CardTitle>
            <CardDescription>
              Grant bonus points or correct mistakes for a diner. All adjustments are logged with your user ID.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitAdjustment} className="space-y-4">
              {adjustSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> {adjustSuccess}
                </div>
              )}
              {adjustError && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {adjustError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Customer UUID</label>
                <input
                  type="text"
                  placeholder="e.g. 5ec821e7-4b02-40b2-8827-0d621065d5b2"
                  value={adjustCustomerId}
                  onChange={(e) => setAdjustCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Find the customer ID in the Customers (CRM) tab.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Points Delta</label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g. 100 to grant, or -50 to deduct"
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Positive number grants points; negative number deducts points.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Mandatory Reason</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Apology for kitchen delay, VIP birthday bonus, etc."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={adjustSubmitting} className="gap-2">
                  {adjustSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sliders className="w-4 h-4" />}
                  Submit Adjustment
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* CREATE REWARD MODAL */}
      {isRewardModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl w-full max-w-md p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
            <button
              onClick={() => setIsRewardModalOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-foreground mb-4">Add Loyalty Reward</h2>

            {rewardError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm mb-4">
                {rewardError}
              </div>
            )}

            <form onSubmit={handleCreateReward} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Reward Name *</label>
                <input
                  type="text"
                  placeholder="e.g. $5 Off Your Next Meal"
                  value={rewardForm.name}
                  onChange={(e) => setRewardForm({ ...rewardForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Points Cost *</label>
                <input
                  type="number"
                  min="1"
                  value={rewardForm.pointsCost}
                  onChange={(e) => setRewardForm({ ...rewardForm, pointsCost: parseInt(e.target.value, 10) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Discount Type</label>
                  <select
                    value={rewardForm.discountType}
                    onChange={(e) => setRewardForm({ ...rewardForm, discountType: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                  >
                    <option value="FIXED">Fixed Amount ($)</option>
                    <option value="PERCENTAGE">Percentage (%)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground block mb-1">Discount Value *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={rewardForm.discountValue}
                    onChange={(e) => setRewardForm({ ...rewardForm, discountValue: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Min Order Subtotal ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={rewardForm.minOrderSubtotal}
                  onChange={(e) => setRewardForm({ ...rewardForm, minOrderSubtotal: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Optional details or terms"
                  value={rewardForm.description}
                  onChange={(e) => setRewardForm({ ...rewardForm, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsRewardModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={rewardSaving}>
                  {rewardSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Reward"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
