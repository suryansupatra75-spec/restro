"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";

export default function OnboardingPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/v1/onboarding/restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create restaurant");
      }

      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-center text-3xl">Setup your restaurant</CardTitle>
            <CardDescription className="text-center">
              Let&apos;s get started by setting up your primary location.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-danger/15 text-danger text-sm p-3 rounded-md border border-danger/20">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Restaurant Name *</Label>
                  <Input id="name" name="name" value={formData.name} onChange={handleChange} required disabled={loading} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} required disabled={loading} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Business Email (Optional)</Label>
                  <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} disabled={loading} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Street Address *</Label>
                  <Input id="address" name="address" value={formData.address} onChange={handleChange} required disabled={loading} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">City *</Label>
                  <Input id="city" name="city" value={formData.city} onChange={handleChange} required disabled={loading} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">State/Province *</Label>
                  <Input id="state" name="state" value={formData.state} onChange={handleChange} required disabled={loading} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country *</Label>
                  <Input id="country" name="country" value={formData.country} onChange={handleChange} required disabled={loading} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pincode">Postal / Zip Code *</Label>
                  <Input id="pincode" name="pincode" value={formData.pincode} onChange={handleChange} required disabled={loading} />
                </div>
              </div>
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Creating restaurant..." : "Complete Setup"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
