/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  UtensilsCrossed, ShoppingCart, Plus, Minus, Check, ArrowLeft,
  ArrowRight, Loader2, Trash2, CreditCard, Banknote, ShieldCheck,
  AlertCircle, Search, X, Clock, ChefHat, Bell, CircleCheck,
  Package, Leaf, Heart, Info, StickyNote, Tag, Gift, Sparkles, Award, Receipt,
  Users
} from "lucide-react";
import { useCart } from "@/components/customer/cart-context";
import { CallWaiterDock } from "@/components/customer/call-waiter-dock";
import { GoogleReviewCard } from "@/components/customer/google-review-card";
import { ScratchWinCard } from "@/components/customer/scratch-win-card";
import { LiveCookingTracker } from "@/components/customer/live-cooking-tracker";
import { SplitBillModal } from "@/components/customer/split-bill-modal";
import { ChefsPairings } from "@/components/customer/chefs-pairings";
import { playCelebrationChime, triggerCanvasConfetti } from "@/lib/celebration";

/* ─────────────────────── TYPES ─────────────────────── */

interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayInstance { open: () => void; }

interface Variant { id: string; name: string; price: number; isAvailable: boolean; }
interface Addon { id: string; name: string; price: number; isAvailable: boolean; }
interface MenuItem {
  id: string; name: string; description: string | null; imageUrl: string | null;
  price: number; isAvailable: boolean; isVegetarian: boolean; isVegan: boolean;
  variants: Variant[]; addons: Addon[];
}
interface MenuCategory {
  id: string; name: string; description: string | null; items: MenuItem[];
}
interface Restaurant {
  id: string; name: string; description: string | null; logoUrl: string | null;
  coverImageUrl: string | null; currency: string; taxPercentage: number | null;
  accentColor?: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
  closedDays?: string[];
  isOrderingEnabled?: boolean;
  customerNotice?: string | null;
  allowSpecialInstructions?: boolean;
  googleReviewUrl?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
}
interface Table { name: string; }

interface CustomerMenuProps {
  restaurant: Restaurant;
  table: Table;
  categories: MenuCategory[];
  token: string;
}

interface TrackedOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  receiptToken?: string | null;
  total: number;
  createdAt: string;
  items: { name: string; quantity: number; variant: { name: string } | null; addons: { name: string }[] }[];
}

type Screen = "welcome" | "menu" | "item-detail" | "cart" | "checkout" | "success" | "order-tracking";

const DEFAULT_COVER = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80";

/* ───────────────────────────────────────────────────── */
/*                    MAIN COMPONENT                     */
/* ───────────────────────────────────────────────────── */

