"use client";

import { useState } from "react";
import { 
  Smartphone, 
  ShoppingCart, 
  LayoutDashboard, 
  Plus, 
  Minus, 
  Clock, 
  CheckCircle, 
  ChefHat 
} from "lucide-react";
import { Section } from "@/components/ui/section";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

export function ProductPreview() {
  const [activeTab, setActiveTab] = useState<"menu" | "cart" | "dashboard">("menu");

  return (
    <Section id="product-preview" className="bg-surface-muted py-24">
      <Container>
        <SectionHeading 
          badge="Product Preview"
          title="See the Product in Action"
          subtitle="Explore how the platform looks for both customers and restaurant staff."
          align="center"
        />

        <div className="mt-16 flex flex-col items-center">
          {/* Tabs */}
          <div className="flex flex-wrap justify-center gap-2 p-1 bg-surface border border-border rounded-xl shadow-sm mb-12">
            <button
              onClick={() => setActiveTab("menu")}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "menu" 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
              }`}
              aria-pressed={activeTab === "menu"}
            >
              <Smartphone className="w-4 h-4" />
              Customer Menu
            </button>
            <button
              onClick={() => setActiveTab("cart")}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "cart" 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
              }`}
              aria-pressed={activeTab === "cart"}
            >
              <ShoppingCart className="w-4 h-4" />
              Cart & Order
            </button>
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "dashboard" 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-muted"
              }`}
              aria-pressed={activeTab === "dashboard"}
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
          </div>

          {/* Previews */}
          <div className="w-full max-w-4xl flex justify-center">
            {activeTab === "menu" && <CustomerMenuPreview />}
            {activeTab === "cart" && <CartPreview />}
            {activeTab === "dashboard" && <DashboardPreview />}
          </div>
        </div>
      </Container>
    </Section>
  );
}

function CustomerMenuPreview() {
  return (
    <div className="relative w-full max-w-sm mx-auto bg-background rounded-[2.5rem] border-[8px] border-secondary overflow-hidden shadow-2xl aspect-[9/19] flex flex-col">
      {/* Notch simulation */}
      <div className="absolute top-0 inset-x-0 h-6 bg-secondary rounded-b-xl w-32 mx-auto z-10" />
      
      {/* Demo Label */}
      <div className="bg-warning text-foreground text-[10px] font-bold uppercase tracking-wider text-center py-1 absolute top-6 inset-x-0 z-10 opacity-90">
        Demo Preview
      </div>

      <div className="flex-1 overflow-y-auto pt-14 pb-6 px-4 no-scrollbar">
        <header className="mb-6">
          <h3 className="text-2xl font-bold text-foreground">Sample Restaurant</h3>
          <p className="text-sm text-muted-foreground">Italian & Mediterranean</p>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar">
          <span className="px-4 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-full whitespace-nowrap">Starters</span>
          <span className="px-4 py-1.5 bg-surface text-foreground border border-border text-sm font-medium rounded-full whitespace-nowrap">Main Course</span>
          <span className="px-4 py-1.5 bg-surface text-foreground border border-border text-sm font-medium rounded-full whitespace-nowrap">Beverages</span>
        </div>

        <div className="space-y-4">
          <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col gap-3">
            <div>
              <h4 className="font-semibold text-foreground">Margherita Pizza</h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Fresh tomatoes, mozzarella, basil, and extra virgin olive oil.</p>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="font-bold text-foreground">$14.00</span>
              <button className="w-8 h-8 flex items-center justify-center bg-surface-muted hover:bg-primary hover:text-primary-foreground text-foreground rounded-full transition-colors" aria-label="Add to cart">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col gap-3">
            <div>
              <h4 className="font-semibold text-foreground">Caesar Salad</h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Crisp romaine lettuce, parmesan cheese, croutons, and classic Caesar dressing.</p>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="font-bold text-foreground">$11.50</span>
              <button className="w-8 h-8 flex items-center justify-center bg-surface-muted hover:bg-primary hover:text-primary-foreground text-foreground rounded-full transition-colors" aria-label="Add to cart">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="bg-surface p-4 rounded-2xl border border-border shadow-sm flex flex-col gap-3">
            <div>
              <h4 className="font-semibold text-foreground">Grilled Chicken</h4>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Tender grilled chicken breast served with seasonal roasted vegetables.</p>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="font-bold text-foreground">$18.00</span>
              <button className="w-8 h-8 flex items-center justify-center bg-surface-muted hover:bg-primary hover:text-primary-foreground text-foreground rounded-full transition-colors" aria-label="Add to cart">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Bottom Nav Bar */}
      <div className="bg-surface border-t border-border p-4 flex justify-between items-center z-10">
        <div className="flex flex-col items-center text-primary">
          <Smartphone className="w-5 h-5 mb-1" />
          <span className="text-[10px] font-medium">Menu</span>
        </div>
        <div className="flex flex-col items-center text-muted-foreground hover:text-foreground">
          <div className="relative">
            <ShoppingCart className="w-5 h-5 mb-1" />
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">2</span>
          </div>
          <span className="text-[10px] font-medium">Cart</span>
        </div>
      </div>
    </div>
  );
}

function CartPreview() {
  return (
    <div className="relative w-full max-w-sm mx-auto bg-background rounded-[2.5rem] border-[8px] border-secondary overflow-hidden shadow-2xl aspect-[9/19] flex flex-col">
      {/* Notch simulation */}
      <div className="absolute top-0 inset-x-0 h-6 bg-secondary rounded-b-xl w-32 mx-auto z-10" />
      
      {/* Demo Label */}
      <div className="bg-warning text-foreground text-[10px] font-bold uppercase tracking-wider text-center py-1 absolute top-6 inset-x-0 z-10 opacity-90">
        Demo Preview
      </div>

      <div className="flex-1 overflow-y-auto pt-14 pb-6 px-4 no-scrollbar flex flex-col">
        <header className="mb-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-surface-muted flex items-center justify-center">
            <ShoppingCart className="w-4 h-4 text-foreground" />
          </div>
          <h3 className="text-xl font-bold text-foreground">Your Cart</h3>
        </header>

        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3 bg-surface p-3 rounded-xl border border-border">
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-foreground">Margherita Pizza</h4>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">$14.00</p>
            </div>
            <div className="flex items-center gap-2 bg-surface-muted p-1 rounded-lg">
              <button className="w-6 h-6 flex items-center justify-center text-foreground bg-surface rounded shadow-sm" aria-label="Decrease quantity"><Minus className="w-3 h-3" /></button>
              <span className="text-sm font-medium w-4 text-center">1</span>
              <button className="w-6 h-6 flex items-center justify-center text-foreground bg-surface rounded shadow-sm" aria-label="Increase quantity"><Plus className="w-3 h-3" /></button>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-surface p-3 rounded-xl border border-border">
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-foreground">Caesar Salad</h4>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">$11.50</p>
            </div>
            <div className="flex items-center gap-2 bg-surface-muted p-1 rounded-lg">
              <button className="w-6 h-6 flex items-center justify-center text-foreground bg-surface rounded shadow-sm" aria-label="Decrease quantity"><Minus className="w-3 h-3" /></button>
              <span className="text-sm font-medium w-4 text-center">1</span>
              <button className="w-6 h-6 flex items-center justify-center text-foreground bg-surface rounded shadow-sm" aria-label="Increase quantity"><Plus className="w-3 h-3" /></button>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3 bg-surface p-4 rounded-xl border border-border">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium text-foreground">$25.50</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Tax</span>
            <span className="font-medium text-foreground">$2.04</span>
          </div>
          <div className="pt-3 border-t border-border flex justify-between">
            <span className="font-bold text-foreground">Total</span>
            <span className="font-bold text-foreground">$27.54</span>
          </div>
        </div>
      </div>
      
      {/* Checkout Button Bar */}
      <div className="bg-surface border-t border-border p-4 z-10">
        <button className="w-full py-3.5 bg-primary text-primary-foreground font-semibold rounded-xl shadow-md hover:bg-primary/90 transition-colors">
          Place Order
        </button>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="w-full bg-background rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col">
      {/* Browser/App Header */}
      <div className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-danger/80"></div>
            <div className="w-3 h-3 rounded-full bg-warning/80"></div>
            <div className="w-3 h-3 rounded-full bg-success/80"></div>
          </div>
          <span className="ml-4 text-sm font-medium text-muted-foreground">Order Dashboard</span>
        </div>
        <div className="bg-warning text-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
          Demo Preview
        </div>
      </div>

      <div className="flex-1 p-6 md:p-8 bg-surface-muted overflow-auto">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-2xl font-bold text-foreground">Live Orders</h3>
            <p className="text-sm text-muted-foreground mt-1">Manage incoming orders and kitchen status.</p>
          </div>
          <div className="flex gap-2">
            <span className="px-3 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-lg border border-primary/20">3 Active</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Order 1 */}
          <div className="bg-surface rounded-xl border border-border p-5 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-lg font-bold text-foreground">#1001</span>
                <p className="text-xs text-muted-foreground mt-0.5">Table 5</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                <Clock className="w-3 h-3" /> New
              </span>
            </div>
            <div className="flex-1 border-t border-b border-border py-3 mb-4">
              <p className="text-sm text-foreground">2 Items</p>
              <ul className="mt-2 space-y-1">
                <li className="text-xs text-muted-foreground">1x Margherita Pizza</li>
                <li className="text-xs text-muted-foreground">1x Garlic Bread</li>
              </ul>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span className="text-xs font-medium text-muted-foreground">2 min ago</span>
              <button className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors">
                Accept
              </button>
            </div>
          </div>

          {/* Order 2 */}
          <div className="bg-surface rounded-xl border border-border p-5 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-lg font-bold text-foreground">#1002</span>
                <p className="text-xs text-muted-foreground mt-0.5">Table 3</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-warning/10 text-warning">
                <ChefHat className="w-3 h-3" /> Preparing
              </span>
            </div>
            <div className="flex-1 border-t border-b border-border py-3 mb-4">
              <p className="text-sm text-foreground">1 Item</p>
              <ul className="mt-2 space-y-1">
                <li className="text-xs text-muted-foreground">1x Grilled Chicken</li>
              </ul>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span className="text-xs font-medium text-muted-foreground">5 min ago</span>
              <button className="px-4 py-2 bg-success text-white text-sm font-medium rounded-lg hover:bg-success/90 transition-colors flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> Mark Ready
              </button>
            </div>
          </div>

          {/* Order 3 */}
          <div className="bg-surface rounded-xl border border-border p-5 shadow-sm flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-lg font-bold text-foreground">#1003</span>
                <p className="text-xs text-muted-foreground mt-0.5">Table 7</p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-success/10 text-success">
                <CheckCircle className="w-3 h-3" /> Ready
              </span>
            </div>
            <div className="flex-1 border-t border-b border-border py-3 mb-4">
              <p className="text-sm text-foreground">3 Items</p>
              <ul className="mt-2 space-y-1">
                <li className="text-xs text-muted-foreground">2x Caesar Salad</li>
                <li className="text-xs text-muted-foreground">1x Iced Tea</li>
              </ul>
            </div>
            <div className="flex items-center justify-between mt-auto">
              <span className="text-xs font-medium text-muted-foreground">12 min ago</span>
              <button className="px-4 py-2 bg-surface border border-border text-foreground text-sm font-medium rounded-lg hover:bg-surface-muted transition-colors">
                View Details
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
