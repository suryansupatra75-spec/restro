"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Printer,
  Mail,
  MessageSquare,
  FileSpreadsheet,
  Code,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCcw,
  Loader2,
  Save,
  Plus,
  Trash2,
  Send,
  ExternalLink,
  ShieldCheck,
  Download,
  Copy,
  Check,
  RefreshCw,
  Eye,
  X,
  Radio,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ClientIntegrationsProps {
  restaurantId: string;
  restaurantName: string;
  currency: string;
  userRole: string;
  canManage: boolean;
  canTest: boolean;
  canManageKeys: boolean;
}

type TabType = "printers" | "email" | "whatsapp" | "exports" | "developer";

interface IntegrationState {
  PRINTER: {
    provider: string;
    status: string;
    isEnabled: boolean;
    config: any;
    lastCheckAt: string | null;
    lastError: string | null;
  };
  EMAIL: {
    provider: string;
    status: string;
    isEnabled: boolean;
    config: any;
    lastCheckAt: string | null;
    lastError: string | null;
  };
  WHATSAPP: {
    provider: string;
    status: string;
    isEnabled: boolean;
    config: any;
    lastCheckAt: string | null;
    lastError: string | null;
  };
  ACCOUNTING: {
    provider: string;
    status: string;
    isEnabled: boolean;
    config: any;
    lastCheckAt: string | null;
    lastError: string | null;
  };
}

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

interface WebhookItem {
  id: string;
  name: string;
  url: string;
  secretRedacted: string;
  events: string[];
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt: string | null;
  lastError: string | null;
  totalDeliveries: number;
  createdAt: string;
}

interface WebhookDeliveryLogItem {
  id: string;
  event: string;
  status: string;
  responseCode: number | null;
  durationMs: number | null;
  errorSummary: string | null;
  payloadSummary: string | null;
  createdAt: string;
  subscription?: { name: string; url: string };
}

interface PrintJobItem {
  id: string;
  orderNumber: string;
  tableName: string;
  printType: string;
  status: string;
  printerName: string;
  isReprint: boolean;
  reprintCount: number;
  printedBy: string;
  createdAt: string;
}

