import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, Lock, ShieldCheck, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { meta } from "@/components/site/InfoPage";
import { Summary } from "@/components/site/Summary";
import { useStore } from "@/lib/store";
import { getProduct, imageFor } from "@/lib/products";
import { formatINR } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import {
  placeOrderServerFn,
  verifyPaymentServerFn,
  checkPincodeServiceabilityFn,
} from "@/server/orders";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: (response: unknown) => void) => void;
    };
  }
}

export const Route = createFileRoute("/checkout")({
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
  const { cart, clear, coupon } = useStore();
  const { user } = useAuth();
  const navigate = useNavigate();

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
    message?: string | undefined;
    courier?: string | undefined;
    estimatedDays?: number | undefined;
  }>({
    checking: false,
    serviceable: null,
  });

  const [f, setF] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    pin: "",
  });

  // Prefill authenticated customer details
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
    }
  }, [user]);

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
        message: res.message,
        courier: res.courierPartner,
        estimatedDays: res.estimatedDays,
      });
    } catch (err) {
      setShippingInfo({
        checking: false,
        serviceable: false,
        message:
          err instanceof Error ? err.message : "Could not verify serviceability with ShipMaxx360.",
      });
    }
  };

  if (cart.length === 0 && !orderSuccess) {
    return (
      <div className="py-28 text-center">
        <h1 className="font-serif text-4xl italic">Your bag is empty</h1>
        <Link to="/shop" className="mt-6 inline-block underline">
          Shop now
        </Link>
      </div>
    );
  }

  // Order Confirmation State
  if (orderSuccess) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="font-serif text-5xl italic">Order Confirmed</h1>
        <p className="mt-3 text-lg font-bold tracking-brand text-foreground">
          #{orderSuccess.orderNumber}
        </p>
        <p className="mt-4 text-muted-foreground">
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
            className="rounded-md bg-primary px-6 py-3.5 font-bold text-primary-foreground transition hover:opacity-90"
          >
            View in My Account
          </Link>
          <Link
            to="/track-order"
            className="rounded-md border border-border px-6 py-3.5 font-bold transition hover:bg-accent"
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
      // Step 1: Place Order through secure server function (derives customer identity from session)
      const orderRes = await placeOrderServerFn({
        data: {
          customer: f,
          cart,
          coupon,
          paymentMethod: paymentMode,
        },
      });

      // Handle Cash on Delivery (COD)
      if (paymentMode === "cod") {
        clear();
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
              toast.info("Payment window closed. Your items remain in your cart.");
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
                  orderId: orderRes.orderId,
                  razorpayOrderId: response.razorpay_order_id,
                  razorpayPaymentId: response.razorpay_payment_id,
                  razorpaySignature: response.razorpay_signature,
                },
              });

              toast.dismiss("pay-verify");

              if (verifyRes.success) {
                clear();
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
          <h1 className="font-serif text-5xl italic">Checkout</h1>
          <p className="mt-2 text-sm text-silver">
            Official CAVENHURST store · Dispatched via ShipMaxx360 from Andhra Pradesh Hub (521212)
          </p>
        </div>

        {/* Contact Information */}
        <section>
          <h2 className="mb-4 text-sm font-bold tracking-brand">1. CONTACT INFORMATION</h2>
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
            <h2 className="text-sm font-bold tracking-brand">2. DELIVERY ADDRESS</h2>
            <span className="flex items-center gap-1 text-xs text-silver">
              <Truck className="h-3.5 w-3.5" /> India-wide delivery
            </span>
          </div>

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
              {shippingInfo.serviceable === false && (
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
            <h2 className="text-sm font-bold tracking-brand">3. PAYMENT OPTION</h2>
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
        <h2 className="mb-4 text-sm font-bold tracking-brand">YOUR ORDER</h2>
        <ul className="mb-5 space-y-3">
          {cart.map((c) => {
            const p = getProduct(c.slug);
            if (!p) return null;
            return (
              <li key={`${c.slug}-${c.size}-${c.color}`} className="flex gap-3 text-sm">
                <img
                  src={imageFor(p, c.color)}
                  alt={p.name}
                  className="h-16 w-12 rounded object-cover"
                />
                <div className="flex-1">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.color} · {c.size} · ×{c.qty}
                  </p>
                  <p className="mt-0.5 font-bold">{formatINR(p.price * c.qty)}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <Summary />

        <button
          type="submit"
          disabled={busy || shippingInfo.serviceable === false}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3.5 font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Processing order...
            </>
          ) : paymentMode === "online" ? (
            "Pay Online via Razorpay"
          ) : (
            "Confirm Cash on Delivery Order"
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
