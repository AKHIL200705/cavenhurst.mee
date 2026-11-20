import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Truck, Shield, MapPin, Plus, Trash2, Edit2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { meta } from "@/components/site/InfoPage";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { getProduct, imageFor } from "@/lib/products";
import { formatINR } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import {
  getCustomerAddressesServerFn,
  getCustomerOrdersServerFn,
  saveCustomerAddressServerFn,
  deleteCustomerAddressServerFn,
} from "@/server/customers";

export const Route = createFileRoute("/account")({
  head: () => meta("My Account", "Your CAVENHURST saved bag, wishlist and order history."),
  component: Account,
});

const STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

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

type Address = {
  id: string;
  address_type: string;
  is_default: boolean;
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
};

function Account() {
  const { user, sessionToken, ready, signOut } = useAuth();
  const { cart, wishlist } = useStore();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  // Address Form State
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const [addressForm, setAddressForm] = useState({
    fullName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    isDefault: false,
  });

  const loadData = async () => {
    if (!user) return;
    const userEmail = user.email?.toLowerCase();
    if (
      user.isAdmin ||
      (userEmail && ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"].includes(userEmail))
    ) {
      setIsAdmin(true);
    }

    try {
      const [addrs, ords] = await Promise.all([
        getCustomerAddressesServerFn({ data: { authToken: sessionToken || undefined } }),
        getCustomerOrdersServerFn({ data: { authToken: sessionToken || undefined } }),
      ]);
      setAddresses((addrs as Address[]) || []);
      setOrders((ords as Order[]) || []);
    } catch (err) {
      console.error("[Account] Error fetching customer data:", err);
    }

    // Role check
    if (userEmail) {
      const { data: adminRow } = await supabase
        .from("admin_users")
        .select("id")
        .or(`email.eq.${userEmail},auth_user_id.eq.${user.id}`)
        .eq("is_active", true)
        .maybeSingle();

      if (adminRow) {
        setIsAdmin(true);
      }
    }

    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setIsAdmin(true);
      });
  };

  useEffect(() => {
    void loadData();
  }, [user, sessionToken]);

  // Real-time updates for customer orders
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`customer-orders-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
        },
        () => {
          void loadData();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  const resetForm = () => {
    setAddressForm({
      fullName: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      postalCode: "",
      isDefault: false,
    });
    setEditingAddressId(null);
    setShowAddressForm(false);
  };

  const handleEditAddress = (a: Address) => {
    setAddressForm({
      fullName: a.full_name,
      phone: a.phone,
      addressLine1: a.address_line1,
      addressLine2: a.address_line2 || "",
      city: a.city,
      state: a.state,
      postalCode: a.postal_code,
      isDefault: a.is_default,
    });
    setEditingAddressId(a.id);
    setShowAddressForm(true);
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (addressForm.fullName.trim().length < 2) {
      toast.error("Please enter full name");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(addressForm.phone.replace(/\D/g, ""))) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    if (!addressForm.addressLine1.trim() || !addressForm.city.trim() || !addressForm.state.trim()) {
      toast.error("Please fill required address details");
      return;
    }
    if (!/^[1-9]\d{5}$/.test(addressForm.postalCode.trim())) {
      toast.error("Please enter a valid 6-digit PIN code");
      return;
    }

    setSavingAddress(true);
    try {
      await saveCustomerAddressServerFn({
        data: {
          authToken: sessionToken || undefined,
          id: editingAddressId || undefined,
          fullName: addressForm.fullName.trim(),
          phone: addressForm.phone.trim(),
          addressLine1: addressForm.addressLine1.trim(),
          addressLine2: addressForm.addressLine2.trim() || undefined,
          city: addressForm.city.trim(),
          state: addressForm.state.trim(),
          postalCode: addressForm.postalCode.trim(),
          isDefault: addressForm.isDefault,
        },
      });
      toast.success(editingAddressId ? "Address updated successfully" : "Address added to address book");
      resetForm();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save address");
    } finally {
      setSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    if (!confirm("Are you sure you want to delete this address?")) return;
    try {
      await deleteCustomerAddressServerFn({
        data: {
          authToken: sessionToken || undefined,
          addressId,
        },
      });
      toast.success("Address removed");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete address");
    }
  };

  const handleSetDefault = async (a: Address) => {
    try {
      await saveCustomerAddressServerFn({
        data: {
          authToken: sessionToken || undefined,
          id: a.id,
          fullName: a.full_name,
          phone: a.phone,
          addressLine1: a.address_line1,
          addressLine2: a.address_line2 || undefined,
          city: a.city,
          state: a.state,
          postalCode: a.postal_code,
          isDefault: true,
        },
      });
      toast.success("Set as default address");
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update default address");
    }
  };

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

      {/* SAVED BAG */}
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
              const itemName = c.name || p?.name;
              if (!itemName) return null;
              const itemPrice = c.price ?? p?.price ?? 0;
              const itemImage = c.image || (p ? imageFor(p, c.color) : "");
              return (
                <li
                  key={`${c.slug}${c.size}${c.color}`}
                  className="flex gap-3 rounded-xl border border-border bg-card p-3"
                >
                  {itemImage ? (
                    <img
                      src={itemImage}
                      alt={itemName}
                      className="h-20 w-16 rounded object-cover"
                    />
                  ) : (
                    <div className="h-20 w-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      CAV
                    </div>
                  )}
                  <div className="text-sm">
                    <p className="font-semibold">{itemName}</p>
                    <p className="text-muted-foreground">
                      {c.color} · {c.size} · ×{c.qty}
                    </p>
                    <p className="mt-1 font-bold">{formatINR(itemPrice * c.qty)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* WISHLIST */}
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

      {/* SAVED ADDRESSES */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-brand">SAVED ADDRESSES ({addresses.length})</h2>
          {!showAddressForm && (
            <button
              onClick={() => {
                resetForm();
                setShowAddressForm(true);
              }}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add New Address
            </button>
          )}
        </div>

        {/* Add/Edit Address Form */}
        {showAddressForm && (
          <form
            onSubmit={handleSaveAddress}
            className="mb-6 rounded-xl border border-primary/40 bg-card p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingAddressId ? "Edit Address" : "Add New Delivery Address"}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Full Name *</label>
                <input
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addressForm.fullName}
                  onChange={(e) => setAddressForm({ ...addressForm, fullName: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Mobile Phone *</label>
                <input
                  required
                  type="tel"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addressForm.phone}
                  onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Address Line 1 (Flat, House, Building, Street) *
                </label>
                <input
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addressForm.addressLine1}
                  onChange={(e) => setAddressForm({ ...addressForm, addressLine1: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Address Line 2 (Area, Landmark - Optional)
                </label>
                <input
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addressForm.addressLine2}
                  onChange={(e) => setAddressForm({ ...addressForm, addressLine2: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">City *</label>
                <input
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addressForm.city}
                  onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">State *</label>
                <select
                  required
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addressForm.state}
                  onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })}
                >
                  <option value="">Select State</option>
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">PIN Code *</label>
                <input
                  required
                  maxLength={6}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={addressForm.postalCode}
                  onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={addressForm.isDefault}
                  onChange={(e) => setAddressForm({ ...addressForm, isDefault: e.target.checked })}
                  className="h-4 w-4 rounded border-input"
                />
                <label htmlFor="isDefault" className="text-xs font-semibold cursor-pointer">
                  Set as default address
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-md border border-border px-4 py-2 text-xs font-semibold hover:bg-accent"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingAddress}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {savingAddress && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingAddressId ? "Save Changes" : "Save Address"}
              </button>
            </div>
          </form>
        )}

        {addresses.length === 0 && !showAddressForm ? (
          <p className="text-sm text-muted-foreground">
            No saved delivery addresses yet. Addresses added here or used during checkout will be saved securely.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {addresses.map((a) => (
              <div key={a.id} className="rounded-xl border border-border bg-card p-4 text-xs space-y-2 relative">
                <div className="flex items-center justify-between font-semibold text-foreground">
                  <span>{a.full_name}</span>
                  {a.is_default && (
                    <span className="rounded bg-gold/20 text-gold px-1.5 py-0.5 text-[10px] font-mono">
                      DEFAULT
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground">{a.phone}</p>
                <p className="text-foreground">
                  {a.address_line1}
                  {a.address_line2 ? `, ${a.address_line2}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {a.city}, {a.state} - {a.postal_code}
                </p>

                <div className="flex items-center gap-3 pt-2 border-t border-border/60">
                  <button
                    onClick={() => handleEditAddress(a)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => handleDeleteAddress(a.id)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-sale"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                  {!a.is_default && (
                    <button
                      onClick={() => handleSetDefault(a)}
                      className="ml-auto text-[11px] text-primary hover:underline"
                    >
                      Make Default
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ORDER HISTORY */}
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