export function ClientIntegrations({
  restaurantId,
  restaurantName,
  currency,
  userRole,
  canManage,
  canTest,
  canManageKeys,
}: ClientIntegrationsProps) {
  const [activeTab, setActiveTab] = useState<TabType>("printers");
  const [loading, setLoading] = useState(true);
  const [integrations, setIntegrations] = useState<IntegrationState | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);

  // Printer Form State
  const [printerPaper, setPrinterPaper] = useState("80mm");
  const [printerHeader, setPrinterHeader] = useState("");
  const [printerFooter, setPrinterFooter] = useState("Thank you for dining with us!");
  const [printerTaxId, setPrinterTaxId] = useState("");
  const [printerConnectionType, setPrinterConnectionType] = useState("BROWSER");
  const [printerIp, setPrinterIp] = useState("");
  const [printerPort, setPrinterPort] = useState(9100);
  const [showPricesOnKot, setShowPricesOnKot] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [autoPrintPrompt, setAutoPrintPrompt] = useState(false);
  const [printLedger, setPrintLedger] = useState<PrintJobItem[]>([]);

  // Email Form State
  const [emailProvider, setEmailProvider] = useState<"SMTP" | "RESEND">("SMTP");
  const [emailHost, setEmailHost] = useState("");
  const [emailPort, setEmailPort] = useState(587);
  const [emailSecure, setEmailSecure] = useState(true);
  const [emailUsername, setEmailUsername] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailApiKey, setEmailApiKey] = useState("");
  const [emailFromEmail, setEmailFromEmail] = useState("");
  const [emailFromName, setEmailFromName] = useState("");
  const [emailOrderConfirmed, setEmailOrderConfirmed] = useState(true);
  const [emailLowStock, setEmailLowStock] = useState(true);

  // WhatsApp Form State
  const [waProvider, setWaProvider] = useState<"META_CLOUD" | "TWILIO">("META_CLOUD");
  const [waPhoneId, setWaPhoneId] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waTwilioSid, setWaTwilioSid] = useState("");
  const [waTwilioToken, setWaTwilioToken] = useState("");
  const [waTwilioFrom, setWaTwilioFrom] = useState("");
  const [waOrderUpdates, setWaOrderUpdates] = useState(true);
  const [waExplicitConsent, setWaExplicitConsent] = useState(true);

  // Exports Form State
  const [exportRange, setExportRange] = useState("7d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [exportingType, setExportingType] = useState<string | null>(null);

  // Developer Form State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookItem[]>([]);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryLogItem[]>([]);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["orders:read", "menu:read"]);
  const [newKeyExpiry, setNewKeyExpiry] = useState("90");
  const [generatedRawKey, setGeneratedRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // New Webhook Modal State
  const [showNewWebhookModal, setShowNewWebhookModal] = useState(false);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookEvents, setWebhookEvents] = useState<string[]>([
    "order.created",
    "order.status_changed",
    "payment.completed",
  ]);
  const [showDeliveriesDrawer, setShowDeliveriesDrawer] = useState(false);

  // Success / Error alerts
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/integrations/settings", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const cfg = data.integrations as IntegrationState;
        setIntegrations(cfg);

        // Populate Printers
        if (cfg.PRINTER?.config) {
          const p = cfg.PRINTER.config;
          setPrinterPaper(p.paperWidth || "80mm");
          setPrinterHeader(p.headerText || "");
          setPrinterFooter(p.footerText || "Thank you for dining with us!");
          setPrinterTaxId(p.taxIdText || "");
          setPrinterConnectionType(p.connectionType || "BROWSER");
          setPrinterIp(p.networkPrinterIp || "");
          setPrinterPort(p.networkPrinterPort || 9100);
          setShowPricesOnKot(Boolean(p.showPricesOnKot));
          setShowNotes(p.showNotes !== false);
          setAutoPrintPrompt(Boolean(p.autoPrintPrompt));
        }

        // Populate Email
        if (cfg.EMAIL?.config) {
          const e = cfg.EMAIL.config;
          setEmailProvider(e.provider || "SMTP");
          setEmailHost(e.host || "");
          setEmailPort(e.port || 587);
          setEmailSecure(e.secure !== false);
          setEmailUsername(e.username || "");
          setEmailPassword(e.password || "");
          setEmailApiKey(e.apiKey || "");
          setEmailFromEmail(e.fromEmail || "");
          setEmailFromName(e.fromName || "");
          setEmailOrderConfirmed(e.orderConfirmationEnabled !== false);
          setEmailLowStock(e.lowStockAlertsEnabled !== false);
        }

        // Populate WhatsApp
        if (cfg.WHATSAPP?.config) {
          const w = cfg.WHATSAPP.config;
          setWaProvider(w.provider || "META_CLOUD");
          setWaPhoneId(w.phoneNumberId || "");
          setWaBusinessAccountId(w.businessAccountId || "");
          setWaAccessToken(w.accessToken || "");
          setWaTwilioSid(w.twilioAccountSid || "");
          setWaTwilioToken(w.twilioAuthToken || "");
          setWaTwilioFrom(w.twilioFromNumber || "");
          setWaOrderUpdates(w.orderUpdatesEnabled !== false);
          setWaExplicitConsent(w.requireExplicitConsent !== false);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPrintHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/integrations/print/history?limit=25");
      if (res.ok) {
        const data = await res.json();
        setPrintLedger(data.printJobs || []);
      }
    } catch {}
  }, []);

  const fetchDeveloperItems = useCallback(async () => {
    try {
      const [keyRes, whRes, delRes] = await Promise.all([
        fetch("/api/v1/integrations/api-keys"),
        fetch("/api/v1/integrations/webhooks"),
        fetch("/api/v1/integrations/webhooks/deliveries?limit=20"),
      ]);

      if (keyRes.ok) {
        const d = await keyRes.json();
        setApiKeys(d.apiKeys || []);
      }
      if (whRes.ok) {
        const d = await whRes.json();
        setWebhooks(d.webhooks || []);
      }
      if (delRes.ok) {
        const d = await delRes.json();
        setDeliveries(d.deliveries || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (activeTab === "printers") fetchPrintHistory();
    if (activeTab === "developer") fetchDeveloperItems();
  }, [activeTab, fetchPrintHistory, fetchDeveloperItems]);

  // Set default export dates
  useEffect(() => {
    const today = new Date();
    const endStr = today.toISOString().slice(0, 10);
    const startObj = new Date(today);
    if (exportRange === "7d") startObj.setDate(today.getDate() - 7);
    else if (exportRange === "30d") startObj.setDate(today.getDate() - 30);
    else if (exportRange === "this_month") startObj.setDate(1);
    const startStr = startObj.toISOString().slice(0, 10);

    setCustomStart(startStr);
    setCustomEnd(endStr);
  }, [exportRange]);

  const handleSavePrinter = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        providerType: "PRINTER",
        isEnabled: true,
        config: {
          paperWidth: printerPaper,
          headerText: printerHeader || null,
          footerText: printerFooter || null,
          taxIdText: printerTaxId || null,
          connectionType: printerConnectionType,
          networkPrinterIp: printerConnectionType === "NETWORK_ESC_POS" ? printerIp : null,
          networkPrinterPort: printerConnectionType === "NETWORK_ESC_POS" ? Number(printerPort) : null,
          showPricesOnKot,
          showNotes,
          autoPrintPrompt,
        },
      };

      const res = await fetch("/api/v1/integrations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFeedback({ type: "success", text: "Printer settings saved successfully." });
        fetchSettings();
      } else {
        const err = await res.json();
        setFeedback({ type: "error", text: err.error || "Failed to save printer settings." });
      }
    } catch {
      setFeedback({ type: "error", text: "Network error saving printer settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEmail = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        providerType: "EMAIL",
        isEnabled: true,
        config: {
          provider: emailProvider,
          host: emailProvider === "SMTP" ? emailHost : null,
          port: emailProvider === "SMTP" ? Number(emailPort) : null,
          secure: emailSecure,
          username: emailProvider === "SMTP" ? emailUsername : null,
          password: emailProvider === "SMTP" ? emailPassword : null,
          apiKey: emailProvider === "RESEND" ? emailApiKey : null,
          fromEmail: emailFromEmail,
          fromName: emailFromName,
          orderConfirmationEnabled: emailOrderConfirmed,
          lowStockAlertsEnabled: emailLowStock,
        },
      };

      const res = await fetch("/api/v1/integrations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFeedback({ type: "success", text: "Email configuration saved successfully." });
        fetchSettings();
      } else {
        const err = await res.json();
        setFeedback({ type: "error", text: err.error || "Failed to save email settings." });
      }
    } catch {
      setFeedback({ type: "error", text: "Network error saving email settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveWhatsApp = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        providerType: "WHATSAPP",
        isEnabled: true,
        config: {
          provider: waProvider,
          phoneNumberId: waProvider === "META_CLOUD" ? waPhoneId : null,
          businessAccountId: waProvider === "META_CLOUD" ? waBusinessAccountId : null,
          accessToken: waProvider === "META_CLOUD" ? waAccessToken : null,
          twilioAccountSid: waProvider === "TWILIO" ? waTwilioSid : null,
          twilioAuthToken: waProvider === "TWILIO" ? waTwilioToken : null,
          twilioFromNumber: waProvider === "TWILIO" ? waTwilioFrom : null,
          orderUpdatesEnabled: waOrderUpdates,
          requireExplicitConsent: waExplicitConsent,
        },
      };

      const res = await fetch("/api/v1/integrations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setFeedback({ type: "success", text: "WhatsApp configuration saved successfully." });
        fetchSettings();
      } else {
        const err = await res.json();
        setFeedback({ type: "error", text: err.error || "Failed to save WhatsApp settings." });
      }
    } catch {
      setFeedback({ type: "error", text: "Network error saving WhatsApp settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async (providerType: "PRINTER" | "EMAIL" | "WHATSAPP") => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/v1/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerType }),
      });
      const data = await res.json();
      setTestResult({
        success: data.success,
        message: data.message,
        details: data.details,
      });
      fetchSettings();
    } catch {
      setTestResult({
        success: false,
        message: "Failed to connect to verification service.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleGenerateKey = async () => {
    try {
      const res = await fetch("/api/v1/integrations/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName,
          scopes: newKeyScopes,
          expiresInDays: newKeyExpiry ? Number(newKeyExpiry) : null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setGeneratedRawKey(data.apiKey.rawKey);
        setShowNewKeyModal(false);
        fetchDeveloperItems();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create API key");
      }
    } catch {
      alert("Network error generating API key");
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this API key? External clients will immediately lose access.")) {
      return;
    }
    try {
      const res = await fetch(`/api/v1/integrations/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchDeveloperItems();
      }
    } catch {}
  };

  const handleCreateWebhook = async () => {
    try {
      const res = await fetch("/api/v1/integrations/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: webhookName,
          url: webhookUrl,
          events: webhookEvents,
          isActive: true,
        }),
      });

      if (res.ok) {
        setShowNewWebhookModal(false);
        setWebhookName("");
        setWebhookUrl("");
        fetchDeveloperItems();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create webhook subscription");
      }
    } catch {
      alert("Network error creating webhook");
    }
  };

  const handleDeleteWebhook = async (id: string) => {
    if (!confirm("Delete this webhook subscription?")) return;
    try {
      const res = await fetch(`/api/v1/integrations/webhooks/${id}`, { method: "DELETE" });
      if (res.ok) fetchDeveloperItems();
    } catch {}
  };

  const handlePingWebhook = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/integrations/webhooks/${id}/ping`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        alert(`Ping successful! Destination responded with HTTP ${data.responseCode} in ${data.durationMs}ms.`);
      } else {
        alert(`Ping failed: ${data.error || "Destination rejected request"}`);
      }
      fetchDeveloperItems();
    } catch {
      alert("Failed to send webhook ping");
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "CONNECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            Connected
          </span>
        );
      case "NEEDS_ATTENTION":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertCircle className="w-3.5 h-3.5 text-amber-700" />
            Needs Attention
          </span>
        );
      case "DEGRADED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <Radio className="w-3.5 h-3.5 text-blue-700" />
            Degraded / Fallback
          </span>
        );
      case "DISCONNECTED":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
            <AlertCircle className="w-3.5 h-3.5 text-red-700" />
            Disconnected
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
            <Clock className="w-3.5 h-3.5 text-neutral-400" />
            Not configured
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
        <p className="text-sm text-muted-foreground font-medium">Loading integration parameters...</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Integrations & External Channels</h1>
              <p className="text-sm text-muted-foreground">
                Manage hardware printers, transactional email & WhatsApp messaging, accounting exports, and developer APIs.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Global Alerts */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-center gap-3 text-sm animate-in fade-in ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : "bg-red-50 border-red-200 text-red-900"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          )}
          <span className="font-medium flex-1">{feedback.text}</span>
          <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-neutral-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-border gap-2 overflow-x-auto pb-px">
        {[
          { id: "printers", label: "Receipt & Kitchen Printers", icon: Printer, status: integrations?.PRINTER?.status },
          { id: "email", label: "Email Notifications", icon: Mail, status: integrations?.EMAIL?.status },
          { id: "whatsapp", label: "WhatsApp Business", icon: MessageSquare, status: integrations?.WHATSAPP?.status },
          { id: "exports", label: "Accounting & Tax Exports", icon: FileSpreadsheet, status: "CONNECTED" },
          { id: "developer", label: "API Keys & Webhooks", icon: Code, status: "CONNECTED" },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                setTestResult(null);
                setFeedback(null);
              }}
              className={`flex items-center gap-2.5 py-3 px-4 border-b-2 font-medium text-sm whitespace-nowrap transition cursor-pointer ${
                active
                  ? "border-primary text-primary font-bold bg-primary/5 rounded-t-lg"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-neutral-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.status && (
                <span
                  className={`w-2 h-2 rounded-full ${
                    tab.status === "CONNECTED"
                      ? "bg-emerald-500"
                      : tab.status === "NEEDS_ATTENTION"
                      ? "bg-amber-500"
                      : tab.status === "DEGRADED"
                      ? "bg-blue-500"
                      : "bg-neutral-300"
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: PRINTERS & HARDWARE */}
      {activeTab === "printers" && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Thermal Receipt & KOT Settings</h3>
                <p className="text-xs text-muted-foreground">
                  Configure bill and kitchen ticket formatting. Browser thermal printing is enabled by default.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {renderStatusBadge(integrations?.PRINTER?.status || "CONNECTED")}
              </div>
            </div>

            {/* Form Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Paper Width Format</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPrinterPaper("80mm")}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      printerPaper === "80mm"
                        ? "border-primary bg-primary/5 text-primary font-bold"
                        : "border-border bg-surface hover:bg-neutral-50 text-foreground"
                    }`}
                  >
                    <div className="text-xs font-bold">80mm (Standard)</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Recommended for POS thermal roll</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrinterPaper("58mm")}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      printerPaper === "58mm"
                        ? "border-primary bg-primary/5 text-primary font-bold"
                        : "border-border bg-surface hover:bg-neutral-50 text-foreground"
                    }`}
                  >
                    <div className="text-xs font-bold">58mm (Compact)</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">For portable bluetooth printers</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Print Dispatch Method</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPrinterConnectionType("BROWSER")}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      printerConnectionType === "BROWSER"
                        ? "border-primary bg-primary/5 text-primary font-bold"
                        : "border-border bg-surface hover:bg-neutral-50 text-foreground"
                    }`}
                  >
                    <div className="text-xs font-bold">Browser Print (Zero-Setup)</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Standard system print dialog</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrinterConnectionType("NETWORK_ESC_POS")}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                      printerConnectionType === "NETWORK_ESC_POS"
                        ? "border-primary bg-primary/5 text-primary font-bold"
                        : "border-border bg-surface hover:bg-neutral-50 text-foreground"
                    }`}
                  >
                    <div className="text-xs font-bold">Network ESC/POS Bridge</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Raw TCP socket via local bridge</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Header Subtitle (Optional)</label>
                <input
                  type="text"
                  value={printerHeader}
                  onChange={(e) => setPrinterHeader(e.target.value)}
                  placeholder="e.g. Authentic Italian Bistro & Woodfire"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Tax / GST Number on Bill</label>
                <input
                  type="text"
                  value={printerTaxId}
                  onChange={(e) => setPrinterTaxId(e.target.value)}
                  placeholder="e.g. GSTIN 27ABCDE1234F1Z5"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1.5">Receipt Footer Message</label>
                <input
                  type="text"
                  value={printerFooter}
                  onChange={(e) => setPrinterFooter(e.target.value)}
                  placeholder="Thank you for dining with us!"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>

              {printerConnectionType === "NETWORK_ESC_POS" && (
                <div className="md:col-span-2 p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-3">
                  <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                    <Radio className="w-4 h-4 text-blue-700" />
                    <span>Direct Network ESC/POS Configuration</span>
                  </div>
                  <p className="text-[11px] text-blue-800">
                    Direct socket printing bypasses browser dialogs. Note: Browsers cannot open raw TCP sockets directly;
                    a local bridge agent or print spooler is required on your LAN. If offline, the system safely falls back
                    to Browser Print.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">Printer IP Address</label>
                      <input
                        type="text"
                        value={printerIp}
                        onChange={(e) => setPrinterIp(e.target.value)}
                        placeholder="192.168.1.150"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">Port</label>
                      <input
                        type="number"
                        value={printerPort}
                        onChange={(e) => setPrinterPort(Number(e.target.value))}
                        placeholder="9100"
                        className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Toggles */}
              <div className="md:col-span-2 space-y-3 pt-2 border-t border-border">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPricesOnKot}
                    onChange={(e) => setShowPricesOnKot(e.target.checked)}
                    className="w-4 h-4 rounded text-primary border-border"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground">Show Prices on Kitchen Order Tickets (KOT)</span>
                    <p className="text-[11px] text-muted-foreground">Default is OFF (kitchen only needs quantities and modifiers)</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showNotes}
                    onChange={(e) => setShowNotes(e.target.checked)}
                    className="w-4 h-4 rounded text-primary border-border"
                  />
                  <div>
                    <span className="text-xs font-bold text-foreground">Highlight Special Instructions and Addons</span>
                    <p className="text-[11px] text-muted-foreground">Prints customer notes in bold italic font</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Test Diagnostics Result */}
            {testResult && activeTab === "printers" && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-1 ${
                  testResult.success
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : "bg-amber-50 border-amber-200 text-amber-900"
                }`}
              >
                <div className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Test Result: {testResult.message}</span>
                </div>
                {testResult.details && (
                  <pre className="text-[11px] bg-white/70 p-2 rounded border border-neutral-200 font-mono">
                    {JSON.stringify(testResult.details, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleTestConnection("PRINTER")}
                disabled={testing}
                className="gap-1.5 cursor-pointer"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                <span>Verify Template & Diagnostics</span>
              </Button>

              {canManage && (
                <Button size="sm" onClick={handleSavePrinter} disabled={saving} className="gap-1.5 cursor-pointer">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save Printer Settings</span>
                </Button>
              )}
            </div>
          </div>

          {/* Print Audit Ledger */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">Print Audit Ledger & Reprint Tracking</h3>
                <p className="text-xs text-muted-foreground">
                  Audit trail of all Customer Bill and KOT printing events with duplicate detection.
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={fetchPrintHistory} className="gap-1 cursor-pointer">
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </Button>
            </div>

            {printLedger.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-xl">
                <Printer className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No print events recorded yet. Print a bill or ticket in Orders/KDS to see entries here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Order Number</th>
                      <th className="py-2.5 px-3">Table</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Reprint Flag</th>
                      <th className="py-2.5 px-3">Printed By</th>
                      <th className="py-2.5 px-3">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {printLedger.map((job) => (
                      <tr key={job.id} className="hover:bg-neutral-50/50">
                        <td className="py-2.5 px-3 font-bold text-foreground">{job.orderNumber}</td>
                        <td className="py-2.5 px-3">{job.tableName}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              job.printType === "KOT"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-neutral-100 text-neutral-800"
                            }`}
                          >
                            {job.printType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {job.isReprint ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              REPRINT #{job.reprintCount}
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-semibold">Original (1st)</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">{job.printedBy}</td>
                        <td className="py-2.5 px-3 text-muted-foreground font-mono text-[11px]">
                          {new Date(job.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EMAIL NOTIFICATIONS */}
      {activeTab === "email" && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <h3 className="text-base font-bold text-foreground">Transactional Email Configuration</h3>
              <p className="text-xs text-muted-foreground">
                Connect your SMTP relay or Resend API to deliver customer order receipts and operational alerts.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {renderStatusBadge(integrations?.EMAIL?.status || "NOT_CONFIGURED")}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-foreground mb-1.5">Email Provider</label>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <button
                  type="button"
                  onClick={() => setEmailProvider("SMTP")}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    emailProvider === "SMTP"
                      ? "border-primary bg-primary/5 text-primary font-bold"
                      : "border-border bg-surface hover:bg-neutral-50 text-foreground"
                  }`}
                >
                  <div className="text-xs font-bold">Standard SMTP</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Custom mail server / Gmail / Postmark</div>
                </button>
                <button
                  type="button"
                  onClick={() => setEmailProvider("RESEND")}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    emailProvider === "RESEND"
                      ? "border-primary bg-primary/5 text-primary font-bold"
                      : "border-border bg-surface hover:bg-neutral-50 text-foreground"
                  }`}
                >
                  <div className="text-xs font-bold">Resend API</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">High deliverability developer API</div>
                </button>
              </div>
            </div>

            {emailProvider === "SMTP" ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">SMTP Server Host</label>
                  <input
                    type="text"
                    value={emailHost}
                    onChange={(e) => setEmailHost(e.target.value)}
                    placeholder="smtp.resend.com or smtp.gmail.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Port</label>
                  <input
                    type="number"
                    value={emailPort}
                    onChange={(e) => setEmailPort(Number(e.target.value))}
                    placeholder="587"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">SMTP Username</label>
                  <input
                    type="text"
                    value={emailUsername}
                    onChange={(e) => setEmailUsername(e.target.value)}
                    placeholder="apikey or user@example.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">SMTP Password</label>
                  <input
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                  />
                </div>
              </>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-foreground mb-1">Resend API Key</label>
                <input
                  type="password"
                  value={emailApiKey}
                  onChange={(e) => setEmailApiKey(e.target.value)}
                  placeholder="re_••••••••"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-foreground mb-1">From Email Address</label>
              <input
                type="email"
                value={emailFromEmail}
                onChange={(e) => setEmailFromEmail(e.target.value)}
                placeholder="orders@restaurant.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">Sender Name</label>
              <input
                type="text"
                value={emailFromName}
                onChange={(e) => setEmailFromName(e.target.value)}
                placeholder={restaurantName}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface"
              />
            </div>

            {/* Triggers */}
            <div className="md:col-span-2 space-y-3 pt-3 border-t border-border">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailOrderConfirmed}
                  onChange={(e) => setEmailOrderConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded text-primary"
                />
                <div>
                  <span className="text-xs font-bold text-foreground">Send Order Receipts to Customers</span>
                  <p className="text-[11px] text-muted-foreground">Dispatches HTML receipts when customer enters their email address</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailLowStock}
                  onChange={(e) => setEmailLowStock(e.target.checked)}
                  className="w-4 h-4 rounded text-primary"
                />
                <div>
                  <span className="text-xs font-bold text-foreground">Send Low Stock Inventory Alerts to Managers</span>
                  <p className="text-[11px] text-muted-foreground">Dispatches critical item shortage alerts</p>
                </div>
              </label>
            </div>
          </div>

          {/* Test Diagnostics Result */}
          {testResult && activeTab === "email" && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-1 ${
                testResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-red-50 border-red-200 text-red-900"
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                <span>{testResult.message}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestConnection("EMAIL")}
              disabled={testing}
              className="gap-1.5 cursor-pointer"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Test Email Connection</span>
            </Button>

            {canManage && (
              <Button size="sm" onClick={handleSaveEmail} disabled={saving} className="gap-1.5 cursor-pointer">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Email Settings</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: WHATSAPP BUSINESS */}
      {activeTab === "whatsapp" && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <h3 className="text-base font-bold text-foreground">WhatsApp Business API Gateway</h3>
              <p className="text-xs text-muted-foreground">
                Connect official Meta Cloud API or Twilio WhatsApp to send instant order status updates directly to diners.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {renderStatusBadge(integrations?.WHATSAPP?.status || "NOT_CONFIGURED")}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-foreground mb-1.5">Connector Provider</label>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <button
                  type="button"
                  onClick={() => setWaProvider("META_CLOUD")}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    waProvider === "META_CLOUD"
                      ? "border-primary bg-primary/5 text-primary font-bold"
                      : "border-border bg-surface hover:bg-neutral-50 text-foreground"
                  }`}
                >
                  <div className="text-xs font-bold">Meta Cloud API (Official)</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Direct Meta Developers graph API</div>
                </button>
                <button
                  type="button"
                  onClick={() => setWaProvider("TWILIO")}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition ${
                    waProvider === "TWILIO"
                      ? "border-primary bg-primary/5 text-primary font-bold"
                      : "border-border bg-surface hover:bg-neutral-50 text-foreground"
                  }`}
                >
                  <div className="text-xs font-bold">Twilio WhatsApp</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">Twilio programmable messaging</div>
                </button>
              </div>
            </div>

            {waProvider === "META_CLOUD" ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Phone Number ID</label>
                  <input
                    type="text"
                    value={waPhoneId}
                    onChange={(e) => setWaPhoneId(e.target.value)}
                    placeholder="10492819283719"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">WhatsApp Business Account ID</label>
                  <input
                    type="text"
                    value={waBusinessAccountId}
                    onChange={(e) => setWaBusinessAccountId(e.target.value)}
                    placeholder="1029384756102"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-foreground mb-1">System User Access Token</label>
                  <input
                    type="password"
                    value={waAccessToken}
                    onChange={(e) => setWaAccessToken(e.target.value)}
                    placeholder="EAAB••••••••"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Twilio Account SID</label>
                  <input
                    type="text"
                    value={waTwilioSid}
                    onChange={(e) => setWaTwilioSid(e.target.value)}
                    placeholder="AC••••••••"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-foreground mb-1">Twilio Auth Token</label>
                  <input
                    type="password"
                    value={waTwilioToken}
                    onChange={(e) => setWaTwilioToken(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-foreground mb-1">Twilio From Number (WhatsApp format)</label>
                  <input
                    type="text"
                    value={waTwilioFrom}
                    onChange={(e) => setWaTwilioFrom(e.target.value)}
                    placeholder="whatsapp:+14155238886"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                  />
                </div>
              </>
            )}

            <div className="md:col-span-2 space-y-3 pt-3 border-t border-border">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waOrderUpdates}
                  onChange={(e) => setWaOrderUpdates(e.target.checked)}
                  className="w-4 h-4 rounded text-primary"
                />
                <div>
                  <span className="text-xs font-bold text-foreground">Send Order Ready & Table Service Updates</span>
                  <p className="text-[11px] text-muted-foreground">Dispatches WhatsApp message when kitchen marks order READY</p>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waExplicitConsent}
                  onChange={(e) => setWaExplicitConsent(e.target.checked)}
                  className="w-4 h-4 rounded text-primary"
                />
                <div>
                  <span className="text-xs font-bold text-foreground">Require Explicit Customer Consent (Opt-In Policy)</span>
                  <p className="text-[11px] text-muted-foreground">Strict compliance with WhatsApp Business messaging policies</p>
                </div>
              </label>
            </div>
          </div>

          {testResult && activeTab === "whatsapp" && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-1 ${
                testResult.success
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-red-50 border-red-200 text-red-900"
              }`}
            >
              <div className="font-bold flex items-center gap-1.5">
                {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                <span>{testResult.message}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestConnection("WHATSAPP")}
              disabled={testing}
              className="gap-1.5 cursor-pointer"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Test Credentials Ping</span>
            </Button>

            {canManage && (
              <Button size="sm" onClick={handleSaveWhatsApp} disabled={saving} className="gap-1.5 cursor-pointer">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save WhatsApp Settings</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ACCOUNTING & TAX EXPORTS */}
      {activeTab === "exports" && (
        <div className="space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Accounting & Tax Report Generator</h3>
                <p className="text-xs text-muted-foreground">
                  Download certified, audit-ready reports formatted for QuickBooks, Tally, Xero, and local tax authorities.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                  Formula-Injection Safe
                </span>
              </div>
            </div>

            {/* Date Range Selector */}
            <div className="p-4 rounded-xl bg-neutral-50/80 border border-border flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {["7d", "30d", "this_month"].map((r) => (
                  <button
                    key={r}
                    onClick={() => setExportRange(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      exportRange === r
                        ? "bg-primary text-white shadow-xs"
                        : "bg-surface border border-border text-foreground hover:bg-neutral-100"
                    }`}
                  >
                    {r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : "This Month"}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground font-medium">Interval:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => {
                    setCustomStart(e.target.value);
                    setExportRange("custom");
                  }}
                  className="px-2.5 py-1 rounded-md border border-border bg-white text-xs"
                />
                <span className="text-neutral-400">to</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => {
                    setCustomEnd(e.target.value);
                    setExportRange("custom");
                  }}
                  className="px-2.5 py-1 rounded-md border border-border bg-white text-xs"
                />
              </div>
            </div>

            {/* 3 Report Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div className="p-5 rounded-2xl border border-border bg-surface flex flex-col justify-between space-y-4 hover:border-neutral-300 transition shadow-xs">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                    <FileText className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Sales & Revenue Ledger</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Order-by-order breakdown with gross, net, promo/loyalty discounts, tax, tips, and settlement provider.
                  </p>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500 font-mono">Format: .CSV</span>
                  <a
                    href={`/api/v1/integrations/exports?type=sales_ledger&startDate=${customStart}&endDate=${customEnd}&format=csv`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-primary text-white hover:bg-primary/90 transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </a>
                </div>
              </div>

              {/* Card 2 */}
              <div className="p-5 rounded-2xl border border-border bg-surface flex flex-col justify-between space-y-4 hover:border-neutral-300 transition shadow-xs">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-3">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Tax & Invoicing Report</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Taxable sales vs exempt sales, GST/VAT percentage rates breakdown, and itemized invoice totals.
                  </p>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500 font-mono">Format: .CSV</span>
                  <a
                    href={`/api/v1/integrations/exports?type=tax_report&startDate=${customStart}&endDate=${customEnd}&format=csv`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-purple-700 text-white hover:bg-purple-800 transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </a>
                </div>
              </div>

              {/* Card 3 */}
              <div className="p-5 rounded-2xl border border-border bg-surface flex flex-col justify-between space-y-4 hover:border-neutral-300 transition shadow-xs">
                <div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h4 className="font-bold text-sm text-foreground">Cost of Goods (COGS) & P&L</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Menu sales revenue vs recipe ingredient costs, total food cost, and itemized gross profit margins.
                  </p>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-[11px] text-neutral-500 font-mono">Format: .CSV</span>
                  <a
                    href={`/api/v1/integrations/exports?type=profit_loss&startDate=${customStart}&endDate=${customEnd}&format=csv`}
                    download
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download CSV
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DEVELOPER API & WEBHOOKS */}
      {activeTab === "developer" && (
        <div className="space-y-6">
          {/* One-time API Key reveal modal */}
          {generatedRawKey && (
            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-300 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>API Key Generated Successfully</span>
                </div>
                <button
                  onClick={() => setGeneratedRawKey(null)}
                  className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-emerald-800">
                Please copy your API key now. For security purposes, this secret key will <strong>never be shown again</strong>.
              </p>
              <div className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-emerald-200">
                <code className="flex-1 font-mono text-xs text-foreground select-all break-all">{generatedRawKey}</code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedRawKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="gap-1.5 cursor-pointer shrink-0"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? "Copied" : "Copy Key"}</span>
                </Button>
              </div>
            </div>
          )}

          {/* Section A: API Keys */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Tenant API Keys</h3>
                <p className="text-xs text-muted-foreground">
                  Programmatic Bearer tokens for connecting external POS hardware, self-ordering kiosks, and custom ERPs.
                </p>
              </div>
              {canManageKeys && (
                <Button size="sm" onClick={() => setShowNewKeyModal(true)} className="gap-1.5 cursor-pointer">
                  <Plus className="w-3.5 h-3.5" />
                  <span>Generate New API Key</span>
                </Button>
              )}
            </div>

            {apiKeys.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-xl">
                <Code className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No API keys created yet. Generate a key to begin using the REST API.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Key Name</th>
                      <th className="py-2.5 px-3">Token Prefix</th>
                      <th className="py-2.5 px-3">Scopes</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Last Used</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {apiKeys.map((key) => (
                      <tr key={key.id} className="hover:bg-neutral-50/50">
                        <td className="py-2.5 px-3 font-bold text-foreground">{key.name}</td>
                        <td className="py-2.5 px-3 font-mono text-neutral-600">{key.keyPrefix}••••••••</td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {key.scopes.map((s) => (
                              <span key={s} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-neutral-100 text-neutral-700 border border-neutral-200">
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {key.isActive ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">ACTIVE</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-200 text-neutral-600">REVOKED</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground">
                          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {key.isActive && canManageKeys && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevokeKey(key.id)}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-7 px-2 cursor-pointer"
                            >
                              Revoke
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section B: Outbound Webhooks */}
          <div className="bg-surface border border-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Outbound Webhooks</h3>
                <p className="text-xs text-muted-foreground">
                  Stream real-time restaurant events to Zapier, Make, Discord, or your internal accounting endpoints.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowDeliveriesDrawer(true)} className="gap-1 cursor-pointer">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Delivery History ({deliveries.length})</span>
                </Button>
                {canManage && (
                  <Button size="sm" onClick={() => setShowNewWebhookModal(true)} className="gap-1.5 cursor-pointer">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Register Webhook</span>
                  </Button>
                )}
              </div>
            </div>

            {webhooks.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-xl">
                <Radio className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No webhook endpoints registered yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {webhooks.map((wh) => (
                  <div key={wh.id} className="p-4 rounded-xl border border-border bg-surface hover:border-neutral-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{wh.name}</span>
                        {wh.isActive ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">LIVE</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-200 text-neutral-600">PAUSED</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{wh.url}</div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {wh.events.map((ev) => (
                          <span key={ev} className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary font-semibold">
                            {ev}
                          </span>
                        ))}
                      </div>
                      <div className="text-[11px] text-neutral-400 font-mono">
                        HMAC Signature Secret: <span className="text-neutral-600 font-bold">{wh.secretRedacted}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePingWebhook(wh.id)}
                        className="gap-1 text-xs cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        <span>Send Ping</span>
                      </Button>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteWebhook(wh.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs h-8 px-2.5 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Generate API Key */}
      {showNewKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground">Generate New API Key</h3>
              <button onClick={() => setShowNewKeyModal(false)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Key Name / Client Identifier</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. POS Terminal 1 or QuickBooks Sync"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Permission Scopes</label>
                <div className="space-y-2">
                  {[
                    { id: "orders:read", label: "orders:read", desc: "Read recent orders and settlement status" },
                    { id: "menu:read", label: "menu:read", desc: "Synchronize menu items and categories" },
                    { id: "inventory:read", label: "inventory:read", desc: "Access stock counts and low stock warnings" },
                    { id: "analytics:read", label: "analytics:read", desc: "Query sales summaries and metrics" },
                  ].map((s) => (
                    <label key={s.id} className="flex items-start gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-neutral-50">
                      <input
                        type="checkbox"
                        checked={newKeyScopes.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) setNewKeyScopes([...newKeyScopes, s.id]);
                          else setNewKeyScopes(newKeyScopes.filter((x) => x !== s.id));
                        }}
                        className="mt-0.5 rounded text-primary"
                      />
                      <div>
                        <div className="text-xs font-bold font-mono text-foreground">{s.label}</div>
                        <div className="text-[11px] text-muted-foreground">{s.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Expiration Period</label>
                <select
                  value={newKeyExpiry}
                  onChange={(e) => setNewKeyExpiry(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface"
                >
                  <option value="30">30 Days</option>
                  <option value="90">90 Days (Recommended)</option>
                  <option value="365">1 Year</option>
                  <option value="">Never Expires</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowNewKeyModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleGenerateKey} disabled={!newKeyName.trim() || newKeyScopes.length === 0}>
                Create Key
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Register Webhook */}
      {showNewWebhookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-base text-foreground">Register Outgoing Webhook</h3>
              <button onClick={() => setShowNewWebhookModal(false)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Webhook Name</label>
                <input
                  type="text"
                  value={webhookName}
                  onChange={(e) => setWebhookName(e.target.value)}
                  placeholder="e.g. Accounting Sync or Zapier Orders"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">Destination URL (HTTP/HTTPS)</label>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://api.yourdomain.com/webhooks/orders"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface font-mono"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Localhost and private network IP ranges are strictly blocked for security.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1.5">Subscribed Events</label>
                <div className="space-y-1.5">
                  {[
                    "order.created",
                    "order.status_changed",
                    "payment.completed",
                    "inventory.low_stock",
                  ].map((ev) => (
                    <label key={ev} className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={webhookEvents.includes(ev)}
                        onChange={(e) => {
                          if (e.target.checked) setWebhookEvents([...webhookEvents, ev]);
                          else setWebhookEvents(webhookEvents.filter((x) => x !== ev));
                        }}
                        className="rounded text-primary"
                      />
                      <span className="font-mono text-neutral-800">{ev}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setShowNewWebhookModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleCreateWebhook} disabled={!webhookName || !webhookUrl || webhookEvents.length === 0}>
                Register Webhook
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer / Modal: Delivery History */}
      {showDeliveriesDrawer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-surface border border-border w-full max-w-2xl rounded-2xl p-6 shadow-2xl flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">Recent Webhook Deliveries</h3>
              </div>
              <button onClick={() => setShowDeliveriesDrawer(false)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3">
              {deliveries.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No webhook delivery logs recorded yet.</p>
              ) : (
                deliveries.map((del) => (
                  <div key={del.id} className="p-3.5 rounded-xl border border-border bg-neutral-50/50 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-foreground">{del.event}</span>
                        {del.status === "SUCCESS" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            HTTP {del.responseCode} OK
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800">
                            {del.responseCode ? `HTTP ${del.responseCode}` : "FAILED"}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {del.durationMs}ms • {new Date(del.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    {del.errorSummary && (
                      <p className="text-[11px] text-red-700 font-medium">Error: {del.errorSummary}</p>
                    )}
                    {del.payloadSummary && (
                      <div className="text-[10px] bg-white p-2 rounded border border-neutral-200 font-mono text-neutral-600 truncate">
                        {del.payloadSummary}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-border flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowDeliveriesDrawer(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
