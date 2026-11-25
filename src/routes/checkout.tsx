import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  Minus,
  Plus,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { meta } from "@/components/site/InfoPage";
import { Summary } from "@/components/site/Summary";
import { useStore } from "@/lib/store";
import { getProduct, imageFor, resolveProductAsset } from "@/lib/products";
import { calculateOrderPricingPaise, formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  placeOrderServerFn,
  verifyPaymentServerFn,
  checkPincodeServiceabilityFn,
  validateCouponServerFn,
} from "@/server/orders";
import { getCustomerAddressesServerFn } from "@/server/customers";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (response: unknown) => void) => void;
    };
  }
}

interface SavedAddressOption {
  id: string;
  full_name: string | null;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  is_default: boolean | null;
  address_type?: string | null;
}

export const Route = createFileRoute("/checkout")({
  validateSearch: (search: Record<string, unknown>): { mode?: "direct" | "cart" | undefined } => ({
    mode: search["mode"] === "direct" ? "direct" : search["mode"] === "cart" ? "cart" : undefined,
  }),
  head: () => meta("Checkout", "Secure checkout for CAVENHURST orders across India."),
  component: Checkout,
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

const METHODS = [
  { id: "online", label: "Pay Online", sub: "UPI, Cards, NetBanking (via Razorpay)" },
  { id: "cod", label: "Cash on Delivery", sub: "Pay cash upon delivery (ShipMaxx360)" },
] as const;

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

function Checkout() {
  const search = Route.useSearch();
  const isDirectBuy = search.mode === "direct";
  const checkoutMode: "DIRECT_BUY" | "CART_CHECKOUT" = isDirectBuy ? "DIRECT_BUY" : "CART_CHECKOUT";

  const {
    cart,
    clear,
    coupon,
    couponRule,
    setCoupon,
    setQty,
    remove,
    directBuyItem,
    directBuyCoupon,
    directBuyCouponRule,
    setDirectBuyQty,
    setDirectBuyCoupon,
    clearDirectBuy,
  } = useStore();
  const { user, sessionToken } = useAuth();
  const navigate = useNavigate();

  const checkoutItems = useMemo(
    () => (isDirectBuy ? (directBuyItem ? [directBuyItem] : []) : cart),
    [isDirectBuy, directBuyItem, cart],
  );
  const activeCoupon = isDirectBuy ? directBuyCoupon : coupon;
  const activeCouponRule = isDirectBuy ? directBuyCouponRule : couponRule;
  const setActiveCoupon = isDirectBuy ? setDirectBuyCoupon : setCoupon;

  const checkoutPricedItems = useMemo(
    () =>
      checkoutItems.map((c) => ({
        price: c.price ?? getProduct(c.slug)?.price ?? 0,
        qty: c.qty,
      })),
    [checkoutItems],
  );

  const checkoutPricing = useMemo(
    () =>
      calculateOrderPricingPaise({
        items: checkoutPricedItems,
        couponCode: activeCoupon,
        couponRule: activeCouponRule,
      }),
    [checkoutPricedItems, activeCoupon, activeCouponRule],
  );

  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const [paymentMode, setPaymentMode] = useState<"online" | "cod">("online");
  const [busy, setBusy] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderNumber: string;
    isCod: boolean;
    awbNumber?: string | undefined;
  } | null>(null);

  const [shippingInfo, setShippingInfo] = useState<{
    checking: boolean;
    serviceable: boolean | null;
    providerStatus?: "connected" | "pending_credentials" | undefined;
    message?: string | undefined;
    courier?: string | undefined;
    estimatedDays?: number | undefined;
  }>({
    checking: false,
    serviceable: null,
  });

  const [savedAddresses, setSavedAddresses] = useState<SavedAddressOption[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");
  const applyAddressRef = useRef<(addr: SavedAddressOption) => void>(() => {});

  const [f, setF] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pin: "",
  });

  // Prefill authenticated customer details and load saved address book
  useEffect(() => {
    if (user) {
      const metaData = user.user_metadata || {};
      const fullName = (metaData["full_name"] || metaData["name"] || "") as string;
      const phoneNum = (user.phone || metaData["phone"] || "") as string;
      const emailAddr = (user.email || "") as string;

      setF((prev) => ({
        ...prev,
        name: prev.name || fullName,
        phone: prev.phone || phoneNum.replace(/\D/g, "").slice(-10),
        email: prev.email || emailAddr,
      }));

      // Retrieve saved addresses from customer account
      getCustomerAddressesServerFn({
        data: { authToken: sessionToken || undefined },
      })
        .then((addrs) => {
          if (addrs && addrs.length > 0) {
            const list = addrs as unknown as SavedAddressOption[];
            setSavedAddresses(list);
            const defaultAddr = list.find((a) => a.is_default) || list[0];
            if (defaultAddr) {
              setSelectedAddressId(defaultAddr.id);
              applyAddressRef.current(defaultAddr);
            }
          }
        })
        .catch((err) => console.warn("[Checkout] Failed to load saved addresses:", err));
    }
  }, [user, sessionToken]);

  const applyAddress = (addr: SavedAddressOption) => {
    const fullStreet = [addr.address_line1, addr.address_line2].filter(Boolean).join(", ");
    setF((prev) => ({
      ...prev,
      name: addr.full_name || prev.name,
      phone: addr.phone || prev.phone,
      address: fullStreet || prev.address,
      city: addr.city || prev.city,
      state: addr.state || prev.state,
      pin: addr.postal_code || prev.pin,
    }));
    if (addr.postal_code && /^[1-9]\d{5}$/.test(addr.postal_code)) {
      void checkPincode(addr.postal_code, paymentMode === "cod" ? "cod" : "prepaid");
    }
  };
  applyAddressRef.current = applyAddress;

  const setField =
    (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.value;
      setF((prev) => ({ ...prev, [k]: val }));

      // Trigger serviceability check when a complete 6-digit pin is entered
      if (k === "pin" && /^[1-9]\d{5}$/.test(val)) {
        void checkPincode(val, paymentMode === "cod" ? "cod" : "prepaid");
      }
    };

  const checkPincode = async (pincode: string, mode: "prepaid" | "cod") => {
    setShippingInfo((s) => ({ ...s, checking: true }));
    try {
      const res = await checkPincodeServiceabilityFn({
        data: { pincode, paymentMode: mode },
      });
      setShippingInfo({
        checking: false,
        serviceable: res.serviceable,
        providerStatus: res.providerStatus,
        message: res.message,
        courier: res.courierPartner,
        estimatedDays: res.estimatedDays,
      });
    } catch (err) {
      setShippingInfo({
        checking: false,
        serviceable: false,
        providerStatus: "connected",
        message:
          err instanceof Error ? err.message : "Could not verify serviceability with ShipMaxx360.",
      });
    }
  };

  const clearCompletedOrderSource = () => {
    attemptKeyRef.current = null;
    if (isDirectBuy) {
      clearDirectBuy();
    } else {
      clear();
    }
  };

  const attemptKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  if (checkoutItems.length === 0 && !orderSuccess) {
    return (
      <div className="mx-auto max-w-xl px-4 py-28 text-center font-sans">
        <h1 className="font-heading text-4xl sm:text-5xl font-bold uppercase tracking-tight text-foreground">
          {isDirectBuy ? "No direct checkout item" : "Your bag is empty"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {isDirectBuy
            ? "Your Buy Now item is no longer active. Select a product or continue with your shopping bag."
            : "Add pieces from the collection to proceed with checkout."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/shop"
            className="inline-block rounded-md bg-primary px-8 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-primary-foreground shadow-lg hover:opacity-90"
          >
            Shop now
          </Link>
          {isDirectBuy && cart.length > 0 && (
            <Link
              to="/checkout"
              search={{ mode: "cart" }}
              className="inline-block rounded-md border border-border px-6 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.14em] text-foreground hover:bg-accent"
            >
              Checkout Bag ({cart.reduce((sum, item) => sum + item.qty, 0)})
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Order Confirmation State
  if (orderSuccess) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center font-sans">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="font-heading text-4xl sm:text-6xl font-bold uppercase tracking-tight text-foreground">
          Order Confirmed
        </h1>
        <p className="mt-3 font-heading text-lg sm:text-xl font-bold tracking-wider text-emerald-400">
          #{orderSuccess.orderNumber}
        </p>
        <p className="mt-4 text-sm sm:text-base text-muted-foreground leading-relaxed">
          Thank you for choosing CAVENHURST. Your order has been placed and is being prepared for
          dispatch from our logistics hub.
        </p>

        {orderSuccess.awbNumber && (
          <div className="mt-6 inline-block rounded-lg border border-border bg-card p-4 text-sm">
            <span className="text-muted-foreground">ShipMaxx360 AWB: </span>
            <span className="font-mono font-bold text-foreground">{orderSuccess.awbNumber}</span>
          </div>
        )}

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link
            to="/account"
            className="rounded-md bg-primary px-8 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] text-primary-foreground shadow-lg transition hover:opacity-90"
          >
            View in My Account
          </Link>
          <Link
            to="/track-order"
            className="rounded-md border border-border px-8 py-3.5 font-sans text-xs sm:text-sm font-bold uppercase tracking-[0.16em] transition hover:bg-accent"
          >
            Track Shipment
          </Link>
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (f.name.trim().length < 2) {
      toast.error("Please enter your full name");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(f.phone.replace(/\D/g, ""))) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(f.email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!f.address || !f.city || !f.state) {
      toast.error("Please complete your delivery address");
      return;
    }
    if (!/^[1-9]\d{5}$/.test(f.pin)) {
      toast.error("Please enter a valid 6-digit PIN code");
      return;
    }

    setBusy(true);

    try {
      const attemptFingerprint = `${checkoutMode}|${JSON.stringify(
        checkoutItems.map((item) => [item.slug, item.size, item.color, item.qty]),
      )}|${activeCoupon || ""}|${paymentMode}|${f.pin.trim()}`;

      if (!attemptKeyRef.current || attemptKeyRef.current.fingerprint !== attemptFingerprint) {
        const key =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        attemptKeyRef.current = { fingerprint: attemptFingerprint, key };
      }

      // Step 1: Place Order through secure server function (derives customer identity from session)
      const orderRes = await placeOrderServerFn({
        data: {
          authToken: sessionToken || undefined,
          customer: f,
          cart: checkoutItems,
          coupon: activeCoupon,
          paymentMethod: paymentMode,
          checkoutMode,
          idempotencyKey: attemptKeyRef.current.key,
        },
      });

      // Handle Cash on Delivery (COD)
      if (paymentMode === "cod") {
        clearCompletedOrderSource();
        setOrderSuccess({
          orderNumber: orderRes.orderNumber,
          isCod: true,
          awbNumber: orderRes.awbNumber,
        });
        toast.success(`Order #${orderRes.orderNumber} placed successfully via Cash on Delivery!`);
        setBusy(false);
        return;
      }

      // Handle Online Payment (Razorpay)
      if (paymentMode === "online") {
        if (!orderRes.razorpayOrderId || !orderRes.keyId) {
          toast.error(
            "Online payment gateway is temporarily unavailable. Please choose Cash on Delivery.",
          );
          setBusy(false);
          return;
        }

        // Load Razorpay Checkout SDK
        const loaded = await loadRazorpayScript();
        if (!loaded || !window.Razorpay) {
          toast.error(
            "Could not load Razorpay payment window. Please check your internet connection.",
          );
          setBusy(false);
          return;
        }

        const options = {
          key: orderRes.keyId,
          amount: orderRes.amountInPaise,
          currency: orderRes.currency || "INR",
          name: "CAVENHURST",
          description: `Order #${orderRes.orderNumber}`,
          order_id: orderRes.razorpayOrderId,
          prefill: {
            name: f.name,
            email: f.email,
            contact: f.phone,
          },
          theme: {
            color: "#0A1F3C", // CAVENHURST Midnight Navy
          },
          modal: {
            ondismiss: () => {
              setBusy(false);
              toast.info(
                isDirectBuy
                  ? "Payment window closed. Your Buy Now item remains ready."
                  : "Payment window closed. Your items remain in your cart.",
              );
            },
          },
          handler: async (response: {
            razorpay_payment_id: string;
            razorpay_order_id: string;
            razorpay_signature: string;
          }) => {
            try {
              toast.loading("Verifying payment security...", { id: "pay-verify" });

              // Server-side cryptographic signature & monetary verification
              const verifyRes = await verifyPaymentServerFn({
                data: {
                  authToken: sessionToken || undefined,
                  orderId: orderRes.orderId,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                },
              });

              toast.dismiss("pay-verify");

              if (verifyRes.success) {
                clearCompletedOrderSource();
                setOrderSuccess({
                  orderNumber: verifyRes.orderNumber,
                  isCod: false,
                });
                toast.success(`Payment verified! Order #${verifyRes.orderNumber} confirmed.`);
              } else {
                toast.error("Payment verification failed. Please contact support.");
              }
            } catch (err) {
              toast.dismiss("pay-verify");
              toast.error(err instanceof Error ? err.message : "Payment verification failed.");
            } finally {
              setBusy(false);
            }
          },
        };

        const rzp = new window.Razorpay(options);
        if (typeof rzp.on === "function") {
          rzp.on("payment.failed", (failedResp: unknown) => {
            setBusy(false);
            const errObj = failedResp as { error?: { description?: string } };
            toast.error(
              errObj?.error?.description ||
                "Payment could not be completed. You can retry safely without duplicate charges.",
            );
          });
        }
        rzp.open();
      }
    } catch (err) {
      console.error("[Checkout] Order submission error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to place order. Please try again.");
      setBusy(false);
    }
  };

  const inputClass =
    "w-full rounded-md border border-input bg-transparent px-3 py-3 text-sm outline-none transition focus:border-electric";

  return (
    <form
      onSubmit={submit}
      className="mx-auto grid max-w-7xl gap-10 px-4 py-12 lg:grid-cols-[1fr_400px]"
    >
      <div className="space-y-8">
        <div>
          <h1 className="font-heading text-4xl sm:text-6xl font-bold uppercase tracking-tight text-foreground leading-none">
            Checkout
          </h1>
          <p className="mt-2 text-xs sm:text-sm text-silver font-medium">
            Official CAVENHURST store · Dispatched via ShipMaxx360 from Andhra Pradesh Hub (521212)
          </p>
        </div>

        {/* Contact Information */}
        <section>
          <h2 className="mb-4 font-heading text-sm sm:text-base font-bold uppercase tracking-wider text-foreground">
            1. CONTACT INFORMATION
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              className={inputClass}
              placeholder="Full name *"
              value={f.name}
              onChange={setField("name")}
            />
            <input
              required
              type="tel"
              className={inputClass}
              placeholder="Mobile number (10 digits) *"
              value={f.phone}
              onChange={setField("phone")}
            />
            <input
              required
              type="email"
              className={cn(inputClass, "sm:col-span-2")}
              placeholder="Email address for order receipt *"
              value={f.email}
              onChange={setField("email")}
            />
          </div>
        </section>

        {/* Shipping Address */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-sm sm:text-base font-bold uppercase tracking-wider text-foreground">
              2. DELIVERY ADDRESS
            </h2>
            <span className="flex items-center gap-1 text-xs text-silver">
              <Truck className="h-3.5 w-3.5" /> India-wide delivery
            </span>
          </div>

          {savedAddresses.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-silver uppercase tracking-wider mb-2">
                Saved Address Book
              </p>
              <div className="grid gap-2 sm:grid-cols-2 mb-4">
                {savedAddresses.map((a) => {
                  const isSel = selectedAddressId === a.id;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setSelectedAddressId(a.id);
                        applyAddress(a);
                      }}
                      className={cn(
                        "text-left p-3 rounded-lg border text-xs transition",
                        isSel
                          ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                          : "border-border bg-card text-muted-foreground hover:border-silver/40",
                      )}
                    >
                      <div className="flex items-center justify-between font-semibold text-foreground">
                        <span>{a.full_name}</span>
                        {a.is_default && (
                          <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-mono">
                            DEFAULT
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1">{a.address_line1}</p>
                      <p>
                        {a.city}, {a.state} - {a.postal_code}
                      </p>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAddressId("new");
                  }}
                  className={cn(
                    "text-left p-3 rounded-lg border text-xs flex items-center justify-center font-semibold transition py-4",
                    selectedAddressId === "new"
                      ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary"
                      : "border-dashed border-border text-muted-foreground hover:border-silver/40",
                  )}
                >
                  + Deliver to a different address
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              className={cn(inputClass, "sm:col-span-2")}
              placeholder="House / Flat / Building / Street *"
              value={f.address}
              onChange={setField("address")}
            />
            <input
              required
              className={inputClass}
              placeholder="City / District *"
              value={f.city}
              onChange={setField("city")}
            />
            <select
              required
              className={cn(inputClass, "bg-background")}
              value={f.state}
              onChange={setField("state")}
            >
              <option value="">Select State *</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="sm:col-span-2">
              <input
                required
                maxLength={6}
                className={inputClass}
                placeholder="PIN Code (6 digits) *"
                value={f.pin}
                onChange={setField("pin")}
              />
              {shippingInfo.checking && (
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying ShipMaxx360
                  serviceability...
                </p>
              )}
              {shippingInfo.serviceable === true && (
                <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Serviceable via {shippingInfo.courier || "ShipMaxx360"}
                  {shippingInfo.estimatedDays
                    ? ` · Estimated delivery in ${shippingInfo.estimatedDays} days`
                    : ""}
                </p>
              )}
              {shippingInfo.providerStatus === "pending_credentials" && (
                <p className="mt-2 flex items-center gap-2 text-xs font-semibold text-emerald-500">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Valid 6-digit Indian PIN code · Courier dispatch scheduled upon order confirmation
                </p>
              )}
              {shippingInfo.serviceable === false &&
                shippingInfo.providerStatus !== "pending_credentials" && (
                  <p className="mt-2 text-xs font-semibold text-rose-500">
                    {shippingInfo.message ||
                      "This delivery pincode is not serviceable by ShipMaxx360."}
                  </p>
                )}
            </div>
          </div>
        </section>

        {/* Payment Method */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-sm sm:text-base font-bold uppercase tracking-wider text-foreground">
              3. PAYMENT OPTION
            </h2>
            <span className="flex items-center gap-1 text-xs text-silver">
              <ShieldCheck className="h-3.5 w-3.5" /> 256-bit SSL encrypted
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {METHODS.map(({ id, label, sub }) => (
              <label
                key={id}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-lg border border-border p-4 transition",
                  paymentMode === id && "border-electric bg-secondary font-bold shadow-sm",
                )}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="paymentMode"
                    checked={paymentMode === id}
                    onChange={() => {
                      setPaymentMode(id);
                      if (/^[1-9]\d{5}$/.test(f.pin)) {
                        void checkPincode(f.pin, id === "cod" ? "cod" : "prepaid");
                      }
                    }}
                  />
                  <span className="text-sm font-semibold">{label}</span>
                </div>
                <span className="ml-6 text-xs text-muted-foreground">{sub}</span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>
              {paymentMode === "online"
                ? "Online payments are processed securely via Razorpay (UPI, Credit/Debit Cards, NetBanking)."
                : "Pay in cash to the ShipMaxx360 delivery executive upon parcel arrival."}
            </span>
          </div>
        </section>
      </div>

      {/* Order Summary Aside */}
      <aside className="h-fit rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-brand">YOUR ORDER</h2>
              <span
                className={cn(
                  "rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider",
                  isDirectBuy
                    ? "bg-electric/20 text-electric border border-electric/30"
                    : "bg-secondary text-silver",
                )}
              >
                {isDirectBuy ? "Buy Now" : "Bag"}
              </span>
            </div>
          </div>
          {isDirectBuy && checkoutItems[0] ? (
            <Link
              to="/product/$slug"
              params={{ slug: checkoutItems[0].slug }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to item
            </Link>
          ) : (
            <Link
              to="/cart"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Edit bag
            </Link>
          )}
        </div>

        <ul className="mb-5 space-y-3">
          {checkoutItems.map((c, idx) => {
            const p = getProduct(c.slug);
            const itemName = c.name || p?.name;
            if (!itemName) return null;
            const itemPrice = c.price ?? p?.price ?? 0;
            const itemImage = resolveProductAsset(c.image) || (p ? imageFor(p, c.color) : "");
            const maxStock = c.maxStock ?? p?.stock?.[c.size] ?? 10;
            return (
              <li
                key={`${c.slug}-${c.size}-${c.color}`}
                className="flex gap-3 rounded-lg border border-border/60 bg-background/40 p-2.5 text-sm"
              >
                {itemImage ? (
                  <img src={itemImage} alt={itemName} className="h-20 w-16 rounded object-cover" />
                ) : (
                  <div className="h-20 w-16 rounded bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
                    CAV
                  </div>
                )}
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-snug">{itemName}</p>
                    <button
                      type="button"
                      aria-label={`Remove ${itemName}`}
                      onClick={() => {
                        if (isDirectBuy) {
                          clearDirectBuy();
                        } else {
                          remove(idx);
                        }
                      }}
                      className="text-muted-foreground transition hover:text-sale"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {c.color} · Size {c.size}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center rounded border border-border">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        disabled={c.qty <= 1}
                        onClick={() => {
                          if (isDirectBuy) setDirectBuyQty(c.qty - 1);
                          else setQty(idx, c.qty - 1);
                        }}
                        className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-xs font-semibold">{c.qty}</span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        disabled={c.qty >= maxStock}
                        onClick={() => {
                          if (c.qty >= maxStock) {
                            toast.error(`Only ${maxStock} left in ${c.size}`);
                            return;
                          }
                          if (isDirectBuy) setDirectBuyQty(c.qty + 1);
                          else setQty(idx, c.qty + 1);
                        }}
                        className="px-2 py-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <p className="font-bold">{formatINR(itemPrice * c.qty)}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mb-4 flex gap-2">
          <input
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void (async () => {
                  const k = couponInput.trim().toUpperCase();
                  if (!k) return;
                  setApplyingCoupon(true);
                  try {
                    const res = await validateCouponServerFn({
                      data: { code: k, subtotalRupees: checkoutPricing.subtotal },
                    });
                    if (res.valid && res.rule) {
                      setActiveCoupon(res.rule.code, res.rule);
                      setCouponInput("");
                      toast.success(res.message);
                    } else {
                      toast.error(res.message || "Invalid coupon code");
                    }
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not verify coupon");
                  } finally {
                    setApplyingCoupon(false);
                  }
                })();
              }
            }}
            placeholder="Promo code (e.g. CAVEN10)"
            disabled={applyingCoupon}
            className="flex-1 rounded-md border border-input bg-transparent px-3 py-2 text-xs uppercase font-bold tracking-wider outline-none focus:border-electric disabled:opacity-60"
          />
          <button
            type="button"
            disabled={applyingCoupon}
            onClick={async () => {
              const k = couponInput.trim().toUpperCase();
              if (!k) {
                toast.error("Enter a coupon code");
                return;
              }
              setApplyingCoupon(true);
              try {
                const res = await validateCouponServerFn({
                  data: { code: k, subtotalRupees: checkoutPricing.subtotal },
                });
                if (res.valid && res.rule) {
                  setActiveCoupon(res.rule.code, res.rule);
                  setCouponInput("");
                  toast.success(res.message);
                } else {
                  toast.error(res.message || "Invalid coupon code");
                }
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not verify coupon");
              } finally {
                setApplyingCoupon(false);
              }
            }}
            className="rounded-md bg-secondary px-3.5 text-xs font-bold uppercase tracking-wider hover:bg-secondary/80 disabled:opacity-60"
          >
            {applyingCoupon ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply"}
          </button>
        </div>

        {activeCoupon && (
          <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>Coupon applied: {activeCoupon}</span>
            <button
              type="button"
              onClick={() => setActiveCoupon(null, null)}
              className="underline hover:text-foreground"
            >
              Remove
            </button>
          </div>
        )}

        <Summary
          items={checkoutPricedItems}
          couponCodeOverride={activeCoupon}
          couponRuleOverride={activeCouponRule}
        />

        <button
          type="submit"
          disabled={
            busy ||
            (shippingInfo.providerStatus === "connected" && shippingInfo.serviceable === false)
          }
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3.5 font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Processing order...
            </>
          ) : paymentMode === "online" ? (
            `Pay ${formatINR(checkoutPricing.total)} Online via Razorpay`
          ) : (
            `Confirm COD Order (${formatINR(checkoutPricing.total)})`
          )}
        </button>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          By placing your order, you agree to our{" "}
          <Link to="/terms" className="underline hover:text-foreground">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/privacy" className="underline hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </aside>
    </form>
  );
}
