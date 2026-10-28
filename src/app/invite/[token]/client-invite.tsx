"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, CheckCircle2, AlertCircle, Loader2, ArrowRight, ShieldCheck, Lock, User, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface InvitationData {
  email: string;
  role: string;
  roleTitle: string;
  roleDescription: string;
  restaurant: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
  userExists: boolean;
  userName: string | null;
}

export function ClientInviteAccept({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [data, setData] = useState<InvitationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      try {
        setLoading(true);
        const res = await fetch(`/api/v1/staff/invitations/verify?token=${encodeURIComponent(token)}`);
        const json = await res.json();
        if (res.ok && json.valid) {
          setData(json.invitation);
          if (json.invitation.userName) {
            setName(json.invitation.userName);
          }
        } else {
          setError(json.error || "Invalid or expired invitation link.");
        }
      } catch {
        setError("Unable to connect to the server. Please check your internet connection.");
      } finally {
        setLoading(false);
      }
    }
    verify();
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!data?.userExists && (!name.trim() || name.trim().length < 2)) {
      setFormError("Please enter your full name.");
      return;
    }

    if (!password || password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/v1/staff/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim() || undefined,
          password,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        // Redirect into restaurant dashboard
        router.push(json.redirectUrl || "/dashboard");
        router.refresh();
      } else {
        setFormError(json.error || "Failed to accept invitation. Please try again.");
      }
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="w-full max-w-md bg-surface p-8 rounded-2xl border border-border shadow-md text-center flex flex-col items-center">
        <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
        <h2 className="text-lg font-bold text-foreground">Verifying Invitation...</h2>
        <p className="text-xs text-muted-foreground mt-1">Checking secure credentials...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="w-full max-w-md bg-surface p-8 rounded-2xl border border-border shadow-md text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-foreground">Invitation Unavailable</h2>
        <p className="text-sm text-muted-foreground mt-2">{error || "This invitation link is not valid or has expired."}</p>
        <Button className="mt-6 w-full" onClick={() => router.push("/login")}>
          Return to Login
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-surface p-6 sm:p-8 rounded-2xl border border-border shadow-lg">
      {/* Restaurant Header */}
      <div className="text-center pb-6 border-b border-border">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 shadow-xs">
          <Store className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black text-foreground">{data.restaurant.name}</h1>
        <p className="text-xs font-semibold text-muted-foreground mt-0.5">Staff Portal Invitation</p>
      </div>

      {/* Role Banner */}
      <div className="my-5 p-3.5 bg-surface-muted rounded-xl border border-border flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground">Assigned Role:</span>
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-primary text-white">
              {data.roleTitle}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {data.roleDescription}
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleAccept} className="space-y-4">
        <div>
          <Label className="text-xs font-bold text-foreground">Invited Email</Label>
          <Input
            value={data.email}
            disabled
            className="mt-1 bg-surface-muted text-muted-foreground font-mono text-xs cursor-not-allowed"
          />
        </div>

        {!data.userExists && (
          <div>
            <Label htmlFor="name" className="text-xs font-bold text-foreground">Full Name *</Label>
            <div className="relative mt-1">
              <User className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                id="name"
                type="text"
                required
                placeholder="e.g. John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                className="pl-9 text-sm"
              />
            </div>
          </div>
        )}

        <div>
          <Label htmlFor="password" className="text-xs font-bold text-foreground">
            {data.userExists ? "Account Password *" : "Choose Password *"}
          </Label>
          <div className="relative mt-1">
            <Lock className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              id="password"
              type="password"
              required
              placeholder={data.userExists ? "Enter your current password" : "At least 6 characters"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={submitting}
              className="pl-9 text-sm"
            />
          </div>
          {data.userExists && (
            <p className="text-[11px] text-muted-foreground mt-1">
              An account already exists for this email. Enter your password to verify your identity.
            </p>
          )}
        </div>

        {formError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs font-medium flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={submitting}
          className="w-full h-11 text-sm font-bold gap-2 mt-2 shadow-sm"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Joining Restaurant...
            </>
          ) : (
            <>
              Accept Invitation & Join Team
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
