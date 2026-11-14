import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, Shield } from "lucide-react";
import { meta } from "@/components/site/InfoPage";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { getProduct, imageFor } from "@/lib/products";
import { formatINR } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/account")({
  head: () => meta("My Account", "Your CAVENHURST saved bag, wishlist and order history."),
  component: Account,
});

type Order = {
  id: string;
  order_number: string | null;
  total: number;
  status: string;
  payment_status: string | null;
  shipment_status: string | null;
  awb_number: string | null;
  created_at: string;
  items: unknown;
};

function Account() {
  const { user, ready, signOut } = useAuth();
  const { cart, wishlist } = useStore();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select(
        "id,order_number,total,status,payment_status,shipment_status,awb_number,created_at,items",
      )
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(Boolean(data));
      });
  }, [user]);

  if (!ready) return <div className="py-28 text-center text-muted-foreground">Loading…</div>;
  if (!user)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="font-serif text-5xl italic">My Account</h1>
        <p className="mt-3 text-muted-foreground">
          Sign in to see your saved bag, wishlist and orders on any device.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block rounded-md bg-primary px-6 py-3 font-bold text-primary-foreground"
        >
          Login / Sign Up
        </Link>
      </div>
    );

  const name = user.phone ? `+${user.phone}` : user.email;
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-5xl italic">My Account</h1>
          <p className="mt-2 text-silver">{name}</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-md border border-electric/40 bg-electric/10 px-4 py-2 text-sm font-semibold text-electric"
            >
              <Shield className="h-4 w-4" /> Admin Portal
            </Link>
          )}
          <button
            onClick={async () => {
              await signOut();
              void navigate({ to: "/login", replace: true });
            }}
            className="rounded-md border border-border px-5 py-2 text-sm hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      </div>

      <section>
        <div className="mb-4 flex justify-between">
          <h2 className="text-sm font-bold tracking-brand">SAVED BAG ({cart.length})</h2>
          <Link to="/cart" className="text-sm underline">
            Open bag
          </Link>
        </div>
        {cart.length === 0 ? (
          <p className="text-muted-foreground">Your bag is empty.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {cart.map((c) => {
              const p = getProduct(c.slug);
              if (!p) return null;
              return (
                <li
                  key={`${c.slug}${c.size}${c.color}`}
                  className="flex gap-3 rounded-xl border border-border bg-card p-3"
                >
                  <img
                    src={imageFor(p, c.color)}
                    alt=""
                    className="h-20 w-16 rounded object-cover"
                  />
                  <div className="text-sm">
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-muted-foreground">
                      {c.color} · {c.size} · ×{c.qty}
                    </p>
                    <p className="mt-1 font-bold">{formatINR(p.price * c.qty)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4 flex justify-between">
          <h2 className="text-sm font-bold tracking-brand">WISHLIST ({wishlist.length})</h2>
          <Link to="/wishlist" className="text-sm underline">
            View all
          </Link>
        </div>
        {wishlist.length === 0 ? (
          <p className="text-muted-foreground">No saved items yet.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {wishlist.map((s) => {
              const p = getProduct(s);
              if (!p) return null;
              return (
                <li key={s}>
                  <Link to="/product/$slug" params={{ slug: s }}>
                    <img
                      src={imageFor(p, p.colors[0]?.name ?? "")}
                      alt={p.name}
                      className="aspect-[3/4] w-full rounded-lg object-cover"
                    />
                    <p className="mt-2 text-sm">{p.name}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-bold tracking-brand">ORDER HISTORY</h2>
        {orders === null ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {orders.map((o) => (
              <li
                key={o.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 text-sm gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold">
                      #{o.order_number || o.id.slice(0, 8).toUpperCase()}
                    </p>
                    <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      {o.payment_status || "Pending"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(o.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-4 sm:text-right justify-between sm:justify-end">
                  {o.awb_number && (
                    <Link
                      to="/track-order"
                      className="flex items-center gap-1.5 text-xs text-silver hover:text-foreground border border-border rounded px-2.5 py-1"
                    >
                      <Truck className="h-3.5 w-3.5" /> Track #{o.awb_number}
                    </Link>
                  )}
                  <div>
                    <p className="font-bold font-mono">{formatINR(o.total)}</p>
                    <p className="capitalize text-xs text-silver">
                      {o.shipment_status?.replace(/_/g, " ") || o.status.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