export function CustomerMenu({ restaurant, table, categories, token }: CustomerMenuProps) {
  const {
    items: cartItems, addItem, removeItem, updateQuantity,
    clearCart, getItemQuantity, updateQuantityByMenuItem,
    subtotal, tax, total
  } = useCart();

  const isOrderingEnabled = restaurant.isOrderingEnabled !== false;
  const allowSpecialInstructions = restaurant.allowSpecialInstructions !== false;
  const brandStyle = useMemo(
    () =>
      ({
        "--color-primary": restaurant.accentColor || "#E85D2A",
      }) as React.CSSProperties,
    [restaurant.accentColor]
  );

  /* ───── Navigation State ───── */
  const [screen, setScreen] = useState<Screen>("welcome");
  const [activeCategory, setActiveCategory] = useState("all");
  const [dietaryFilter, setDietaryFilter] = useState<"ALL" | "VEG" | "NON_VEG" | "VEGAN">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* ───── Item Detail State ───── */
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Set<string>>(new Set());
  const [itemQty, setItemQty] = useState(1);
  const [specialNote, setSpecialNote] = useState("");

  /* ───── Checkout & Customer Details ───── */
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "CASH">("ONLINE");
  const [createdOrder, setCreatedOrder] = useState<{ id: string; orderNumber: string; total: number } | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"IDLE" | "PROCESSING" | "VERIFYING" | "PAID" | "FAILED" | "PENDING">("IDLE");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [showSimulatedModal, setShowSimulatedModal] = useState<{
    paymentId: string; orderId: string; providerOrderId: string; amount: number;
  } | null>(null);

  /* ───── Coupon & Promotion State ───── */
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    name: string;
    discountAmount: number;
    discountType: string;
    discountValue: number;
    discountedSubtotal: number;
    tax: number;
    total: number;
  } | null>(null);

  /* ───── Loyalty & Retention State ───── */
  const [loyaltySummary, setLoyaltySummary] = useState<{
    pointsBalance: number;
    program: {
      isEnabled: boolean;
      pointsPerDollar: number;
      redemptionRate: number;
      minRedeemPoints: number;
      maxRedeemPointsPerOrder: number;
      redemptionStep: number;
    } | null;
    eligibleRewards: {
      id: string;
      name: string;
      rewardType: string;
      pointsCost: number;
      discountAmount: number | null;
      discountPercent: number | null;
    }[];
  } | null>(null);
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);
  const [loyaltyError, setLoyaltyError] = useState<string | null>(null);
  const [redeemPoints, setRedeemPoints] = useState<number>(0);
  const [selectedRewardId, setSelectedRewardId] = useState<string | null>(null);

  /* ───── Order Tracking ───── */
  const [trackedOrder, setTrackedOrder] = useState<TrackedOrder | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const trackingInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ───── Helpers ───── */
  const fmt = useCallback((price: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: restaurant.currency || "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price), [restaurant.currency]);

  const cartCount = cartItems.reduce((a, i) => a + i.quantity, 0);

  const allItems = useMemo(() => categories.flatMap(c => c.items), [categories]);
  const displayedItems = useMemo(() => {
    let list = activeCategory === "all"
      ? allItems
      : categories.find(c => c.id === activeCategory)?.items || [];

    if (dietaryFilter === "VEG") {
      list = list.filter(item => item.isVegetarian);
    } else if (dietaryFilter === "NON_VEG") {
      list = list.filter(item => !item.isVegetarian);
    } else if (dietaryFilter === "VEGAN") {
      list = list.filter(item => item.isVegan);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(item =>
        item.name.toLowerCase().includes(q) ||
        (item.description && item.description.toLowerCase().includes(q))
      );
    }
    return list;
  }, [activeCategory, allItems, categories, searchQuery, dietaryFilter]);

  const suggestedPairings = useMemo(() => {
    if (!detailItem) return [];
    return allItems
      .filter((i) => i.id !== detailItem.id && i.isAvailable)
      .slice(0, 2);
  }, [detailItem, allItems]);

  /* ───── Open Item Detail ───── */
  const openItemDetail = (item: MenuItem) => {
    if (!item.isAvailable) return;
    setDetailItem(item);
    setSelectedVariant(item.variants.length > 0 ? (item.variants.find(v => v.isAvailable) || null) : null);
    setSelectedAddons(new Set());
    setItemQty(1);
    setSpecialNote("");
    setScreen("item-detail");
  };

  /* ───── Apply / Remove Coupon ───── */
  const handleApplyCoupon = async (codeOverride?: string) => {
    const raw = codeOverride || couponInput;
    const cleanCode = raw.trim().toUpperCase();
    if (!cleanCode) {
      setCouponError("Please enter a coupon code");
      return;
    }
    if (cartItems.length === 0) {
      setCouponError("Your cart is empty");
      return;
    }

    setCouponLoading(true);
    setCouponError(null);

    try {
      const res = await fetch("/api/v1/promotions/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          code: cleanCode,
          customerPhone: guestPhone.trim() || undefined,
          customerEmail: guestEmail.trim() || undefined,
          items: cartItems.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            variantId: item.variant?.id,
            addonIds: item.addons.map((a) => a.id),
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.valid) {
        throw new Error(data.error || "Invalid coupon code");
      }

      setAppliedCoupon({
        code: data.promotion.code,
        name: data.promotion.name,
        discountAmount: data.pricing.discountAmount,
        discountType: data.promotion.discountType,
        discountValue: data.promotion.discountValue,
        discountedSubtotal: data.pricing.discountedSubtotal,
        tax: data.pricing.tax,
        total: data.pricing.total,
      });
      setCouponInput(data.promotion.code);
    } catch (err: unknown) {
      setAppliedCoupon(null);
      setCouponError(err instanceof Error ? err.message : "Failed to apply coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError(null);
  };

  /* ───── Lookup Loyalty ───── */
  const handleLookupLoyalty = useCallback(async (phoneOverride?: string, emailOverride?: string) => {
    const ph = (phoneOverride !== undefined ? phoneOverride : guestPhone).trim();
    const em = (emailOverride !== undefined ? emailOverride : guestEmail).trim();
    if (!ph && !em) {
      setLoyaltyError("Please provide a phone number or email to look up your rewards.");
      return;
    }

    setLoyaltyLoading(true);
    setLoyaltyError(null);
    try {
      const res = await fetch("/api/v1/loyalty/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          phone: ph || undefined,
          email: em || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not fetch loyalty details");
      }
      setLoyaltySummary(data);
    } catch (err) {
      setLoyaltyError(err instanceof Error ? err.message : "Loyalty lookup failed");
    } finally {
      setLoyaltyLoading(false);
    }
  }, [guestPhone, guestEmail, token]);

  /* ───── Computed Loyalty Discount & Cart Net ───── */
  const loyaltyDiscount = useMemo(() => {
    if (!loyaltySummary?.program?.isEnabled) return 0;
    const netAfterCoupon = Math.max(0, subtotal - (appliedCoupon?.discountAmount || 0));

    // If specific reward is chosen
    if (selectedRewardId) {
      const rw = loyaltySummary.eligibleRewards?.find((r) => r.id === selectedRewardId);
      if (rw) {
        if (rw.rewardType === "DISCOUNT_FIXED") {
          return Math.min(rw.discountAmount || 0, netAfterCoupon);
        }
        if (rw.rewardType === "DISCOUNT_PERCENT") {
          const disc = netAfterCoupon * ((rw.discountPercent || 0) / 100);
          return Math.min(disc, netAfterCoupon);
        }
      }
    }

    // Direct points redemption
    if (redeemPoints > 0) {
      const rate = loyaltySummary.program.redemptionRate || 100;
      const val = redeemPoints / rate;
      return Math.min(val, netAfterCoupon);
    }

    return 0;
  }, [loyaltySummary, selectedRewardId, redeemPoints, subtotal, appliedCoupon]);

  const effectiveSubtotal = useMemo(() => {
    return Math.max(0, subtotal - (appliedCoupon?.discountAmount || 0) - loyaltyDiscount);
  }, [subtotal, appliedCoupon, loyaltyDiscount]);

  const effectiveTax = useMemo(() => {
    const taxRate = restaurant.taxPercentage && restaurant.taxPercentage > 0 ? restaurant.taxPercentage : 0;
    return (effectiveSubtotal * taxRate) / 100;
  }, [effectiveSubtotal, restaurant.taxPercentage]);

  const effectiveTotal = useMemo(() => {
    return effectiveSubtotal + effectiveTax;
  }, [effectiveSubtotal, effectiveTax]);

  const estimatedPointsToEarn = useMemo(() => {
    if (!loyaltySummary?.program?.isEnabled) return 0;
    const rate = loyaltySummary.program.pointsPerDollar || 1;
    return Math.floor(effectiveSubtotal * rate);
  }, [loyaltySummary, effectiveSubtotal]);

  /* ───── Add to Cart ───── */
  const handleAddToCart = () => {
    if (!detailItem) return;
    const addons = detailItem.addons.filter(a => selectedAddons.has(a.id)).map(a => ({
      id: a.id, name: a.name, price: a.price
    }));
    addItem({
      menuItemId: detailItem.id,
      name: detailItem.name,
      basePrice: detailItem.price,
      quantity: itemQty,
      variant: selectedVariant ? { id: selectedVariant.id, name: selectedVariant.name, price: selectedVariant.price } : null,
      addons,
      specialInstructions: specialNote,
    });
    setScreen("menu");
    setDetailItem(null);
  };

  /* ───── Quick Add (no customization needed) ───── */
  const quickAdd = (item: MenuItem) => {
    if (item.variants.length > 0 || item.addons.length > 0) {
      openItemDetail(item);
      return;
    }
    addItem({
      menuItemId: item.id,
      name: item.name,
      basePrice: item.price,
      quantity: 1,
      variant: null,
      addons: [],
      specialInstructions: "",
    });
  };

  /* ───── Computed Detail Price ───── */
  const detailTotalPrice = useMemo(() => {
    if (!detailItem) return 0;
    const base = detailItem.price;
    const variantAdd = selectedVariant ? selectedVariant.price : 0;
    const addonsAdd = detailItem.addons
      .filter(a => selectedAddons.has(a.id))
      .reduce((s, a) => s + a.price, 0);
    return (base + variantAdd + addonsAdd) * itemQty;
  }, [detailItem, selectedVariant, selectedAddons, itemQty]);

  /* ───── Order Tracking ───── */
  const fetchOrderStatus = useCallback(async (orderId: string) => {
    try {
      const res = await fetch(`/api/v1/orders/track?token=${token}&orderId=${orderId}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTrackedOrder(data.order);
        setTrackingError(null);
        // Stop polling if order has reached a final terminal status
        if (
          data.order.status === "COMPLETED" ||
          data.order.status === "CANCELLED" ||
          data.order.status === "REJECTED"
        ) {
          if (trackingInterval.current) {
            clearInterval(trackingInterval.current);
            trackingInterval.current = null;
          }
        }
      } else {
        setTrackingError(data.error || "Could not fetch order status");
      }
    } catch {
      setTrackingError("Network error. Check your connection.");
    }
  }, [token]);

  const startTracking = useCallback((orderId: string, skipInitialFetch = false) => {
    if (!skipInitialFetch) {
      fetchOrderStatus(orderId);
    }
    if (trackingInterval.current) clearInterval(trackingInterval.current);
    trackingInterval.current = setInterval(() => fetchOrderStatus(orderId), 4500);
  }, [fetchOrderStatus]);

  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("restaurant-live-orders");
        channel.onmessage = (event) => {
          const msg = event.data;
          if (!msg || !msg.orderId) return;
          setTrackedOrder(curr => {
            if (!curr || curr.id !== msg.orderId) return curr;
            const nextStatus = msg.status || curr.status;
            const nextPayment = msg.paymentStatus || curr.paymentStatus;
            return { ...curr, status: nextStatus, paymentStatus: nextPayment };
          });
          fetchOrderStatus(msg.orderId);
        };
      }
    } catch {
      // Ignore BroadcastChannel errors
    }

    return () => {
      if (trackingInterval.current) clearInterval(trackingInterval.current);
      if (channel) channel.close();
    };
  }, [fetchOrderStatus]);

  const broadcastOrderPlaced = (orderId: string) => {
    try {
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("restaurant-live-orders");
        bc.postMessage({ type: "ORDER_CREATED", orderId, ts: Date.now() });
        bc.close();
      }
    } catch {
      // Ignore
    }
  };

  /* ───── Place Order (Payment) ───── */
  const handlePlaceOrder = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setOrderError(null);

    try {
      let currentOrder = createdOrder;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let inlinePayment: any = null;
      let prePopulatedTracked = false;

      if (!currentOrder) {
        const payload = {
          token,
          customerName: guestName.trim() || undefined,
          customerPhone: guestPhone.trim() || undefined,
          customerEmail: guestEmail.trim() || undefined,
          paymentMethod,
          couponCode: appliedCoupon ? appliedCoupon.code : undefined,
          loyaltyPointsToRedeem: redeemPoints > 0 ? redeemPoints : undefined,
          loyaltyRewardId: selectedRewardId || undefined,
          idempotencyKey: `ord_${token.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          items: cartItems.map(item => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            variantId: item.variant?.id,
            addonIds: item.addons.map(a => a.id),
            specialInstructions: item.specialInstructions || undefined
          })),
          specialInstructions: ""
        };

        const res = await fetch("/api/v1/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to place order");

        currentOrder = data.order;
        inlinePayment = data.payment || null;
        setCreatedOrder(data.order);
        setOrderNumber(data.order.orderNumber);
        if (data.order?.items) {
          setTrackedOrder({
            id: data.order.id,
            orderNumber: data.order.orderNumber,
            status: data.order.status || "PENDING",
            paymentStatus: data.order.paymentStatus || "UNPAID",
            total: data.order.total,
            createdAt: data.order.createdAt || new Date().toISOString(),
            items: data.order.items,
          });
          prePopulatedTracked = true;
        }
        broadcastOrderPlaced(data.order.id);
      }

      if (!currentOrder) throw new Error("Unable to create order");

      // CASH
      if (paymentMethod === "CASH") {
        if (!inlinePayment) {
          const payRes = await fetch("/api/v1/payments/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: currentOrder.id, token, method: "CASH" }),
          });
          const payData = await payRes.json();
          if (!payRes.ok) throw new Error(payData.error || "Failed to record cash payment");
        }

        setPaymentStatus("PENDING");
        clearCart();
        setActiveScreen_Success(currentOrder.id, prePopulatedTracked);
        return;
      }

      // ONLINE
      setPaymentStatus("PROCESSING");
      let payment = inlinePayment;
      if (!payment) {
        const payRes = await fetch("/api/v1/payments/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: currentOrder.id, token, method: "ONLINE" }),
        });
        const payData = await payRes.json();
        if (!payRes.ok) throw new Error(payData.error || "Failed to initiate online payment");
        payment = payData.payment;
      }

      const winWithRzp = window as unknown as { Razorpay?: new (opts: unknown) => RazorpayInstance };
      let rzpLoaded = typeof winWithRzp.Razorpay !== "undefined";
      if (!rzpLoaded && !payment.isMockProvider) {
        try {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.async = true;
          await new Promise<void>((resolve, reject) => {
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Failed to load script"));
            document.body.appendChild(script);
          });
          rzpLoaded = typeof winWithRzp.Razorpay !== "undefined";
        } catch (e) {
          console.warn("Could not load Razorpay script:", e);
        }
      }

      if (rzpLoaded && !payment.isMockProvider && winWithRzp.Razorpay) {
        const RazorpayClass = winWithRzp.Razorpay;
        const options = {
          key: payment.keyId,
          amount: Math.round(currentOrder.total * 100),
          currency: restaurant.currency || "INR",
          name: restaurant.name,
          description: `Order ${currentOrder.orderNumber}`,
          order_id: payment.providerOrderId,
          handler: async function (response: RazorpaySuccessResponse) {
            setPaymentStatus("VERIFYING");
            try {
              const verifyRes = await fetch("/api/v1/payments/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  orderId: currentOrder.id,
                  paymentId: payment.paymentId,
                  token,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyRes.ok && verifyData.success) {
                setPaymentStatus("PAID");
                setTrackedOrder(curr => curr ? { ...curr, paymentStatus: "PAID" } : curr);
                broadcastOrderPlaced(currentOrder.id);
                clearCart();
                setActiveScreen_Success(currentOrder.id, prePopulatedTracked);
              } else {
                setPaymentStatus("FAILED");
                setOrderError(verifyData.error || "Payment verification failed");
              }
            } catch (err: unknown) {
              setPaymentStatus("FAILED");
              setOrderError(err instanceof Error ? err.message : "Network error verifying payment");
            }
          },
          modal: {
            ondismiss: function () {
              setPaymentStatus("PENDING");
              setOrderError("Payment dismissed. You can retry below.");
            },
          },
        };
        const rzp = new RazorpayClass(options);
        rzp.open();
      } else {
        // Dev/Test simulator
        setShowSimulatedModal({
          paymentId: payment.paymentId,
          orderId: currentOrder.id,
          providerOrderId: payment.providerOrderId || "order_simulated",
          amount: currentOrder.total,
        });
      }
    } catch (err: unknown) {
      setOrderError(err instanceof Error ? err.message : "An unexpected error occurred");
      setPaymentStatus("FAILED");
    } finally {
      setIsSubmitting(false);
    }
  };

  const setActiveScreen_Success = (orderId: string, skipInitialFetch = false) => {
    try {
      playCelebrationChime();
      triggerCanvasConfetti();
    } catch {
      // Audio or canvas fallback
    }
    setScreen("success");
    // Start tracking the order automatically
    startTracking(orderId, skipInitialFetch);
  };

  const handleSimulatePayment = async (shouldSucceed: boolean) => {
    if (!showSimulatedModal || !createdOrder) return;
    setIsSubmitting(true);
    setPaymentStatus("VERIFYING");

    try {
      const razorpay_order_id = showSimulatedModal.providerOrderId;
      const razorpay_payment_id = `pay_sim_${Date.now()}`;

      let razorpay_signature = "invalid_signature_test";
      if (shouldSucceed) {
        const signRes = await fetch("/api/v1/payments/test-sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ razorpayOrderId: razorpay_order_id, razorpayPaymentId: razorpay_payment_id }),
        });
        const signData = await signRes.json();
        razorpay_signature = signData.signature;
      }

      const verifyRes = await fetch("/api/v1/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: showSimulatedModal.orderId,
          paymentId: showSimulatedModal.paymentId,
          token,
          razorpay_order_id,
          razorpay_payment_id,
          razorpay_signature,
        }),
      });

      const verifyData = await verifyRes.json();
      setShowSimulatedModal(null);

      if (verifyRes.ok && verifyData.success) {
        setPaymentStatus("PAID");
        setTrackedOrder(curr => curr ? { ...curr, paymentStatus: "PAID" } : curr);
        broadcastOrderPlaced(createdOrder.id);
        clearCart();
        setActiveScreen_Success(createdOrder.id, Boolean(trackedOrder));
      } else {
        setPaymentStatus("FAILED");
        setOrderError(verifyData.error || "Payment verification failed");
      }
    } catch (err: unknown) {
      setPaymentStatus("FAILED");
      setOrderError(err instanceof Error ? err.message : "Failed to process test payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ═══════════════════════════════════════════════════════
     SCREEN: WELCOME
     ═══════════════════════════════════════════════════════ */
  if (screen === "welcome") {
    const cover = restaurant.coverImageUrl || DEFAULT_COVER;
    return (
      <div style={brandStyle} className="min-h-[100dvh] max-w-md mx-auto bg-black flex flex-col relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <img src={cover} alt="" className="w-full h-full object-cover brightness-[0.4]" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/90" />
        </div>

        {/* Content */}
        <div className="relative z-10 flex-1 flex flex-col justify-between px-6 pt-safe">
          {/* Top */}
          <div className="pt-14 text-center">
            {restaurant.logoUrl ? (
              <img src={restaurant.logoUrl} alt={restaurant.name}
                className="w-20 h-20 rounded-2xl shadow-2xl mx-auto mb-4 object-cover ring-2 ring-white/20" />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-white/10 backdrop-blur-xl flex items-center justify-center mx-auto mb-4 ring-2 ring-white/20">
                <UtensilsCrossed className="w-10 h-10 text-white" />
              </div>
            )}
            <h1 className="text-3xl font-black text-white tracking-tight">{restaurant.name}</h1>
            <p className="text-white/60 text-sm mt-2 max-w-[280px] mx-auto leading-relaxed">
              {restaurant.description || "Scan. Browse. Order. Enjoy."}
            </p>
            {(restaurant.openingTime && restaurant.closingTime) && (
              <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-white/80 text-[11px] font-medium">
                <Clock className="w-3 h-3" />
                <span>Hours: {restaurant.openingTime} – {restaurant.closingTime}</span>
              </div>
            )}
          </div>

          {/* Bottom */}
          <div className="pb-10 space-y-4">
            {(!isOrderingEnabled || restaurant.customerNotice) && (
              <div className={`px-4 py-3 rounded-2xl border backdrop-blur-xl text-center text-xs font-medium ${
                !isOrderingEnabled
                  ? "bg-amber-500/20 border-amber-400/30 text-amber-100"
                  : "bg-white/10 border-white/15 text-white/90"
              }`}>
                {!isOrderingEnabled && (
                  <p className="font-bold text-amber-300 mb-0.5">Ordering Temporarily Paused</p>
                )}
                {restaurant.customerNotice && <p>{restaurant.customerNotice}</p>}
              </div>
            )}

            {/* Table badge */}
            <div className="flex justify-center">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl px-4 py-2 rounded-full border border-white/10">
                <div className={`w-2 h-2 rounded-full ${isOrderingEnabled ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                <span className="text-white/90 text-xs font-semibold">Table {table.name} • Dine In</span>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => setScreen("menu")}
              className="w-full py-4 text-base font-bold bg-white text-neutral-900 rounded-2xl shadow-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
            >
              <span>View Menu</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Feature badges */}
            <div className="flex justify-center gap-6 text-white/50 text-[10px] font-medium">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Fast Order</span>
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Secure Pay</span>
              <span className="flex items-center gap-1"><Bell className="w-3 h-3" /> Live Track</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     SCREEN: MENU  (Swiggy/Zomato-style listing)
     ═══════════════════════════════════════════════════════ */
  if (screen === "menu") {
    return (
      <div style={brandStyle} className="min-h-[100dvh] max-w-md mx-auto bg-neutral-50 flex flex-col relative">
        {/* ─── Sticky Header ─── */}
        <div className="sticky top-0 z-30 bg-white border-b border-neutral-100 shadow-sm">
          {/* Top bar */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setScreen("welcome")}
                className="p-1.5 -ml-1 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5 text-neutral-700" />
              </button>
              <div className="min-w-0">
                <h1 className="font-bold text-[15px] text-neutral-900 truncate">{restaurant.name}</h1>
                <p className="text-[11px] text-neutral-400 font-medium">
                  Table {table.name}
                  {restaurant.openingTime && restaurant.closingTime ? ` • ${restaurant.openingTime}–${restaurant.closingTime}` : ""}
                </p>
              </div>
            </div>
            {cartCount > 0 ? (
              <button
                onClick={() => setScreen("cart")}
                className="flex items-center gap-1.5 bg-primary hover:bg-primary/95 text-white px-3 py-1.5 rounded-full font-black text-xs shadow-md active:scale-95 transition cursor-pointer shrink-0 animate-in fade-in"
                aria-label="View Cart"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Cart ({cartCount})</span>
              </button>
            ) : (
              <button
                onClick={() => setScreen("cart")}
                className="relative p-2.5 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
                aria-label="Cart"
              >
                <ShoppingCart className="w-5 h-5 text-neutral-700" />
              </button>
            )}
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search for dishes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-neutral-100 text-sm rounded-xl pl-10 pr-9 py-2.5 text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all border border-transparent focus:border-primary/20"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); searchInputRef.current?.focus(); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
            <CategoryPill active={activeCategory === "all"} onClick={() => setActiveCategory("all")}>
              All
            </CategoryPill>
            {categories.map(cat => (
              <CategoryPill key={cat.id} active={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)}>
                {cat.name}
              </CategoryPill>
            ))}
          </div>

          {/* Dietary Filter Pills */}
          <div className="px-4 pb-2.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setDietaryFilter("ALL")}
              className={`px-3 py-1 rounded-xl border transition cursor-pointer shrink-0 ${
                dietaryFilter === "ALL"
                  ? "bg-neutral-900 text-white border-neutral-900 shadow-xs"
                  : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setDietaryFilter("VEG")}
              className={`px-3 py-1 rounded-xl border transition cursor-pointer shrink-0 flex items-center gap-1 ${
                dietaryFilter === "VEG"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                  : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              }`}
            >
              <Leaf className="w-3 h-3" />
              <span>Veg Only</span>
            </button>
            <button
              type="button"
              onClick={() => setDietaryFilter("NON_VEG")}
              className={`px-3 py-1 rounded-xl border transition cursor-pointer shrink-0 flex items-center gap-1 ${
                dietaryFilter === "NON_VEG"
                  ? "bg-rose-600 text-white border-rose-600 shadow-xs"
                  : "bg-white text-rose-700 border-rose-200 hover:bg-rose-50"
              }`}
            >
              <span>🥩 Non-Veg</span>
            </button>
            <button
              type="button"
              onClick={() => setDietaryFilter("VEGAN")}
              className={`px-3 py-1 rounded-xl border transition cursor-pointer shrink-0 flex items-center gap-1 ${
                dietaryFilter === "VEGAN"
                  ? "bg-green-700 text-white border-green-700 shadow-xs"
                  : "bg-white text-green-700 border-green-200 hover:bg-green-50"
              }`}
            >
              <Heart className="w-3 h-3" />
              <span>Vegan</span>
            </button>
          </div>
        </div>

        {/* ─── Menu Items ─── */}
        <div className="flex-1 px-4 py-3 pb-28">
          {(!isOrderingEnabled || restaurant.customerNotice) && (
            <div className={`mb-3.5 p-3 rounded-2xl border text-xs flex items-start gap-2.5 ${
              !isOrderingEnabled
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-blue-50 border-blue-200 text-blue-800"
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                {!isOrderingEnabled && (
                  <p className="font-bold">Online ordering is currently paused</p>
                )}
                {restaurant.customerNotice && (
                  <p className={!isOrderingEnabled ? "mt-0.5" : "font-medium"}>{restaurant.customerNotice}</p>
                )}
              </div>
            </div>
          )}
          {displayedItems.length === 0 ? (
            <div className="text-center py-20">
              <Search className="w-12 h-12 mx-auto text-neutral-200 mb-3" />
              <p className="text-sm font-semibold text-neutral-500">No dishes found</p>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="mt-3 text-xs text-primary font-bold cursor-pointer hover:underline"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3.5">
              {displayedItems.map(item => {
                const qty = getItemQuantity(item.id);
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-2xl border border-neutral-200/90 p-3.5 shadow-xs transition-all ${
                      !item.isAvailable ? "opacity-50 grayscale-[0.4]" : ""
                    }`}
                  >
                    {/* Top Row: Details on Left + Image on Right */}
                    <div className="flex gap-3 items-start">
                      {/* Left: Text Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {item.isVegetarian && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                              <Leaf className="w-2.5 h-2.5" /> Veg
                            </span>
                          )}
                          {item.isVegan && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded">
                              <Heart className="w-2.5 h-2.5" /> Vegan
                            </span>
                          )}
                          {(item.variants.length > 0 || item.addons.length > 0) && (
                            <span className="text-[10px] text-neutral-500 bg-neutral-100 font-semibold px-1.5 py-0.5 rounded">
                              Customisable
                            </span>
                          )}
                        </div>

                        <h3
                          onClick={() => openItemDetail(item)}
                          className="font-bold text-[15px] text-neutral-900 leading-snug line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                        >
                          {item.name}
                        </h3>
                        {item.description && (
                          <p className="text-xs text-neutral-500 line-clamp-2 mt-1 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                        <p className="font-black text-base text-neutral-900 mt-2">
                          {fmt(item.price)}
                        </p>
                      </div>

                      {/* Right: Dish Photo (Tap to inspect) */}
                      <div
                        onClick={() => openItemDetail(item)}
                        className="relative shrink-0 w-24 h-24 rounded-2xl overflow-hidden bg-neutral-100 cursor-pointer shadow-2xs border border-neutral-100 group"
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-neutral-300">
                            <UtensilsCrossed className="w-8 h-8" />
                          </div>
                        )}
                        {qty > 0 && (
                          <div className="absolute top-1.5 right-1.5 bg-primary text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md">
                            {qty}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Action Row: Fully Contained, Never Clips or Overlaps Boundaries */}
                    <div className="flex items-center justify-between pt-3 mt-2.5 border-t border-neutral-100">
                      <button
                        onClick={() => openItemDetail(item)}
                        className="text-xs text-primary font-bold hover:underline flex items-center gap-1 py-1 cursor-pointer"
                      >
                        <Info className="w-3.5 h-3.5" />
                        <span>View Details</span>
                      </button>

                      <div>
                        {item.isAvailable ? (
                          qty > 0 ? (
                            <div className="flex items-center bg-primary/10 border-2 border-primary rounded-xl overflow-hidden shadow-2xs">
                              <button
                                onClick={(e) => { e.stopPropagation(); updateQuantityByMenuItem(item.id, -1); }}
                                className="w-9 h-8 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="w-3.5 h-3.5 stroke-[3]" />
                              </button>
                              <span className="w-7 text-center font-black text-xs text-primary">{qty}</span>
                              <button
                                onClick={(e) => { e.stopPropagation(); quickAdd(item); }}
                                className="w-9 h-8 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition cursor-pointer"
                                aria-label="Increase quantity"
                              >
                                <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); quickAdd(item); }}
                              className="bg-primary hover:bg-primary/95 text-white font-extrabold text-xs px-5 py-2 rounded-xl shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                              <span>ADD</span>
                            </button>
                          )
                        ) : (
                          <span className="bg-neutral-100 text-neutral-400 text-[11px] font-bold px-3 py-1.5 rounded-lg">
                            SOLD OUT
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* IN-FLOW CART SUMMARY CARD — Guaranteed visible by scrolling on ANY phone or emulator */}
              {cartCount > 0 && (
                <div className="mt-5 mb-2 p-4 bg-white rounded-2xl border-2 border-primary/25 shadow-md space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-neutral-500 font-medium">{cartCount} {cartCount === 1 ? "item" : "items"} in cart</p>
                      <p className="text-xl font-black text-neutral-900">{fmt(subtotal)}</p>
                    </div>
                    <span className="text-[11px] font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                      Ready to order
                    </span>
                  </div>
                  <button
                    onClick={() => setScreen("cart")}
                    className="w-full py-3.5 bg-primary hover:bg-primary/95 text-white font-black text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 active:scale-98 transition cursor-pointer"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    <span>View Cart & Place Order</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ─── Floating Sticky Cart Bar ─── */}
        {cartCount > 0 && (
          <div className="sticky bottom-3 left-0 right-0 z-40 px-4 mt-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <button
              onClick={() => setScreen("cart")}
              className="w-full bg-primary hover:bg-primary/95 text-white font-bold py-3.5 px-5 rounded-2xl shadow-[0_8px_30px_rgba(232,93,42,0.45)] flex items-center justify-between active:scale-[0.98] transition-all cursor-pointer border border-white/20"
            >
              <div className="flex items-center gap-2">
                <span className="bg-white/20 text-white text-xs font-black px-2.5 py-0.5 rounded-full">
                  {cartCount} {cartCount === 1 ? "item" : "items"}
                </span>
                <span className="text-sm font-extrabold">{fmt(subtotal)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider">
                <span>View Cart</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        )}

        {/* Floating Call Waiter Dock */}
        <CallWaiterDock
          token={token}
          tableName={table.name}
          restaurantName={restaurant.name}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     SCREEN: ITEM DETAIL (Full-page view)
     ═══════════════════════════════════════════════════════ */
  if (screen === "item-detail" && detailItem) {
    return (
      <div style={brandStyle} className="min-h-[100dvh] max-w-md mx-auto bg-white flex flex-col relative">
        {/* Hero Image */}
        <div className="relative w-full aspect-[4/3] bg-neutral-100 shrink-0">
          {detailItem.imageUrl ? (
            <img src={detailItem.imageUrl} alt={detailItem.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-300">
              <UtensilsCrossed className="w-16 h-16" />
            </div>
          )}
          {/* Back button */}
          <button
            onClick={() => { setScreen("menu"); setDetailItem(null); }}
            className="absolute top-4 left-4 w-10 h-10 bg-black/40 backdrop-blur-md text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-black/60 transition"
            aria-label="Back to menu"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {/* Cart icon */}
          <button
            onClick={() => setScreen("cart")}
            className="absolute top-4 right-4 w-10 h-10 bg-black/40 backdrop-blur-md text-white rounded-full flex items-center justify-center cursor-pointer hover:bg-black/60 transition relative"
            aria-label="Cart"
          >
            <ShoppingCart className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-white text-[9px] font-black w-[18px] h-[18px] rounded-full flex items-center justify-center shadow">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-32">
          <div className="p-5 space-y-5">
            {/* Title & Price */}
            <div>
              <div className="flex items-start gap-2 mb-1">
                {detailItem.isVegetarian && (
                  <span className="mt-1 shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                    <Leaf className="w-2.5 h-2.5" /> Veg
                  </span>
                )}
                {detailItem.isVegan && (
                  <span className="mt-1 shrink-0 inline-flex items-center gap-0.5 text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                    <Heart className="w-2.5 h-2.5" /> Vegan
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-black text-neutral-900 leading-tight">{detailItem.name}</h1>
              <p className="text-xl font-bold text-primary mt-1">{fmt(detailItem.price)}</p>
              {detailItem.description && (
                <p className="text-sm text-neutral-500 mt-3 leading-relaxed">{detailItem.description}</p>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-neutral-100" />

            {/* Variants */}
            {detailItem.variants.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm text-neutral-900">Choose Variant</h3>
                  <span className="text-[10px] bg-red-50 text-red-500 font-bold px-2 py-0.5 rounded">Required</span>
                </div>
                <div className="space-y-2">
                  {detailItem.variants.map(v => {
                    const sel = selectedVariant?.id === v.id;
                    return (
                      <button
                        key={v.id}
                        disabled={!v.isAvailable}
                        onClick={() => setSelectedVariant(v)}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                          sel ? "border-primary bg-primary/5" : "border-neutral-100 bg-white hover:border-primary/30"
                        } ${!v.isAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                            sel ? "border-primary bg-primary" : "border-neutral-300"
                          }`}>
                            {sel && <Check className="w-3 h-3 text-white stroke-[3]" />}
                          </div>
                          <span className="text-sm font-semibold text-neutral-800">{v.name}</span>
                        </div>
                        <span className="text-sm font-bold text-neutral-500">+{fmt(v.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add-ons */}
            {detailItem.addons.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-sm text-neutral-900">Extra Add-ons</h3>
                  <span className="text-[10px] bg-neutral-100 text-neutral-500 font-bold px-2 py-0.5 rounded">Optional</span>
                </div>
                <div className="space-y-2">
                  {detailItem.addons.map(a => {
                    const sel = selectedAddons.has(a.id);
                    return (
                      <button
                        key={a.id}
                        disabled={!a.isAvailable}
                        onClick={() => {
                          const ns = new Set(selectedAddons);
                          if (ns.has(a.id)) ns.delete(a.id); else ns.add(a.id);
                          setSelectedAddons(ns);
                        }}
                        className={`w-full flex items-center justify-between p-3.5 rounded-xl border-2 transition-all cursor-pointer ${
                          sel ? "border-primary bg-primary/5" : "border-neutral-100 bg-white hover:border-primary/30"
                        } ${!a.isAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${
                            sel ? "border-primary bg-primary" : "border-neutral-300"
                          }`}>
                            {sel && <Check className="w-3 h-3 text-white stroke-[3]" />}
                          </div>
                          <span className="text-sm font-semibold text-neutral-800">{a.name}</span>
                        </div>
                        <span className="text-sm font-bold text-neutral-500">+{fmt(a.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Special Instructions (Conditional on restaurant.allowSpecialInstructions) */}
            {allowSpecialInstructions && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <StickyNote className="w-4 h-4 text-neutral-400" />
                  <h3 className="font-bold text-sm text-neutral-900">Special Instructions</h3>
                </div>
                <textarea
                  placeholder="e.g. Less spicy, no onions, extra sauce..."
                  value={specialNote}
                  onChange={e => setSpecialNote(e.target.value)}
                  rows={2}
                  className="w-full bg-neutral-50 border border-neutral-200 text-sm rounded-xl p-3 text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 resize-none"
                />
              </div>
            )}

            {/* Smart Pairing Suggestions: "Pair It With..." */}
            {suggestedPairings.length > 0 && (
              <div className="pt-3 border-t border-neutral-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <h3 className="font-extrabold text-sm text-neutral-900">
                      Pair It With...
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    Recommended
                  </span>
                </div>
                <div className="space-y-2.5">
                  {suggestedPairings.map((pair) => (
                    <div
                      key={pair.id}
                      className="flex items-center justify-between p-2.5 rounded-2xl border border-neutral-200/90 bg-neutral-50/60"
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-2">
                        {pair.imageUrl ? (
                          <img
                            src={pair.imageUrl}
                            alt={pair.name}
                            className="w-12 h-12 rounded-xl object-cover border border-neutral-200 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-neutral-200 flex items-center justify-center text-neutral-400 shrink-0">
                            <UtensilsCrossed className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-neutral-900 truncate">
                            {pair.name}
                          </p>
                          <p className="text-xs font-extrabold text-primary">
                            {fmt(pair.price)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          addItem({
                            menuItemId: pair.id,
                            name: pair.name,
                            basePrice: pair.price,
                            quantity: 1,
                            variant:
                              pair.variants.length > 0
                                ? {
                                    id: pair.variants[0].id,
                                    name: pair.variants[0].name,
                                    price: pair.variants[0].price,
                                  }
                                : null,
                            addons: [],
                            specialInstructions: "",
                          });
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white border border-neutral-200 hover:border-primary text-primary hover:bg-primary hover:text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer shrink-0 shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* In-flow Add to Cart for guaranteed accessibility when scrolling */}
            <div className="pt-2">
              <button
                onClick={handleAddToCart}
                disabled={detailItem.variants.length > 0 && !selectedVariant}
                className="w-full bg-primary hover:bg-primary/90 text-white font-black h-13 rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-sm"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Add to Cart • {fmt(detailTotalPrice)}</span>
              </button>
            </div>
          </div>
        </div>

        {/* ─── Sticky Bottom Add to Cart Bar ─── */}
        <div className="sticky bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-neutral-100 p-3 px-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))] mt-auto">
          <div className="flex items-center gap-3">
            {/* Qty stepper */}
            <div className="flex items-center bg-neutral-100 rounded-xl p-1">
              <button
                onClick={() => setItemQty(Math.max(1, itemQty - 1))}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white text-neutral-700 transition cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-bold text-sm">{itemQty}</span>
              <button
                onClick={() => setItemQty(itemQty + 1)}
                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-white text-neutral-700 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Add to cart CTA */}
            <button
              onClick={handleAddToCart}
              disabled={detailItem.variants.length > 0 && !selectedVariant}
              className="flex-1 bg-primary hover:bg-primary/90 text-white font-bold h-12 rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-sm"
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Add to Cart</span>
              <span className="opacity-80">•</span>
              <span>{fmt(detailTotalPrice)}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     SCREEN: CART
     ═══════════════════════════════════════════════════════ */
  if (screen === "cart") {
    return (
      <div style={brandStyle} className="min-h-[100dvh] max-w-md mx-auto bg-neutral-50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white px-4 py-3.5 flex items-center gap-3 border-b border-neutral-100 shadow-sm">
          <button onClick={() => setScreen("menu")} className="p-1.5 -ml-1 rounded-xl hover:bg-neutral-100 transition cursor-pointer">
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </button>
          <h1 className="font-bold text-base text-neutral-900">Your Cart</h1>
          <span className="text-xs text-neutral-400 font-medium">({cartCount} {cartCount === 1 ? "item" : "items"})</span>
        </div>

        {cartItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mb-4">
              <ShoppingCart className="w-10 h-10 text-neutral-300" />
            </div>
            <h2 className="text-lg font-bold text-neutral-900 mb-1">Your cart is empty</h2>
            <p className="text-sm text-neutral-400 mb-6 max-w-[240px]">Browse the menu and add items to get started</p>
            <button
              onClick={() => setScreen("menu")}
              className="bg-primary text-white font-bold text-sm px-6 py-3 rounded-xl shadow cursor-pointer active:scale-95 transition"
            >
              Browse Menu
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-48">
              {/* Cart items */}
              {cartItems.map(item => (
                <div key={item.cartItemId} className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-bold text-sm text-neutral-900 truncate">{item.name}</h3>
                      </div>
                      {item.variant && <p className="text-[11px] text-neutral-400 mt-0.5">• {item.variant.name}</p>}
                      {item.addons.map(a => <p key={a.id} className="text-[11px] text-neutral-400">+ {a.name}</p>)}
                      {allowSpecialInstructions && item.specialInstructions && (
                        <p className="text-[10px] text-amber-600 mt-1 italic">&quot;{item.specialInstructions}&quot;</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeItem(item.cartItemId)}
                      className="p-2 text-neutral-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-3 border-t border-neutral-50">
                    <span className="font-extrabold text-sm text-neutral-900">{fmt(item.totalPrice)}</span>
                    <div className="flex items-center bg-neutral-100 rounded-lg overflow-hidden">
                      <button
                        onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-neutral-200 transition cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5 text-neutral-600" />
                      </button>
                      <span className="w-7 text-center font-bold text-xs text-neutral-900">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                        className="w-8 h-8 flex items-center justify-center hover:bg-neutral-200 transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-neutral-600" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Chef's Recommended Pairings Upsell in Cart */}
              <ChefsPairings
                categories={categories}
                onAddItem={(item) => {
                  addItem({
                    menuItemId: item.id,
                    name: item.name,
                    basePrice: item.price,
                    quantity: 1,
                    variant:
                      item.variants.length > 0
                        ? {
                            id: item.variants[0].id,
                            name: item.variants[0].name,
                            price: item.variants[0].price,
                          }
                        : null,
                    addons: [],
                    specialInstructions: "",
                  });
                }}
                currency={restaurant.currency}
                accentColor={restaurant.accentColor || "#E85D2A"}
                title="Complete Your Meal • Chef's Pairings"
              />

              {/* Offers & Coupons */}
              <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-700">
                    <Tag className="w-4 h-4 text-primary" />
                    <span>Offers & Coupons</span>
                  </div>
                  {appliedCoupon && (
                    <button
                      onClick={handleRemoveCoupon}
                      className="text-xs text-red-600 hover:text-red-700 font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>

                {appliedCoupon ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-emerald-800">
                        {appliedCoupon.code} Applied!
                      </p>
                      <p className="text-emerald-700 text-[11px]">
                        You save {fmt(appliedCoupon.discountAmount)} with {appliedCoupon.name}
                      </p>
                    </div>
                    <span className="font-extrabold text-emerald-700">
                      -{fmt(appliedCoupon.discountAmount)}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter coupon code"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        className="flex-1 text-xs px-3 py-2 rounded-xl border border-neutral-200 uppercase font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                      />
                      <button
                        type="button"
                        onClick={() => handleApplyCoupon()}
                        disabled={couponLoading || !couponInput.trim()}
                        className="px-4 py-2 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl shadow-xs disabled:opacity-50 cursor-pointer"
                      >
                        {couponLoading ? "Applying..." : "Apply"}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-xs text-red-600 font-medium">{couponError}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Bill summary */}
              <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
                <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider mb-3">Bill Summary</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-neutral-600">
                    <span>Item Total</span>
                    <span className="font-semibold text-neutral-900">{fmt(subtotal)}</span>
                  </div>
                  {appliedCoupon && appliedCoupon.discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-emerald-600 font-medium">
                      <span className="flex items-center gap-1">
                        <Tag className="w-3.5 h-3.5" /> Coupon ({appliedCoupon.code})
                      </span>
                      <span className="font-bold">-{fmt(appliedCoupon.discountAmount)}</span>
                    </div>
                  )}
                  {loyaltyDiscount > 0 && (
                    <div className="flex justify-between text-sm text-amber-600 font-medium">
                      <span className="flex items-center gap-1">
                        <Gift className="w-3.5 h-3.5" /> Loyalty Reward
                      </span>
                      <span className="font-bold">-{fmt(loyaltyDiscount)}</span>
                    </div>
                  )}
                  {restaurant.taxPercentage && restaurant.taxPercentage > 0 && (
                    <div className="flex justify-between text-sm text-neutral-600">
                      <span>GST & Taxes ({restaurant.taxPercentage}%)</span>
                      <span className="font-semibold text-neutral-900">
                        {fmt(effectiveTax)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-extrabold text-neutral-900 pt-2 border-t border-neutral-100">
                    <span>To Pay</span>
                    <span className="text-primary">
                      {fmt(effectiveTotal)}
                    </span>
                  </div>
                  <button
                    onClick={() => setScreen("checkout")}
                    className="w-full mt-4 bg-primary hover:bg-primary/95 text-white font-extrabold h-12 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all text-sm"
                  >
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsSplitModalOpen(true)}
                    className="w-full mt-2.5 py-2.5 px-3 rounded-xl border border-dashed border-neutral-300 hover:border-primary/60 bg-neutral-50/70 hover:bg-primary/5 text-neutral-700 hover:text-primary font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-primary" />
                    <span>Split the Bill & Tip with Friends</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Sticky CTA */}
            <div className="sticky bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-neutral-100 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-30 pb-[max(1rem,env(safe-area-inset-bottom))] mt-auto">
              <button
                onClick={() => setScreen("checkout")}
                className="w-full bg-primary text-white font-bold h-13 rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all text-sm"
              >
                <span>Proceed to Checkout</span>
                <span className="opacity-70">•</span>
                <span>{fmt(effectiveTotal)}</span>
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </>
        )}

        {/* Interactive Split Bill Modal */}
        <SplitBillModal
          isOpen={isSplitModalOpen}
          onClose={() => setIsSplitModalOpen(false)}
          subtotal={appliedCoupon ? appliedCoupon.discountedSubtotal : subtotal}
          tax={effectiveTax}
          total={effectiveTotal}
          currency={restaurant.currency}
          tableName={table.name}
          restaurantName={restaurant.name}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     SCREEN: CHECKOUT
     ═══════════════════════════════════════════════════════ */
  if (screen === "checkout") {
    return (
      <div style={brandStyle} className="min-h-[100dvh] max-w-md mx-auto bg-neutral-50 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white px-4 py-3.5 flex items-center gap-3 border-b border-neutral-100 shadow-sm">
          <button onClick={() => setScreen("cart")} className="p-1.5 -ml-1 rounded-xl hover:bg-neutral-100 transition cursor-pointer">
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </button>
          <h1 className="font-bold text-base text-neutral-900">Checkout</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
          {/* Restaurant + Table Info */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-4 flex items-center gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="w-11 h-11 bg-primary/10 text-primary rounded-xl flex items-center justify-center shrink-0">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-neutral-900">{restaurant.name}</p>
              <p className="text-xs text-neutral-400">Table {table.name} • Dine In</p>
            </div>
          </div>

          {!isOrderingEnabled && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3.5 rounded-2xl text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-bold">Online ordering is currently paused</p>
                <p className="mt-0.5 text-amber-700">
                  {restaurant.customerNotice || "Please speak with a member of our staff to place your order."}
                </p>
              </div>
            </div>
          )}

          {/* Order items summary */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider mb-3">Order Items</h4>
            <div className="space-y-2.5">
              {cartItems.map(item => (
                <div key={item.cartItemId} className="flex justify-between text-sm">
                  <div className="flex-1 pr-3 min-w-0">
                    <span className="font-medium text-neutral-800">{item.quantity}× {item.name}</span>
                    {(item.variant || item.addons.length > 0) && (
                      <p className="text-[11px] text-neutral-400 mt-0.5 truncate">
                        {[item.variant?.name, ...item.addons.map(a => a.name)].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <span className="font-bold text-neutral-900 shrink-0">{fmt(item.totalPrice)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100 space-y-1.5">
              <div className="flex justify-between text-sm text-neutral-500">
                <span>Subtotal</span><span>{fmt(subtotal)}</span>
              </div>
              {appliedCoupon && appliedCoupon.discountAmount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Coupon ({appliedCoupon.code})
                  </span>
                  <span className="font-bold">-{fmt(appliedCoupon.discountAmount)}</span>
                </div>
              )}
              {loyaltyDiscount > 0 && (
                <div className="flex justify-between text-sm text-amber-600 font-medium">
                  <span className="flex items-center gap-1">
                    <Gift className="w-3.5 h-3.5" /> Loyalty Reward
                  </span>
                  <span className="font-bold">-{fmt(loyaltyDiscount)}</span>
                </div>
              )}
              {restaurant.taxPercentage && restaurant.taxPercentage > 0 && (
                <div className="flex justify-between text-sm text-neutral-500">
                  <span>Tax ({restaurant.taxPercentage}%)</span>
                  <span>{fmt(effectiveTax)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-neutral-900 pt-1.5 border-t border-neutral-50">
                <span>Total</span>
                <span className="text-primary">{fmt(effectiveTotal)}</span>
              </div>
            </div>
          </div>

          {/* Customer Contact Details (Optional) */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider">Your Details</h4>
              <span className="text-[10px] text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full font-medium">Optional</span>
            </div>
            <div className="space-y-2.5">
              <div>
                <input
                  type="text"
                  placeholder="Your Name (e.g. Alex)"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  maxLength={50}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-neutral-50/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="tel"
                  placeholder="Phone number"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                  maxLength={20}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-neutral-50/50"
                />
                <input
                  type="email"
                  placeholder="Email address"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  maxLength={60}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition bg-neutral-50/50"
                />
              </div>
            </div>
          </div>

          {/* Loyalty & Rewards Section */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-amber-500" />
                <h4 className="font-bold text-xs text-neutral-800 uppercase tracking-wider">Loyalty & Rewards</h4>
              </div>
              {loyaltySummary ? (
                <button
                  type="button"
                  onClick={() => handleLookupLoyalty()}
                  disabled={loyaltyLoading}
                  className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                >
                  Refresh
                </button>
              ) : null}
            </div>

            {!loyaltySummary ? (
              <div className="bg-amber-500/5 rounded-xl p-3 border border-amber-500/20 space-y-2">
                <p className="text-xs text-neutral-600">
                  Enter your phone number or email above to check your reward points and member discounts.
                </p>
                <button
                  type="button"
                  onClick={() => handleLookupLoyalty()}
                  disabled={loyaltyLoading || (!guestPhone.trim() && !guestEmail.trim())}
                  className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 transition shadow-xs"
                >
                  {loyaltyLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking points...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" /> Check Points & Rewards
                    </>
                  )}
                </button>
                {loyaltyError && (
                  <p className="text-[11px] text-red-600 font-medium">{loyaltyError}</p>
                )}
              </div>
            ) : !loyaltySummary.program?.isEnabled ? (
              <p className="text-xs text-neutral-500 italic">
                Loyalty rewards program is currently inactive.
              </p>
            ) : (
              <div className="space-y-3">
                {/* Points balance banner */}
                <div className="flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-xl p-3">
                  <div>
                    <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-wider">Your Balance</span>
                    <p className="text-lg font-black text-amber-700">
                      {loyaltySummary.pointsBalance.toLocaleString()} <span className="text-xs font-semibold text-neutral-600">points</span>
                    </p>
                  </div>
                  {estimatedPointsToEarn > 0 && (
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Earning Today</span>
                      <p className="text-xs font-extrabold text-emerald-700">+{estimatedPointsToEarn} pts</p>
                    </div>
                  )}
                </div>

                {/* Redeem Rewards Options */}
                {loyaltySummary.pointsBalance >= (loyaltySummary.program.minRedeemPoints || 50) ? (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold text-neutral-700">Redeem Points on This Order:</p>

                    {/* Catalog Rewards if available */}
                    {loyaltySummary.eligibleRewards && loyaltySummary.eligibleRewards.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {loyaltySummary.eligibleRewards.map((rw) => {
                          const isSelected = selectedRewardId === rw.id;
                          return (
                            <button
                              key={rw.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedRewardId(null);
                                } else {
                                  setSelectedRewardId(rw.id);
                                  setRedeemPoints(0);
                                }
                              }}
                              className={`w-full text-left p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition ${
                                isSelected
                                  ? "border-amber-500 bg-amber-50/60 font-semibold"
                                  : "border-neutral-200 hover:border-amber-300 bg-white"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Award className={`w-4 h-4 ${isSelected ? "text-amber-600" : "text-neutral-400"}`} />
                                <div>
                                  <p className="text-neutral-900 font-bold">{rw.name}</p>
                                  <p className="text-[10px] text-neutral-500">
                                    {rw.rewardType === "DISCOUNT_FIXED" && `Save ${fmt(rw.discountAmount || 0)}`}
                                    {rw.rewardType === "DISCOUNT_PERCENT" && `Save ${rw.discountPercent}%`}
                                  </p>
                                </div>
                              </div>
                              <span className="text-xs font-bold text-amber-600">
                                {rw.pointsCost} pts
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Direct Points Redemption */}
                    {!selectedRewardId && (
                      <div className="bg-neutral-50 p-2.5 rounded-xl border border-neutral-200/80 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-neutral-600 font-medium">Redeem Points:</span>
                          <span className="font-extrabold text-amber-600">
                            {redeemPoints} pts = -{fmt(loyaltyDiscount)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={Math.min(
                            loyaltySummary.pointsBalance,
                            loyaltySummary.program.maxRedeemPointsPerOrder || loyaltySummary.pointsBalance
                          )}
                          step={loyaltySummary.program.redemptionStep || 50}
                          value={redeemPoints}
                          onChange={(e) => setRedeemPoints(Number(e.target.value))}
                          className="w-full accent-amber-500 cursor-pointer"
                        />
                        <div className="flex justify-between text-[10px] text-neutral-400">
                          <span>0 pts</span>
                          <span>
                            Max {Math.min(
                              loyaltySummary.pointsBalance,
                              loyaltySummary.program.maxRedeemPointsPerOrder || loyaltySummary.pointsBalance
                            )} pts
                          </span>
                        </div>
                      </div>
                    )}

                    {(selectedRewardId || redeemPoints > 0) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRewardId(null);
                          setRedeemPoints(0);
                        }}
                        className="text-[11px] text-red-500 hover:underline font-medium cursor-pointer"
                      >
                        Remove loyalty discount
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-neutral-500">
                    You need at least {loyaltySummary.program.minRedeemPoints || 50} points to redeem on an order. Keep dining to unlock rewards!
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Payment Method */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <h4 className="font-bold text-xs text-neutral-500 uppercase tracking-wider mb-3">Payment Method</h4>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod("ONLINE")}
                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                  paymentMethod === "ONLINE"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-neutral-100 hover:border-primary/30"
                }`}
              >
                <CreditCard className={`w-6 h-6 ${paymentMethod === "ONLINE" ? "text-primary" : "text-neutral-400"}`} />
                <span className={`text-xs font-bold ${paymentMethod === "ONLINE" ? "text-primary" : "text-neutral-600"}`}>Pay Online</span>
                <span className="text-[10px] text-neutral-400">UPI / Cards</span>
              </button>
              <button
                onClick={() => setPaymentMethod("CASH")}
                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all cursor-pointer ${
                  paymentMethod === "CASH"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-neutral-100 hover:border-primary/30"
                }`}
              >
                <Banknote className={`w-6 h-6 ${paymentMethod === "CASH" ? "text-primary" : "text-neutral-400"}`} />
                <span className={`text-xs font-bold ${paymentMethod === "CASH" ? "text-primary" : "text-neutral-600"}`}>Pay at Counter</span>
                <span className="text-[10px] text-neutral-400">Cash / Later</span>
              </button>
            </div>
          </div>

          {orderError && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-xl text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{orderError}</span>
            </div>
          )}

          {/* In-flow Place Order button for guaranteed visibility by scrolling */}
          <div className="pt-2">
            <button
              onClick={handlePlaceOrder}
              disabled={!isOrderingEnabled || isSubmitting || paymentStatus === "VERIFYING"}
              className="w-full bg-primary hover:bg-primary/95 text-white font-black h-13 rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-sm"
            >
              {!isOrderingEnabled ? (
                <span>Ordering Temporarily Paused</span>
              ) : (isSubmitting || paymentStatus === "PROCESSING" || paymentStatus === "VERIFYING") ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{paymentStatus === "VERIFYING" ? "Verifying..." : "Processing..."}</span>
                </>
              ) : paymentMethod === "ONLINE" ? (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Pay {fmt(effectiveTotal)}</span>
                </>
              ) : (
                <>
                  <span>Place Order • {fmt(effectiveTotal)}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Bottom Sticky Place Order CTA */}
        <div className="sticky bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-neutral-100 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] z-30 pb-[max(1rem,env(safe-area-inset-bottom))] mt-auto">
          <button
            onClick={handlePlaceOrder}
            disabled={!isOrderingEnabled || isSubmitting || paymentStatus === "VERIFYING"}
            className="w-full bg-primary text-white font-bold h-13 rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-sm"
          >
            {!isOrderingEnabled ? (
              <span>Ordering Temporarily Paused</span>
            ) : (isSubmitting || paymentStatus === "PROCESSING" || paymentStatus === "VERIFYING") ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{paymentStatus === "VERIFYING" ? "Verifying..." : "Processing..."}</span>
              </>
            ) : paymentMethod === "ONLINE" ? (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Pay {fmt(effectiveTotal)}</span>
              </>
            ) : (
              <>
                <span>Place Order • {fmt(effectiveTotal)}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>

        {/* Simulated Payment Modal */}
        {showSimulatedModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  <h3 className="font-bold text-sm text-neutral-900">Test Payment</h3>
                </div>
                <span className="text-[10px] font-mono bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full font-bold">Sandbox</span>
              </div>
              <div className="space-y-2 py-1">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Order</span>
                  <span className="font-mono font-bold text-neutral-900">{orderNumber}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Amount</span>
                  <span className="font-bold text-primary">{fmt(showSimulatedModal.amount)}</span>
                </div>
              </div>
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => handleSimulatePayment(true)}
                  disabled={isSubmitting}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
                >
                  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  <span>Authorize Payment</span>
                </button>
                <button
                  onClick={() => handleSimulatePayment(false)}
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-red-50 text-red-600 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition"
                >
                  <span>Simulate Failure</span>
                </button>
                <button
                  onClick={() => {
                    setShowSimulatedModal(null);
                    setPaymentStatus("PENDING");
                    setOrderError("Payment cancelled. Retry anytime.");
                  }}
                  className="w-full py-2 text-neutral-400 hover:text-neutral-600 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Call Waiter Dock */}
        <CallWaiterDock
          token={token}
          tableName={table.name}
          restaurantName={restaurant.name}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     SCREEN: SUCCESS — Show order confirmation & link to tracking
     ═══════════════════════════════════════════════════════ */
  if (screen === "success") {
    const isPaid = paymentStatus === "PAID";
    const orderedDishes =
      trackedOrder?.items?.map((i) => i.name) ||
      cartItems.map((i) => i.name);

    return (
      <div
        style={brandStyle}
        className="min-h-[100dvh] max-w-md mx-auto bg-neutral-50 flex flex-col p-4 pb-20 space-y-4 overflow-y-auto"
      >
        {/* Header confirmation */}
        <div className="bg-white rounded-3xl border border-neutral-200/90 p-6 text-center shadow-xs flex flex-col items-center">
          <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/20 animate-in zoom-in-95">
            <Check className="w-8 h-8 stroke-[3]" />
          </div>

          <h1 className="text-2xl font-black text-neutral-900 mb-1">
            Order Placed!
          </h1>
          <p className="text-xs text-neutral-500 mb-4">
            Your dishes are being prepared fresh in the kitchen.
          </p>

          <div className="w-full bg-neutral-50 rounded-2xl p-4 border border-neutral-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">
                Order Number
              </span>
              <span className="text-sm font-black font-mono tracking-widest text-neutral-900">
                #{orderNumber || createdOrder?.orderNumber}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-medium">
                Dining Location
              </span>
              <span className="text-xs font-bold text-neutral-800">
                {restaurant.name} • Table {table.name}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-neutral-100">
              <span className="text-xs text-neutral-500 font-medium">Payment</span>
              {isPaid ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <Check className="w-3 h-3 stroke-[3]" /> Paid Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                  <Banknote className="w-3 h-3" /> Pay at Counter
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              if (createdOrder) startTracking(createdOrder.id);
              setScreen("order-tracking");
            }}
            className="w-full bg-primary hover:bg-primary/95 text-white font-black py-3.5 rounded-2xl shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition text-sm"
          >
            <Clock className="w-4 h-4" />
            <span>Track Live Cooking Status</span>
          </button>

          {trackedOrder?.receiptToken && (
            <a
              href={`/receipt/${trackedOrder.receiptToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition text-sm"
            >
              <Receipt className="w-4 h-4 text-emerald-600" />
              <span>View Digital Receipt</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => setIsSplitModalOpen(true)}
            className="w-full bg-white border border-neutral-200 text-neutral-800 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition text-sm hover:bg-neutral-50 shadow-xs"
          >
            <Users className="w-4 h-4 text-primary" />
            <span>Split Check & Tip with Friends</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreatedOrder(null);
              setPaymentStatus("IDLE");
              setScreen("menu");
            }}
            className="w-full bg-white border border-neutral-200 text-neutral-700 font-bold py-3 rounded-2xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition text-sm hover:bg-neutral-50"
          >
            <Plus className="w-4 h-4" />
            <span>Order More Dishes</span>
          </button>
        </div>

        {/* Feature #6: Scratch & Win Reward Card */}
        <ScratchWinCard
          restaurantId={restaurant.id}
          orderNumber={orderNumber || createdOrder?.orderNumber}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />

        {/* Google Review Card with Dynamic Review Generator */}
        <GoogleReviewCard
          restaurantName={restaurant.name}
          tableName={table.name}
          orderedItems={orderedDishes}
          googleReviewUrl={restaurant.googleReviewUrl}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />

        {/* Call Waiter Floating Dock */}
        <CallWaiterDock
          token={token}
          tableName={table.name}
          restaurantName={restaurant.name}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />

        {/* Interactive Split Bill Modal */}
        <SplitBillModal
          isOpen={isSplitModalOpen}
          onClose={() => setIsSplitModalOpen(false)}
          subtotal={trackedOrder ? trackedOrder.total : (appliedCoupon ? appliedCoupon.discountedSubtotal : subtotal)}
          tax={tax}
          total={trackedOrder ? trackedOrder.total : (appliedCoupon ? appliedCoupon.total : total)}
          currency={restaurant.currency}
          tableName={table.name}
          restaurantName={restaurant.name}
          orderNumber={orderNumber || createdOrder?.orderNumber || trackedOrder?.orderNumber}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════
     SCREEN: ORDER TRACKING — Live status updates
     ═══════════════════════════════════════════════════════ */
  if (screen === "order-tracking") {
    return (
      <div className="min-h-[100dvh] max-w-md mx-auto bg-white flex flex-col">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-white px-4 py-3.5 flex items-center gap-3 border-b border-neutral-100 shadow-sm">
          <button
            onClick={() => {
              if (trackingInterval.current) { clearInterval(trackingInterval.current); trackingInterval.current = null; }
              setScreen("menu");
            }}
            className="p-1.5 -ml-1 rounded-xl hover:bg-neutral-100 transition cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-700" />
          </button>
          <div>
            <h1 className="font-bold text-base text-neutral-900">Order Status</h1>
            {trackedOrder && (
              <p className="text-[11px] text-neutral-400 font-medium">#{trackedOrder.orderNumber}</p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 pb-20">
          {trackingError ? (
            <div className="text-center py-16">
              <AlertCircle className="w-12 h-12 mx-auto text-red-300 mb-3" />
              <p className="text-sm font-semibold text-neutral-500 mb-1">{trackingError}</p>
              <button
                onClick={() => { if (createdOrder) fetchOrderStatus(createdOrder.id); }}
                className="text-xs text-primary font-bold cursor-pointer mt-2 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : !trackedOrder ? (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 mx-auto text-primary animate-spin mb-3" />
              <p className="text-sm text-neutral-400">Loading order status...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Feature #5: Live Cooking Tracker with Countdown */}
              <LiveCookingTracker
                status={trackedOrder.status}
                orderNumber={trackedOrder.orderNumber}
                tableName={table.name}
                restaurantName={restaurant.name}
                createdAt={trackedOrder.createdAt}
                items={trackedOrder.items}
                total={trackedOrder.total}
                formattedTotal={fmt(trackedOrder.total)}
                accentColor={restaurant.accentColor || "#E85D2A"}
              />

              {/* Payment status badge */}
              <div className="flex justify-center">
                {trackedOrder.paymentStatus === "PAID" ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                    <Check className="w-3.5 h-3.5 stroke-[3]" /> Payment Complete
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                    <Clock className="w-3.5 h-3.5" /> Payment Pending
                  </span>
                )}
              </div>

              {/* Feature #6: Scratch & Win Loyalty Card */}
              <ScratchWinCard
                restaurantId={restaurant.id}
                orderNumber={trackedOrder.orderNumber}
                accentColor={restaurant.accentColor || "#E85D2A"}
              />

              {/* Google Review Flow */}
              <GoogleReviewCard
                restaurantName={restaurant.name}
                tableName={table.name}
                orderedItems={trackedOrder.items.map((i) => i.name)}
                googleReviewUrl={restaurant.googleReviewUrl}
                accentColor={restaurant.accentColor || "#E85D2A"}
              />

              {/* Auto-refresh notice */}
              <div className="flex items-center justify-center gap-2 text-xs text-neutral-400 pt-1">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                <span>Syncs live kitchen updates every 5 seconds</span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom button */}
        <div className="sticky bottom-0 bg-white border-t border-neutral-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
          {trackedOrder?.receiptToken && (
            <a
              href={`/receipt/${trackedOrder.receiptToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition text-sm"
            >
              <Receipt className="w-4 h-4 text-emerald-600" />
              <span>View Digital Receipt</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => setIsSplitModalOpen(true)}
            className="w-full bg-white border border-neutral-200 text-neutral-800 font-bold py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition text-sm hover:bg-neutral-50 shadow-xs"
          >
            <Users className="w-4 h-4 text-primary" />
            <span>Split Check & Tip with Friends</span>
          </button>
          <button
            onClick={() => {
              if (trackingInterval.current) { clearInterval(trackingInterval.current); trackingInterval.current = null; }
              setCreatedOrder(null);
              setPaymentStatus("IDLE");
              setTrackedOrder(null);
              setScreen("menu");
            }}
            className="w-full bg-neutral-900 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition text-sm shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>Order More Items</span>
          </button>
        </div>

        {/* Call Waiter Floating Dock */}
        <CallWaiterDock
          token={token}
          tableName={table.name}
          restaurantName={restaurant.name}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />

        {/* Interactive Split Bill Modal */}
        <SplitBillModal
          isOpen={isSplitModalOpen}
          onClose={() => setIsSplitModalOpen(false)}
          subtotal={trackedOrder ? trackedOrder.total : total}
          tax={tax}
          total={trackedOrder ? trackedOrder.total : total}
          currency={restaurant.currency}
          tableName={table.name}
          restaurantName={restaurant.name}
          orderNumber={trackedOrder?.orderNumber || orderNumber || createdOrder?.orderNumber}
          accentColor={restaurant.accentColor || "#E85D2A"}
        />
      </div>
    );
  }

  return null;
}

/* ─────────────── CategoryPill sub-component ─────────────── */
function CategoryPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer ${
        active
          ? "bg-primary text-white shadow-sm"
          : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}
