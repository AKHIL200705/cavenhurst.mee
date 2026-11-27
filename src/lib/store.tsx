import type React from "react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getProduct, imageFor, type Size } from "./products";
import { type CouponPricingRule } from "./pricing";
import { useAuth } from "./auth";
import {
  syncCartServerFn,
  updateCartItemServerFn,
  toggleWishlistServerFn,
  type CartItemData,
} from "@/server/cart";

export type CartItem = CartItemData;

const DIRECT_BUY_STORAGE_KEY = "cavenhusrt-direct-buy";

type Store = {
  cart: CartItem[];
  wishlist: string[];
  coupon: string | null;
  couponRule: CouponPricingRule | null;
  directBuyItem: CartItem | null;
  directBuyCoupon: string | null;
  directBuyCouponRule: CouponPricingRule | null;
  add: (item: CartItem) => boolean;
  setQty: (i: number, qty: number) => void;
  updateVariant: (i: number, nextSize: Size, nextColor: string) => boolean;
  remove: (i: number) => void;
  clear: () => void;
  toggleWish: (slug: string) => boolean;
  setCoupon: (c: string | null, rule?: CouponPricingRule | null) => void;
  startDirectBuy: (item: CartItem) => boolean;
  setDirectBuyQty: (qty: number) => void;
  setDirectBuyCoupon: (c: string | null, rule?: CouponPricingRule | null) => void;
  clearDirectBuy: () => void;
  count: number;
  subtotal: number;
};

