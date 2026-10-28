"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Plus,
  Edit,
  QrCode,
  Archive,
  Grid2X2,
  Users,
  ExternalLink,
  Clock,
  Search,
  CheckCircle2,
  Coffee,
  Receipt,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActiveOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  createdAt: string;
}

interface Table {
  id: string;
  name: string;
  number: string | null;
  description: string | null;
  capacity: number | null;
  status: string;
  qrCodes?: { token: string }[];
  orders?: ActiveOrder[];
}

export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedSection, setSelectedSection] = useState<string>("ALL");

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      const res = await fetch("/api/v1/tables");
      if (!res.ok) throw new Error("Failed to fetch tables");
      const data = await res.json();
      setTables(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (id: string) => {
    if (!confirm("Are you sure you want to archive this table?")) return;
    try {
      const res = await fetch(`/api/v1/tables/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });
      if (!res.ok) throw new Error("Failed to archive table");
      fetchTables();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // Helper to extract or infer section (e.g., from description or name)
  const getTableSection = (table: Table): string => {
    if (table.description && table.description.trim()) {
      return table.description.trim();
    }
    const lower = table.name.toLowerCase();
    if (lower.includes("patio") || lower.includes("outdoor")) return "Patio";
    if (lower.includes("roof") || lower.includes("terrace")) return "Rooftop";
    if (lower.includes("bar")) return "Bar";
    return "Main Dining";
  };

  // Collect available sections dynamically
  const sections = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t) => set.add(getTableSection(t)));
    return ["ALL", ...Array.from(set)];
  }, [tables]);

  // Filtered tables based on search and section
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      const matchesSearch =
        search === "" ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        (t.number && t.number.includes(search));

      const section = getTableSection(t);
      const matchesSection = selectedSection === "ALL" || section === selectedSection;

      return matchesSearch && matchesSection;
    });
  }, [tables, search, selectedSection]);

  // Aggregate stats
  const totalCapacity = useMemo(
    () => tables.reduce((sum, t) => sum + (t.capacity || 2), 0),
    [tables]
  );
  const occupiedCount = useMemo(
    () => tables.filter((t) => t.orders && t.orders.length > 0).length,
    [tables]
  );
  const vacantCount = tables.length - occupiedCount;

  if (loading) {
    return (
      <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
        <UtensilsCrossed className="w-8 h-8 animate-spin text-primary opacity-60" />
        <p className="text-sm font-medium">Loading restaurant floor plan...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-destructive bg-destructive/10 border border-destructive/20 rounded-2xl">
        <p className="font-bold">{error}</p>
        <Button variant="outline" className="mt-4" onClick={() => fetchTables()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
            Floor Plan & Tables
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Real-time table occupancy, section seating, and contactless QR ordering tokens.
          </p>
        </div>
        <Link href="/dashboard/tables/new" className="w-full sm:w-auto">
          <Button className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/95 text-white font-bold shadow-sm">
            <Plus className="w-4 h-4" />
            Add New Table
          </Button>
        </Link>
      </div>

      {/* Real-time Floor Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface border border-border rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Tables
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-foreground">
              {tables.length}
            </span>
            <span className="text-xs text-muted-foreground">in floor plan</span>
          </div>
        </div>

        <div className="bg-surface border border-emerald-200/80 rounded-2xl p-4 shadow-xs bg-emerald-500/5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
            Available Tables
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-emerald-700">
              {vacantCount}
            </span>
            <span className="text-xs text-emerald-600 font-semibold">Ready to seat</span>
          </div>
        </div>

        <div className="bg-surface border border-amber-200/80 rounded-2xl p-4 shadow-xs bg-amber-500/5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
            Occupied / Seated
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-amber-700">
              {occupiedCount}
            </span>
            <span className="text-xs text-amber-600 font-semibold">Active orders</span>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-2xl p-4 shadow-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Total Capacity
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-foreground">
              {totalCapacity}
            </span>
            <span className="text-xs text-muted-foreground">guests maximum</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-surface p-3 rounded-2xl border border-border shadow-xs">
        {/* Section Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 md:pb-0">
          {sections.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSection(sec)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedSection === sec
                  ? "bg-primary text-white shadow-xs"
                  : "bg-surface-muted text-muted-foreground hover:bg-neutral-200/70"
              }`}
            >
              {sec === "ALL" ? "All Sections" : sec}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search table name/no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-surface-muted border border-border text-xs rounded-xl pl-9 pr-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
      </div>

      {/* Table Cards Grid */}
      {filteredTables.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary mb-4">
            <Grid2X2 className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold mb-2">No matching tables</h3>
          <p className="text-muted-foreground mb-6 max-w-sm text-sm">
            {search || selectedSection !== "ALL"
              ? "No tables matched your filter. Try selecting 'All Sections' or clearing your search."
              : "Add your first table to start managing seating and generating QR codes."}
          </p>
          <Link href="/dashboard/tables/new">
            <Button className="gap-2 bg-primary text-white">
              <Plus className="w-4 h-4" />
              Add Table
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTables.map((table) => {
            const qrToken = table.qrCodes && table.qrCodes[0]?.token;
            const activeOrder = table.orders && table.orders[0];
            const isOccupied = !!activeOrder;
            const section = getTableSection(table);

            return (
              <div
                key={table.id}
                className={`bg-surface rounded-2xl border transition-all duration-200 flex flex-col justify-between p-5 shadow-xs hover:shadow-md ${
                  isOccupied
                    ? "border-amber-300/80 bg-gradient-to-b from-amber-500/5 to-surface"
                    : "border-border hover:border-neutral-300"
                }`}
              >
                <div>
                  {/* Card Header: Table name + Section + Status Pill */}
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-lg text-foreground">
                          {table.name}
                        </h3>
                        {table.number && (
                          <span className="text-xs font-mono font-bold text-muted-foreground bg-surface-muted px-1.5 py-0.5 rounded-md">
                            #{table.number}
                          </span>
                        )}
                      </div>
                      <span className="inline-block mt-1 text-[11px] font-semibold text-muted-foreground">
                        📍 {section}
                      </span>
                    </div>

                    {/* Live Occupancy Status Badge */}
                    <div
                      className={`px-2.5 py-1 text-xs font-black rounded-full flex items-center gap-1.5 shrink-0 ${
                        isOccupied
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-emerald-100 text-emerald-900 border border-emerald-300"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOccupied ? "bg-amber-500 animate-pulse" : "bg-emerald-500"
                        }`}
                      />
                      <span>{isOccupied ? "Occupied" : "Available"}</span>
                    </div>
                  </div>

                  {/* Active Order Details or Seating Info */}
                  <div className="my-3 p-3 rounded-xl bg-surface-muted/60 border border-neutral-100 text-xs space-y-1.5">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Users className="w-3.5 h-3.5" /> Seating Capacity
                      </span>
                      <span className="font-bold text-foreground">
                        {table.capacity || 2} Persons
                      </span>
                    </div>

                    {isOccupied && activeOrder && (
                      <div className="pt-1.5 border-t border-border flex items-center justify-between">
                        <span className="font-bold text-amber-800 flex items-center gap-1">
                          <Receipt className="w-3.5 h-3.5 text-amber-600" />
                          #{activeOrder.orderNumber}
                        </span>
                        <span className="font-black text-amber-900 font-mono">
                          ₹{Number(activeOrder.total).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="flex items-center gap-2 pt-3 border-t border-border mt-2">
                  {/* View QR Button */}
                  <Link href={`/dashboard/tables/${table.id}/qr`} className="flex-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1.5 text-xs font-bold text-neutral-800 hover:text-primary hover:border-primary/50"
                    >
                      <QrCode className="w-3.5 h-3.5 text-primary" />
                      QR Code
                    </Button>
                  </Link>

                  {/* 1-Click Live Customer View Link */}
                  {qrToken && (
                    <a
                      href={`/q/${qrToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg border border-border hover:bg-primary/5 hover:border-primary/50 hover:text-primary text-muted-foreground transition cursor-pointer"
                      title="Open Live Table Ordering in new tab"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}

                  {/* Edit */}
                  <Link href={`/dashboard/tables/${table.id}/edit`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-2 text-muted-foreground hover:text-foreground"
                      title="Edit Table"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  </Link>

                  {/* Archive */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Archive Table"
                    onClick={() => handleArchive(table.id)}
                  >
                    <Archive className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
