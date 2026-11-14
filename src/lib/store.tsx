import type React from "react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getProduct, type Size } from "./products";
import { useAuth } from "./auth";
import { supabase } from "@/integrations/supabase/client";

export type CartItem = { slug: string; size: Size; color: string; qty: number };

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

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("cavenhurst-store") || "{}");
      setCart(((s.cart ?? []) as CartItem[]).filter((c) => getProduct(c.slug)));
      setWishlist(((s.wishlist ?? []) as string[]).filter((w) => getProduct(w)));
      setCoupon(s.coupon ?? null);
    } catch {
      // Ignore corrupted local storage
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) localStorage.setItem("cavenhurst-store", JSON.stringify({ cart, wishlist, coupon }));
  }, [cart, wishlist, coupon, ready]);

  // When signed in: merge the saved account bag with this device, then keep the account copy updated.
  const { user } = useAuth();
  const [synced, setSynced] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !user) {
      setSynced(null);
      return;
    }
    let live = true;
    supabase
      .from("customer_carts")
      .select("items, wishlist")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const savedCart = (data?.items as CartItem[] | undefined) ?? [];
        const savedWish = (data?.wishlist as string[] | undefined) ?? [];
        setCart((c) => {
          const out = savedCart.filter((x) => getProduct(x.slug));
          c.forEach((x) => {
            if (!out.some((y) => y.slug === x.slug && y.size === x.size && y.color === x.color))
              out.push(x);
          });
          return out;
        });
        setWishlist((w) => Array.from(new Set([...savedWish, ...w])).filter((x) => getProduct(x)));
        setSynced(user.id);
      });
    return () => {
      live = false;
    };
  }, [user, ready]);
  useEffect(() => {
    if (!user || synced !== user.id) return;
    const t = setTimeout(() => {
      supabase
        .from("customer_carts")
        .upsert({ user_id: user.id, items: cart, wishlist, updated_at: new Date().toISOString() })
        .then(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [cart, wishlist, synced, user]);

  const stockFor = (slug: string, size: Size) => getProduct(slug)?.stock[size] ?? 0;

  const add = (item: CartItem) => {
    const max = stockFor(item.slug, item.size);
    const idx = cart.findIndex(
      (c) => c.slug === item.slug && c.size === item.size && c.color === item.color,
    );
    const existing = idx >= 0 ? cart[idx]!.qty : 0;
    if (max <= 0 || existing + item.qty > max) return false;
    setCart((c) =>
      idx >= 0 ? c.map((x, i) => (i === idx ? { ...x, qty: x.qty + item.qty } : x)) : [...c, item],
    );
    return true;
  };

  const subtotal = cart.reduce((s, c) => s + (getProduct(c.slug)?.price ?? 0) * c.qty, 0);

  return (
    <Ctx.Provider
      value={{
        cart,
        wishlist,
        coupon,
        add,
        setQty: (i, qty) =>
          setCart((c) =>
            c.map((x, j) =>
              j === i ? { ...x, qty: Math.max(1, Math.min(qty, stockFor(x.slug, x.size))) } : x,
            ),
          ),
        remove: (i) => setCart((c) => c.filter((_, j) => j !== i)),
        clear: () => setCart([]),
        toggleWish: (slug) => {
          const has = wishlist.includes(slug);
          setWishlist((w) => (has ? w.filter((s) => s !== slug) : [...w, slug]));
          return !has;
        },
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