// Keep one context across hot reloads so the provider and hooks always match.
const g = globalThis as { __cavenStoreCtx?: React.Context<Store | null> };
const Ctx = (g.__cavenStoreCtx ??= createContext<Store | null>(null));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [coupon, setCouponState] = useState<string | null>(null);
  const [couponRule, setCouponRule] = useState<CouponPricingRule | null>(null);
  const [directBuyItem, setDirectBuyItem] = useState<CartItem | null>(null);
  const [directBuyCoupon, setDirectBuyCouponState] = useState<string | null>(null);
  const [directBuyCouponRule, setDirectBuyCouponRule] = useState<CouponPricingRule | null>(null);
  const [ready, setReady] = useState(false);
  const { user, sessionToken } = useAuth();
  const [syncedUser, setSyncedUser] = useState<string | null>(null);
  const cartRef = useRef(cart);
  const wishlistRef = useRef(wishlist);
  const storageOwnerRef = useRef<string | null>(null);

  useEffect(() => {
    cartRef.current = cart;
    wishlistRef.current = wishlist;
  }, [cart, wishlist]);

  // Initialize cart from localStorage and Direct Buy session from sessionStorage on mount
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("cavenhusrt-store") || "{}");
      if (Array.isArray(s.cart)) setCart(s.cart);
      if (Array.isArray(s.wishlist)) setWishlist(s.wishlist);
      setCouponState(s.coupon ?? null);
      setCouponRule(s.couponRule ?? null);
      storageOwnerRef.current = typeof s.ownerId === "string" ? s.ownerId : null;
    } catch {
      // Ignore corrupted local storage
    }

    try {
      const rawDirect = sessionStorage.getItem(DIRECT_BUY_STORAGE_KEY);
      if (rawDirect) {
        const d = JSON.parse(rawDirect);
        if (d?.item && typeof d.item.slug === "string") {
          setDirectBuyItem(d.item);
          setDirectBuyCouponState(d.coupon ?? null);
          setDirectBuyCouponRule(d.couponRule ?? null);
        }
      }
    } catch {
      // Ignore corrupted direct-buy session storage
    }

    setReady(true);
  }, []);

  // Save cart / wishlist to localStorage (never touches directBuyItem)
  useEffect(() => {
    if (ready) {
      localStorage.setItem(
        "cavenhusrt-store",
        JSON.stringify({
          cart,
          wishlist,
          coupon,
          couponRule,
          ownerId: storageOwnerRef.current,
        }),
      );
    }
  }, [cart, wishlist, coupon, couponRule, ready]);

  // Save Direct Buy item strictly in sessionStorage (isolated from cart)
  useEffect(() => {
    if (!ready) return;
    try {
      if (directBuyItem) {
        sessionStorage.setItem(
          DIRECT_BUY_STORAGE_KEY,
          JSON.stringify({
            item: directBuyItem,
            coupon: directBuyCoupon,
            couponRule: directBuyCouponRule,
          }),
        );
      } else {
        sessionStorage.removeItem(DIRECT_BUY_STORAGE_KEY);
      }
    } catch {
      // Ignore storage quota issues
    }
  }, [directBuyItem, directBuyCoupon, directBuyCouponRule, ready]);

  // When customer signs in: synchronize only unowned guest items with authoritative Supabase tables
  useEffect(() => {
    if (!ready) return;

    if (!user) {
      if (storageOwnerRef.current !== null) {
        storageOwnerRef.current = null;
        setCart([]);
        setWishlist([]);
      }
      setSyncedUser(null);
      return;
    }

    if (syncedUser === user.id) return;

    const shouldMergeGuest = storageOwnerRef.current === null;
    let active = true;
    syncCartServerFn({
      data: {
        authToken: sessionToken || undefined,
        guestCart: shouldMergeGuest ? cartRef.current : [],
        guestWishlist: shouldMergeGuest ? wishlistRef.current : [],
      },
    })
      .then((res) => {
        if (!active) return;
        storageOwnerRef.current = user.id;
        if (res && res.cart) {
          setCart(res.cart);
        }
        if (res && res.wishlist) {
          setWishlist(res.wishlist);
        }
        localStorage.setItem(
          "cavenhusrt-store",
          JSON.stringify({
            cart: res?.cart ?? cartRef.current,
            wishlist: res?.wishlist ?? wishlistRef.current,
            coupon,
            ownerId: user.id,
          }),
        );
        setSyncedUser(user.id);
      })
      .catch((err) => {
        console.warn("[Cart Sync] Warning during server cart sync:", err);
      });

    return () => {
      active = false;
    };
  }, [user, sessionToken, ready, syncedUser, coupon]);

  const stockFor = (item: CartItem, sizeOverride?: Size): number => {
    const targetSize = sizeOverride || item.size;
    if (sizeOverride && item.sizeStock && typeof item.sizeStock[targetSize] === "number") {
      return item.sizeStock[targetSize];
    }
    if (!sizeOverride && typeof item.maxStock === "number" && item.maxStock >= 0) {
      return item.maxStock;
    }
    const p = getProduct(item.slug);
    return p?.stock?.[targetSize] ?? 10;
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
    if (user) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken || undefined,
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

    setCart((c) => c.map((x, j) => (j === i ? { ...x, qty: finalQty } : x)));

    // Persist to Supabase if authenticated
    if (user) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken || undefined,
          action: "setQty",
          item: { ...targetItem, qty: finalQty },
        },
      }).catch((e) => console.error("[Store] SetQty server sync error:", e));
    }
  };

  const updateVariant = (i: number, nextSize: Size, nextColor: string): boolean => {
    const targetItem = cart[i];
    if (!targetItem) return false;
    if (targetItem.size === nextSize && targetItem.color === nextColor) return true;

    const max = stockFor(targetItem, nextSize);
    if (max <= 0) return false;

    const p = getProduct(targetItem.slug);
    const updatedImage = p ? imageFor(p, nextColor) : targetItem.image;
    const duplicateIdx = cart.findIndex(
      (c, j) =>
        j !== i && c.slug === targetItem.slug && c.size === nextSize && c.color === nextColor,
    );

    setCart((current) => {
      if (duplicateIdx >= 0) {
        const mergedQty = Math.min(current[duplicateIdx]!.qty + targetItem.qty, max);
        return current
          .map((x, j) =>
            j === duplicateIdx ? { ...x, qty: mergedQty, maxStock: max, image: updatedImage } : x,
          )
          .filter((_, j) => j !== i);
      }
      const clampedQty = Math.max(1, Math.min(targetItem.qty, max));
      return current.map((x, j) =>
        j === i
          ? {
              ...x,
              size: nextSize,
              color: nextColor,
              qty: clampedQty,
              maxStock: max,
              image: updatedImage,
            }
          : x,
      );
    });

    if (user) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken || undefined,
          action: "updateVariant",
          prevSize: targetItem.size,
          prevColor: targetItem.color,
          item: {
            ...targetItem,
            size: nextSize,
            color: nextColor,
            maxStock: max,
          },
        },
      }).catch((e) => console.error("[Store] UpdateVariant server sync error:", e));
    }

    return true;
  };

  const remove = (i: number) => {
    const targetItem = cart[i];
    setCart((c) => c.filter((_, j) => j !== i));

    // Persist to Supabase if authenticated
    if (user && targetItem) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken || undefined,
          action: "remove",
          item: targetItem,
        },
      }).catch((e) => console.error("[Store] Remove item server sync error:", e));
    }
  };

  const clear = () => {
    setCart([]);
    setCouponState(null);
    setCouponRule(null);
    if (user) {
      void updateCartItemServerFn({
        data: {
          authToken: sessionToken || undefined,
          action: "clear",
        },
      }).catch((e) => console.error("[Store] Clear cart server sync error:", e));
    }
  };

  const setCoupon = (c: string | null, rule?: CouponPricingRule | null) => {
    setCouponState(c);
    setCouponRule(c ? (rule ?? null) : null);
  };

  const startDirectBuy = (item: CartItem) => {
    const max = stockFor(item);
    if (max <= 0 || item.qty <= 0 || item.qty > max) return false;
    const cleanItem: CartItem = { ...item, maxStock: max };
    setDirectBuyItem(cleanItem);
    setDirectBuyCouponState(null);
    setDirectBuyCouponRule(null);
    try {
      sessionStorage.setItem(
        DIRECT_BUY_STORAGE_KEY,
        JSON.stringify({ item: cleanItem, coupon: null, couponRule: null }),
      );
    } catch {
      // Ignore storage quota issues
    }
    return true;
  };

  const setDirectBuyQty = (qty: number) => {
    setDirectBuyItem((prev) => {
      if (!prev) return null;
      const max = stockFor(prev);
      const finalQty = Math.max(1, Math.min(qty, max > 0 ? max : qty));
      return { ...prev, qty: finalQty };
    });
  };

  const setDirectBuyCoupon = (c: string | null, rule?: CouponPricingRule | null) => {
    setDirectBuyCouponState(c);
    setDirectBuyCouponRule(c ? (rule ?? null) : null);
  };

  const clearDirectBuy = () => {
    setDirectBuyItem(null);
    setDirectBuyCouponState(null);
    setDirectBuyCouponRule(null);
    try {
      sessionStorage.removeItem(DIRECT_BUY_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const toggleWish = (slug: string) => {
    const has = wishlist.includes(slug);
    setWishlist((w) => (has ? w.filter((s) => s !== slug) : [...w, slug]));

    // Persist to Supabase if authenticated
    if (user) {
      void toggleWishlistServerFn({
        data: {
          authToken: sessionToken || undefined,
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
        couponRule,
        directBuyItem,
        directBuyCoupon,
        directBuyCouponRule,
        add,
        setQty,
        updateVariant,
        remove,
        clear,
        toggleWish,
        setCoupon,
        startDirectBuy,
        setDirectBuyQty,
        setDirectBuyCoupon,
        clearDirectBuy,
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
