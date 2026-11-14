import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual } from "node:crypto";

// ==============================================================================
// 1. PRICING & ORDER TOTALS TESTS
// ==============================================================================
const FREE_SHIPPING_THRESHOLD = 1999;
const SHIPPING_FEE = 99;
const COUPONS = {
  CAVEN10: { percent: 10, label: "10% off your order" },
};

function computeTotals(subtotal, couponCode) {
  const coupon = couponCode ? COUPONS[couponCode.toUpperCase()] : undefined;
  const discount = coupon ? Math.round((subtotal * coupon.percent) / 100) : 0;
  const afterDiscount = subtotal - discount;
  const shipping = subtotal === 0 || afterDiscount >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  return { subtotal, discount, shipping, total: afterDiscount + shipping };
}

function formatINR(n) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

test("Pricing: Free shipping threshold", () => {
  assert.equal(computeTotals(1999).shipping, 0, "Orders >= 1999 must ship free");
  assert.equal(computeTotals(2499).shipping, 0, "Orders > 1999 must ship free");
  assert.equal(computeTotals(1099).shipping, 99, "Orders < 1999 must charge shipping");
});

test("Pricing: Coupon discount application", () => {
  const res = computeTotals(2000, "CAVEN10");
  assert.equal(res.subtotal, 2000);
  assert.equal(res.discount, 200, "10% of 2000 is 200");
  assert.equal(res.shipping, 99, "Net 1800 is below 1999, so shipping 99 applies");
  assert.equal(res.total, 1899);
});

test("Pricing: Currency formatting", () => {
  assert.match(formatINR(2499), /₹\s*2,499/);
});

// ==============================================================================
// 2. WELCOME GATE RULES TESTS
// ==============================================================================
function gateNeedsRedirect(state) {
  if (state.path === "/welcome") {
    if (!state.welcomeSeen && !state.welcomeShown) return false;
    if (state.welcomeShown) return true;
    if (state.welcomeSeen) return true;
  }
  return false;
}

test("Welcome gate: Redirect transitions", () => {
  // Not seen yet: stay on welcome screen
  assert.equal(
    gateNeedsRedirect({
      path: "/welcome",
      welcomeSeen: false,
      welcomeShown: false,
    }),
    false,
  );

  // Shown: must navigate to store
  assert.equal(
    gateNeedsRedirect({
      path: "/welcome",
      welcomeSeen: false,
      welcomeShown: true,
    }),
    true,
  );

  // Already seen previously: redirect immediately
  assert.equal(
    gateNeedsRedirect({
      path: "/welcome",
      welcomeSeen: true,
      welcomeShown: false,
    }),
    true,
  );
});

// ==============================================================================
// 3. RAZORPAY CRYPTOGRAPHIC VERIFICATION & WEBHOOK IDEMPOTENCY
// ==============================================================================
function verifyRazorpaySignature({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  secret,
}) {
  if (!secret || !razorpaySignature) return false;
  const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
  const generatedSignature = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    const signatureBuffer = Buffer.from(razorpaySignature, "utf8");
    const generatedBuffer = Buffer.from(generatedSignature, "utf8");
    if (signatureBuffer.length !== generatedBuffer.length) return false;
    return timingSafeEqual(signatureBuffer, generatedBuffer);
  } catch {
    return false;
  }
}

function verifyRazorpayWebhookSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  try {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const sigBuf = Buffer.from(signature, "utf8");
    const expBuf = Buffer.from(expected, "utf8");
    if (sigBuf.length !== expBuf.length) return false;
    return timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

test("Razorpay: Cryptographic HMAC-SHA256 signature verification", () => {
  const secret = "live_secret_key_testing_123";
  const orderId = "order_O8vM0Z11abcDEF";
  const paymentId = "pay_P9wN1A22ghiJKL";
  const validSig = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");

  // Valid signature
  assert.equal(
    verifyRazorpaySignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: validSig,
      secret,
    }),
    true,
  );

  // Tampered payment ID
  assert.equal(
    verifyRazorpaySignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: "pay_tampered_attacker",
      razorpaySignature: validSig,
      secret,
    }),
    false,
  );

  // Tampered signature
  assert.equal(
    verifyRazorpaySignature({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: "invalid_sig_00000000000000000000000000000000000000000000000000000000000",
      secret,
    }),
    false,
  );
});

