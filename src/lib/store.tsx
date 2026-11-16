import type React from "react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getProduct, type Size } from "./products";
import { useAuth } from "./auth";
import {
  syncCartServerFn,
  updateCartItemServerFn,
  toggleWishlistServerFn,
  type CartItemData,
} from "@/server/cart";

export type CartItem = CartItemData;

type Store = {
  cart: CartItem[];
  wishlist: string[];
  coupon: string | null;
  add: (item: CartItem) => boolean;
  setQty: (i: number, qty: number) => void;
  remove: (i: number) => void;
  clear: () => void;
  toggleWish: (slug: string) => boolean;
  setCoupon: (c: string | null) => void;
  count: number;
  subtotal: number;
};

// Keep one context across hot reloads so the provider and hooks always match.
const g = globalThis as { __cavenStoreCtx?: React.Context<Store | null> };
const Ctx = (g.__cavenStoreCtx ??= createContext<Store | null>(null));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [coupon, setCoupon] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const { user, sessionToken } = useAuth();
  const [syncedUser, setSyncedUser] = useState<string | null>(null);

  // Initialize from local storage on mount (guest state)
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("cavenhurst-store") || "{}");
      if (Array.isArray(s.cart)) setCart(s.cart);
      if (Array.isArray(s.wishlist)) setWishlist(s.wishlist);
      setCoupon(s.coupon ?? null);
    } catch {
      // Ignore corrupted local storage
    }
    setReady(true);
  }, []);

  // Save guest cart / fallback to localStorage
  useEffect(() => {
    if (ready) {
      localStorage.setItem("cavenhurst-store", JSON.stringify({ cart, wishlist, coupon }));
    }
  }, [cart, wishlist, coupon, ready]);

  // When customer signs in: synchronize guest cart & wishlist with authoritative Supabase tables
  useEffect(() => {
    if (!ready || !user) {
      setSyncedUser(null);
      return;
    }

    if (syncedUser === user.id) return;

    let active = true;
    syncCartServerFn({
      data: {
        authToken: sessionToken || undefined,
        guestCart: cart,
        guestWishlist: wishlist,
      },
    })
      .then((res) => {
        if (!active) return;
        if (res && res.cart) {
          setCart(res.cart);
        }
        if (res && res.wishlist) {
          setWishlist(res.wishlist);
        }
        setSyncedUser(user.id);
      })
      .catch((err) => {
        console.warn("[Cart Sync] Warning during server cart sync:", err);
      });

    return () => {
      active = false;
    };
  }, [user, sessionToken, ready, syncedUser]);

  const stockFor = (item: CartItem): number => {
    if (typeof item.maxStock === "number" && item.maxStock >= 0) {
      return item.maxStock;
    }
    const p = getProduct(item.slug);
    return (p?.stock?.[item.size] ?? 10);
  };

  const add = (item: CartItem) => {
    const max = stockFor(item);
    const idx = cart.findIndex(
      (c) => c.slug === item.slug && c.size === item.size && c.color === item.color,
    );
    const existing = idx >= 0 ? cart[idx]!.qty : 0;
    if (max <= 0 || existing + item.qty > max) return false;

    setCart((c) =>
      idx >= 0 ? c.map((x, i) => (i === idx ? { ...x, qty: x.qty + item.qty } : x)) : [...c, item],
    );

    // Persist to Supabase if authenticated
    if (user && sessionToken) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken,
          action: "add",
          item,
        },
      }).catch((e) => console.error("[Store] Add item server sync error:", e));
    }

    return true;
  };

  const setQty = (i: number, qty: number) => {
    const targetItem = cart[i];
    if (!targetItem) return;
    const max = stockFor(targetItem);
    const finalQty = Math.max(1, Math.min(qty, max > 0 ? max : qty));

    setCart((c) =>
      c.map((x, j) => (j === i ? { ...x, qty: finalQty } : x)),
    );

    // Persist to Supabase if authenticated
    if (user && sessionToken) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken,
          action: "setQty",
          item: { ...targetItem, qty: finalQty },
        },
      }).catch((e) => console.error("[Store] SetQty server sync error:", e));
    }
  };

  const remove = (i: number) => {
    const targetItem = cart[i];
    setCart((c) => c.filter((_, j) => j !== i));

    // Persist to Supabase if authenticated
    if (user && sessionToken && targetItem) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken,
          action: "remove",
          item: targetItem,
        },
      }).catch((e) => console.error("[Store] Remove item server sync error:", e));
    }
  };

  const clear = () => {
    setCart([]);
    if (user && sessionToken) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken,
          action: "clear",
        },
      }).catch((e) => console.error("[Store] Clear cart server sync error:", e));
    }
  };

  const toggleWish = (slug: string) => {
    const has = wishlist.includes(slug);
    setWishlist((w) => (has ? w.filter((s) => s !== slug) : [...w, slug]));

    // Persist to Supabase if authenticated
    if (user && sessionToken) {
      void toggleWishlistServerFn({
        data: {
          authToken: sessionToken,
          productSlug: slug,
        },
      }).catch((e) => console.error("[Store] Toggle wishlist server sync error:", e));
    }

    return !has;
  };

  const subtotal = cart.reduce((s, c) => {
    const unitPrice = c.price ?? getProduct(c.slug)?.price ?? 0;
    return s + unitPrice * c.qty;
  }, 0);

  return (
    <Ctx.Provider
      value={{
        cart,
        wishlist,
        coupon,
        add,
        setQty,
        remove,
        clear,
        toggleWish,
        setCoupon,
        count: cart.reduce((s, c) => s + c.qty, 0),
        subtotal,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
