"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type CartVariant = {
  id: string;
  name: string;
  price: number;
};

export type CartAddon = {
  id: string;
  name: string;
  price: number;
};

export type CartItem = {
  cartItemId: string; // unique for the cart entry
  menuItemId: string;
  name: string;
  basePrice: number;
  quantity: number;
  variant: CartVariant | null;
  addons: CartAddon[];
  specialInstructions: string;
  totalPrice: number; // base * qty + variant * qty + addons * qty
};

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "cartItemId" | "totalPrice">) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  clearCart: () => void;
  getItemQuantity: (menuItemId: string) => number;
  updateQuantityByMenuItem: (menuItemId: string, delta: number) => void;
  subtotal: number;
  tax: number;
  total: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children, restaurantId, taxPercentage = 0 }: { children: ReactNode, restaurantId: string, taxPercentage?: number }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage on mount (keyed by restaurant)
  useEffect(() => {
    const saved = localStorage.getItem(`cart_${restaurantId}`);
    if (saved) {
      try {
        setItems(JSON.parse(saved));
      } catch {
        console.error("Failed to parse cart");
      }
    }
    setIsLoaded(true);
  }, [restaurantId]);

  // Save to local storage on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(`cart_${restaurantId}`, JSON.stringify(items));
    }
  }, [items, isLoaded, restaurantId]);

  const calculateItemTotal = (basePrice: number, quantity: number, variant: CartVariant | null, addons: CartAddon[]) => {
    const variantPrice = variant ? variant.price : 0;
    const addonsPrice = addons.reduce((sum, a) => sum + a.price, 0);
    return (basePrice + variantPrice + addonsPrice) * quantity;
  };

  const addItem = (itemData: Omit<CartItem, "cartItemId" | "totalPrice">) => {
    // Check if identical item already exists (same variant, addons, special instructions)
    const existingIndex = items.findIndex(i => 
      i.menuItemId === itemData.menuItemId &&
      i.variant?.id === itemData.variant?.id &&
      JSON.stringify(i.addons.map(a => a.id).sort()) === JSON.stringify(itemData.addons.map(a => a.id).sort()) &&
      i.specialInstructions === itemData.specialInstructions
    );

    if (existingIndex >= 0) {
      // Update quantity
      const newItems = [...items];
      newItems[existingIndex].quantity += itemData.quantity;
      newItems[existingIndex].totalPrice = calculateItemTotal(
        newItems[existingIndex].basePrice,
        newItems[existingIndex].quantity,
        newItems[existingIndex].variant,
        newItems[existingIndex].addons
      );
      setItems(newItems);
    } else {
      // Add new
      const cartItemId = Math.random().toString(36).substr(2, 9);
      const totalPrice = calculateItemTotal(itemData.basePrice, itemData.quantity, itemData.variant, itemData.addons);
      setItems([...items, { ...itemData, cartItemId, totalPrice }]);
    }
  };

  const removeItem = (cartItemId: string) => {
    setItems(items.filter(i => i.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(cartItemId);
      return;
    }
    setItems(items.map(i => {
      if (i.cartItemId === cartItemId) {
        return {
          ...i,
          quantity,
          totalPrice: calculateItemTotal(i.basePrice, quantity, i.variant, i.addons)
        };
      }
      return i;
    }));
  };

  const getItemQuantity = (menuItemId: string) => {
    return items
      .filter(i => i.menuItemId === menuItemId)
      .reduce((sum, i) => sum + i.quantity, 0);
  };

  const updateQuantityByMenuItem = (menuItemId: string, delta: number) => {
    const matchingItems = items.filter(i => i.menuItemId === menuItemId);
    if (matchingItems.length === 0) return;
    
    // Target the most recently added or only item for this menu item
    const targetItem = matchingItems[matchingItems.length - 1];
    const newQty = targetItem.quantity + delta;
    updateQuantity(targetItem.cartItemId, newQty);
  };

  const clearCart = () => setItems([]);

  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const tax = (subtotal * taxPercentage) / 100;
  const total = subtotal + tax;

  return (
    <CartContext.Provider value={{ 
      items, 
      addItem, 
      removeItem, 
      updateQuantity, 
      clearCart, 
      getItemQuantity,
      updateQuantityByMenuItem,
      subtotal, 
      tax, 
      total 
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
