"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, QrCode, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QRCodeSVG } from "qrcode.react";

export default function TableQRCodePage() {
  const params = useParams();
  const id = params?.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState<{ id: string, name: string } | null>(null);
  const [qrData, setQrData] = useState<{ id: string, token: string, url: string } | null>(null);
  
  const qrRef = useRef<SVGSVGElement>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch table details
      const tablesRes = await fetch(`/api/v1/tables`);
      if (!tablesRes.ok) throw new Error("Failed to fetch tables");
      const tables = await tablesRes.json();
      const currentTable = tables.find((t: { id: string, name: string }) => t.id === id);
      if (!currentTable) throw new Error("Table not found");
      setTable(currentTable);

      // Fetch QR Code for table
      const qrRes = await fetch(`/api/v1/tables/${id}/qr`);
      if (qrRes.ok) {
        const qr = await qrRes.json();
        setQrData(qr);
      } else if (qrRes.status !== 404) {
        throw new Error("Failed to fetch QR code");
      } else {
        setQrData(null); // No QR exists yet
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const generateQRCode = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/tables/${id}/qr`, {
        method: "POST",
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate QR code");
      }
      const data = await res.json();
      setQrData(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadQRCode = () => {
    if (!qrRef.current || !table) return;
    const svg = qrRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `table-${table.name.replace(/\s+/g, '-').toLowerCase()}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading QR Data...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/tables">
          <Button variant="ghost" size="sm" className="rounded-full w-9 h-9 p-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            QR Code {table ? `- ${table.name}` : ""}
          </h1>
          <p className="text-muted-foreground text-sm">
            Digital menu access for this table.
          </p>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-xl p-4 sm:p-8 shadow-sm flex flex-col items-center">
        {error && (
          <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-6 w-full max-w-md text-center">
            {error}
          </div>
        )}

        {!qrData ? (
          <div className="text-center py-8 sm:py-12">
            <div className="w-16 sm:w-20 h-16 sm:h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto mb-4 sm:mb-6">
              <QrCode className="w-8 sm:w-10 h-8 sm:h-10" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold mb-2">No QR Code Generated</h3>
            <p className="text-muted-foreground mb-6 sm:mb-8 max-w-sm mx-auto text-xs sm:text-sm">
              Generate a unique QR code for this table so customers can scan and view the digital menu.
            </p>
            <Button onClick={generateQRCode} disabled={isGenerating} size="lg" className="w-full sm:w-auto gap-2">
              {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
              {isGenerating ? "Generating..." : "Generate QR Code"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2 sm:py-4 w-full">
            <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 mb-6 sm:mb-8 max-w-full flex items-center justify-center">
              <QRCodeSVG
                value={qrData.url}
                size={240}
                level="Q"
                includeMargin={true}
                className="w-48 h-48 sm:w-60 sm:h-60 max-w-full h-auto"
                ref={qrRef}
              />
            </div>
            
            <div className="flex flex-col items-center mb-6 sm:mb-8 w-full max-w-md px-2">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Scan URL</p>
              <a href={qrData.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs sm:text-sm break-all text-center">
                {qrData.url}
              </a>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 w-full sm:w-auto">
              <Button onClick={downloadQRCode} className="w-full sm:w-auto gap-2">
                <Download className="w-4 h-4" />
                Download SVG
              </Button>
              <Button onClick={generateQRCode} disabled={isGenerating} variant="outline" className="w-full sm:w-auto gap-2">
                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {isGenerating ? "Regenerating..." : "Regenerate QR"}
              </Button>
            </div>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-4 text-center px-2">
              Note: Regenerating will invalidate the previous QR code for this table.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