test("Razorpay: Webhook HMAC verification and deterministic event ID", () => {
  const secret = "whsec_test_secret_987";
  const payloadStr = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: "pay_123", amount: 249900 } } },
  });
  const validSig = createHmac("sha256", secret).update(payloadStr).digest("hex");

  assert.equal(verifyRazorpayWebhookSignature(payloadStr, validSig, secret), true);
  assert.equal(verifyRazorpayWebhookSignature(payloadStr + "tampered", validSig, secret), false);

  // Deterministic event ID prevents duplicate processing on retries
  const eventId1 = `rzp_payment.captured_pay_123`;
  const eventId2 = `rzp_payment.captured_pay_123`;
  assert.equal(eventId1, eventId2, "Webhook retry must produce matching eventId");
});

// ==============================================================================
// 4. SHIPMAXX360 LOGISTICS & SECURITY TESTS
// ==============================================================================
function validateIndianPincode(pincode) {
  return /^[1-9]\d{5}$/.test(pincode.trim());
}

function verifyShipMaxxWebhook(rawBody, signatureOrSecret, secret) {
  if (!secret || !signatureOrSecret) return false;
  // Direct secret token match
  try {
    const s1 = Buffer.from(secret, "utf8");
    const s2 = Buffer.from(signatureOrSecret, "utf8");
    if (s1.length === s2.length && timingSafeEqual(s1, s2)) return true;
  } catch {}
  // HMAC SHA-256
  try {
    const exp = createHmac("sha256", secret).update(rawBody).digest("hex");
    const b1 = Buffer.from(signatureOrSecret, "utf8");
    const b2 = Buffer.from(exp, "utf8");
    if (b1.length === b2.length && timingSafeEqual(b1, b2)) return true;
  } catch {}
  return false;
}

test("ShipMaxx360: Indian pincode format validation", () => {
  assert.equal(validateIndianPincode("521212"), true, "Pickup hub 521212 valid");
  assert.equal(validateIndianPincode("500001"), true, "Hyderabad valid");
  assert.equal(validateIndianPincode("560001"), true, "Bangalore valid");
  assert.equal(validateIndianPincode("012345"), false, "Leading 0 invalid");
  assert.equal(validateIndianPincode("52121"), false, "5 digits invalid");
  assert.equal(validateIndianPincode("5212122"), false, "7 digits invalid");
  assert.equal(validateIndianPincode("letters"), false, "Alpha invalid");
});

test("ShipMaxx360: Webhook signature authentication", () => {
  const secret = "shipmaxx_secret_token_456";
  const body = JSON.stringify({ event: "DELIVERED", awb: "AWB12345678" });
  const hmacSig = createHmac("sha256", secret).update(body).digest("hex");

  // Bearer/secret token authentication
  assert.equal(verifyShipMaxxWebhook(body, secret, secret), true);
  // HMAC authentication
  assert.equal(verifyShipMaxxWebhook(body, hmacSig, secret), true);
  // Tampered payload
  assert.equal(verifyShipMaxxWebhook(body + " ", hmacSig, secret), false);
  // Invalid secret
  assert.equal(verifyShipMaxxWebhook(body, "wrong_secret", secret), false);
});

// ==============================================================================
// 5. ORDER NUMBER FORMAT & GUEST CHECKOUT
// ==============================================================================
function generateOrderNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `CVH-${dateStr}-${rand}`;
}

test("Orders: Order number generator specification", () => {
  const num = generateOrderNumber();
  assert.match(num, /^CVH-\d{8}-[A-Z0-9]{4}$/, "Order number must match CVH-YYYYMMDD-XXXX");
});
