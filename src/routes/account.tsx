import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Truck, Shield, Plus, Trash2, Edit2, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { meta } from "@/components/site/InfoPage";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { getProduct, imageFor, resolveProductAsset } from "@/lib/products";
import { formatINR } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import {
  getCustomerAddressesServerFn,
  getCustomerOrdersServerFn,
  saveCustomerAddressServerFn,
  deleteCustomerAddressServerFn,
  getCustomerProfileServerFn,
  updateCustomerProfileServerFn,
} from "@/server/customers";
import { verifyCurrentAdminServerFn } from "@/server/admin";

export const Route = createFileRoute("/account")({
  head: () => meta("My Account", "Your CAVENHUSRT saved bag, wishlist and order history."),
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
  const { user, sessionToken, ready, signOut, refreshProfile } = useAuth();
  const { cart, wishlist } = useStore();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();

  // Profile State
  const [profileData, setProfileData] = useState<{
    fullName: string;
    email: string;
    phone: string;
  }>({
    fullName: "",
    email: "",
    phone: "",
  });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

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

  const loadData = useCallback(async () => {
    if (!user) return;

    try {
      const [addrs, ords, prof, adminCheck] = await Promise.all([
        getCustomerAddressesServerFn({ data: { authToken: sessionToken || undefined } }),
        getCustomerOrdersServerFn({ data: { authToken: sessionToken || undefined } }),
        getCustomerProfileServerFn({ data: { authToken: sessionToken || undefined } }),
        verifyCurrentAdminServerFn({ data: { authToken: sessionToken || undefined } }),
      ]);
      setAddresses((addrs as Address[]) || []);
      setOrders((ords as Order[]) || []);
      setIsAdmin(Boolean(adminCheck?.isAdmin));
      if (prof) {
        setProfileData({
          fullName: prof.fullName || (user.user_metadata?.full_name as string) || "",
          email: prof.email || user.email || "",
          phone: prof.phone || user.phone || "",
        });
      }
    } catch (err) {
      console.error("[Account] Error fetching customer data:", err);
    }
  }, [user, sessionToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Real-time updates for customer orders when authenticated via Supabase Auth JWT
  useEffect(() => {
    if (!user) return;
    let active = true;
    let activeChannel: ReturnType<typeof supabase.channel> | null = null;

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session?.access_token) return;
      activeChannel = supabase
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
    });

    return () => {
      active = false;
      if (activeChannel) {
        void supabase.removeChannel(activeChannel);
      }
    };
  }, [user, loadData]);

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
      toast.success(
        editingAddressId ? "Address updated successfully" : "Address added to address book",
      );
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

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileData.email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSavingProfile(true);
    try {
      await updateCustomerProfileServerFn({
        data: {
          authToken: sessionToken || undefined,
          fullName: profileData.fullName.trim() || undefined,
          email: profileData.email.trim().toLowerCase() || undefined,
          phone: profileData.phone.trim() || undefined,
        },
      });
      toast.success("Profile details saved successfully!");
      setIsEditingProfile(false);
      await refreshProfile();
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  if (!ready) return <div className="py-28 text-center text-muted-foreground">Loading…</div>;
  if (!user)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 font-sans">
        <h1 className="font-heading text-4xl sm:text-6xl font-bold uppercase tracking-tight text-foreground leading-none">
          My Account
        </h1>
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
      <div className="flex flex-wrap items-end justify-between gap-4 font-sans">
        <div>
          <h1 className="font-heading text-4xl sm:text-6xl font-bold uppercase tracking-tight text-foreground leading-none">
            My Account
          </h1>
          <p className="mt-2 font-medium text-silver">{name}</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-md border border-electric/40 bg-electric/10 px-4 py-2 font-sans text-xs font-bold uppercase tracking-wider text-electric"
            >
              <Shield className="h-4 w-4" /> Admin Portal
            </Link>
          )}
          <button
            onClick={async () => {
              await signOut();
              void navigate({ to: "/login", replace: true });
            }}
            className="rounded-md border border-border px-5 py-2 font-sans text-xs font-bold uppercase tracking-wider hover:bg-accent transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* PERSONAL PROFILE & CONTACT */}
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-base font-bold uppercase tracking-wider text-foreground">
              ACCOUNT DETAILS
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your registered email, name, and contact information.
            </p>
          </div>
          {!isEditingProfile && (
            <button
              onClick={() => setIsEditingProfile(true)}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-semibold hover:bg-accent"
            >
              <Edit2 className="h-3.5 w-3.5" /> Edit Profile
            </button>
          )}
        </div>

        {isEditingProfile ? (
          <form onSubmit={handleSaveProfile} className="mt-6 space-y-4 max-w-xl">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Full Name</label>
                <input
                  type="text"
                  value={profileData.fullName}
                  onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                  placeholder="e.g. John Doe"
                  className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Email Address</label>
                <input
                  type="email"
                  value={profileData.email}
                  onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                  placeholder="name@example.com"
                  className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Mobile Phone</label>
              <input
                type="tel"
                value={profileData.phone}
                onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                placeholder="10-digit mobile"
                className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none"
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
              >
                {savingProfile ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setIsEditingProfile(false)}
                className="rounded-lg border border-border px-4 py-2 text-xs hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-3 text-sm">
            <div className="min-w-0 rounded-xl border border-border/60 bg-background/50 p-3">
              <span className="text-xs text-muted-foreground">Name</span>
              <p className="mt-1 break-words font-semibold">
                {profileData.fullName || "Not provided"}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-border/60 bg-background/50 p-3">
              <span className="text-xs text-muted-foreground">Email Address</span>
              <p className="mt-1 break-all font-semibold">
                {profileData.email || user.email || "No email registered"}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-border/60 bg-background/50 p-3">
              <span className="text-xs text-muted-foreground">Phone Number</span>
              <p className="mt-1 break-words font-semibold">
                {profileData.phone || user.phone || "Not provided"}
              </p>
            </div>
          </div>
        )}

        {!profileData.email && !user.email && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3">
            <span>
              Please add your email address so you can receive order confirmations and invoice
              receipts.
            </span>
            {!isEditingProfile && (
              <button
                onClick={() => setIsEditingProfile(true)}
                className="underline font-bold text-amber-100 hover:text-white"
              >
                Add Email
              </button>
            )}
          </div>
        )}
      </section>

      {/* SAVED BAG */}
      <section>
        <div className="mb-4 flex justify-between">
          <h2 className="font-heading text-base font-bold uppercase tracking-wider text-foreground">
            SAVED BAG ({cart.length})
          </h2>
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
              const itemImage = resolveProductAsset(c.image) || (p ? imageFor(p, c.color) : "");
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
          <h2 className="font-heading text-base font-bold uppercase tracking-wider text-foreground">
            WISHLIST ({wishlist.length})
          </h2>
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
          <h2 className="font-heading text-base font-bold uppercase tracking-wider text-foreground">
            SAVED ADDRESSES ({addresses.length})
          </h2>
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
                <label className="text-xs font-semibold text-muted-foreground">
                  Mobile Phone *
                </label>
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
            No saved delivery addresses yet. Addresses added here or used during checkout will be
            saved securely.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {addresses.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-border bg-card p-4 text-xs space-y-2 relative"
              >
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
        <h2 className="mb-4 font-heading text-base font-bold uppercase tracking-wider text-foreground">
          ORDER HISTORY
        </h2>
        {orders === null ? (
          <div className="space-y-3">
            {[1, 2].map((n) => (
              <div key={n} className="luxury-skeleton h-20 rounded-xl border border-border" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">You haven&apos;t placed any orders yet.</p>
            <Link
              to="/shop"
              className="mt-3 inline-block rounded-md bg-primary px-5 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90"
            >
              Explore Collection
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border bg-card/40">
            {orders.map((o) => {
              const items = Array.isArray(o.items)
                ? (o.items as Array<{
                    name?: string;
                    size?: string;
                    color?: string;
                    qty?: number;
                    price?: number;
                    image?: string | null;
                  }>)
                : [];
              const firstImg = resolveProductAsset(items[0]?.image);
              const refCode = o.awb_number || o.order_number || o.id;
              return (
                <li
                  key={o.id}
                  className="flex flex-col gap-3 p-4 text-sm transition-colors hover:bg-accent/20 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    {firstImg ? (
                      <img
                        src={firstImg}
                        alt={items[0]?.name || "Order item"}
                        className="h-14 w-11 shrink-0 rounded object-cover border border-border/60"
                      />
                    ) : null}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono font-bold">
                          #{o.order_number || o.id.slice(0, 8).toUpperCase()}
                        </p>
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            o.payment_status === "paid"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : o.status === "cancelled"
                                ? "bg-rose-500/15 text-rose-400"
                                : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          {o.status === "cancelled" ? "Cancelled" : o.payment_status || "Pending"}
                        </span>
                      </div>
                      {items.length > 0 && (
                        <p className="mt-1 text-xs text-silver">
                          {items
                            .slice(0, 2)
                            .map(
                              (item) =>
                                `${item.name || "Item"} (${item.size || "-"}) ×${item.qty || 1}`,
                            )
                            .join(" · ")}
                          {items.length > 2 ? ` +${items.length - 2} more` : ""}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 sm:justify-end sm:text-right">
                    {o.status !== "cancelled" && (
                      <Link
                        to="/track-order"
                        search={{ order: refCode }}
                        className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs text-silver transition hover:border-electric hover:text-foreground"
                      >
                        <Truck className="h-3.5 w-3.5" />{" "}
                        {o.awb_number ? `Track #${o.awb_number}` : "Track Order"}
                      </Link>
                    )}
                    <div>
                      <p className="font-mono font-bold">{formatINR(o.total)}</p>
                      <p className="text-xs capitalize text-silver">
                        {(o.shipment_status && o.shipment_status !== "unfulfilled"
                          ? o.shipment_status
                          : o.status
                        ).replace(/_/g, " ")}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
