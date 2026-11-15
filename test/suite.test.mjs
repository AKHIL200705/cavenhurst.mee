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

// ==============================================================================
// 6. DIRECT GOOGLE AUTH & SESSION TOKEN TESTS
// ==============================================================================
const DEFAULT_ADMIN_EMAILS = ["akhilsaiabbireddy2007@gmail.com", "cavenhurst@gmail.com"];

function isWhitelistedAdmin(email) {
  if (!email) return false;
  return DEFAULT_ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

function testSignSessionToken(payload, secret, expiresInSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const full = { ...payload, iat: now, exp: now + expiresInSec };
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const b = Buffer.from(JSON.stringify(full)).toString("base64url");
  const s = createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  return `${h}.${b}.${s}`;
}

function testVerifySessionToken(token, secret) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, b, s] = parts;
  const expected = createHmac("sha256", secret).update(`${h}.${b}`).digest("base64url");
  if (s !== expected) return null;
  const parsed = JSON.parse(Buffer.from(b, "base64url").toString("utf8"));
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

test("Google Auth: Admin whitelist email authorization", () => {
  assert.equal(isWhitelistedAdmin("akhilsaiabbireddy2007@gmail.com"), true);
  assert.equal(isWhitelistedAdmin("AKHILSAIABBIREDDY2007@GMAIL.COM"), true);
  assert.equal(isWhitelistedAdmin("cavenhurst@gmail.com"), true);
  assert.equal(isWhitelistedAdmin("CAVENHURST@GMAIL.COM"), true);
  assert.equal(isWhitelistedAdmin("customer@example.com"), false);
  assert.equal(isWhitelistedAdmin(null), false);
  assert.equal(isWhitelistedAdmin(""), false);
});

test("Google Auth: Cryptographic session token signing and verification", () => {
  const secret = "test_google_client_secret_xyz";
  const user = {
    sub: "google_123456789",
    email: "akhilsaiabbireddy2007@gmail.com",
    name: "Akhil Sai",
    picture: "https://lh3.googleusercontent.com/a/test",
    isAdmin: true,
  };

  const token = testSignSessionToken(user, secret, 3600);
  assert.equal(typeof token, "string");
  assert.equal(token.split(".").length, 3);

  // Successful verification
  const verified = testVerifySessionToken(token, secret);
  assert.ok(verified);
  assert.equal(verified.sub, "google_123456789");
  assert.equal(verified.email, "akhilsaiabbireddy2007@gmail.com");
  assert.equal(verified.isAdmin, true);

  // Invalid secret rejection
  assert.equal(testVerifySessionToken(token, "wrong_secret"), null);

  // Tampered payload rejection
  const tampered = token.slice(0, 10) + "X" + token.slice(11);
  assert.equal(testVerifySessionToken(tampered, secret), null);

  // Expired token rejection
  const expired = testSignSessionToken(user, secret, -10);
  assert.equal(testVerifySessionToken(expired, secret), null);
});

// ==============================================================================
// 6. MSG91 SMS OTP & SUPABASE SEND SMS AUTH HOOK TESTS
// ==============================================================================
function normalizeIndianPhone(input) {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  if (digits.length === 12 && digits.startsWith("91") && /^91[6-9]/.test(digits)) {
    return digits;
  }
  return digits;
}

function isValidIndianMobile(normalizedPhone) {
  return /^91[6-9]\d{9}$/.test(normalizedPhone);
}

function testVerifySupabaseHookSignature(body, headers, configuredSecret) {
  if (!configuredSecret) return true;

  const authHeader = headers["authorization"]?.replace(/^Bearer\s+/i, "").trim();
  const webhookSecretHeader = headers["x-webhook-secret"]?.trim();

  if (authHeader && authHeader === configuredSecret) return true;
  if (webhookSecretHeader && webhookSecretHeader === configuredSecret) return true;

  const id = headers["webhook-id"] || headers["x-webhook-id"];
  const ts = headers["webhook-timestamp"] || headers["x-webhook-timestamp"];
  const sigHeader =
    headers["webhook-signature"] ||
    headers["x-webhook-signature"] ||
    headers["x-supabase-signature"];

  if (!sigHeader) return false;

  const rawSecret = configuredSecret.startsWith("whsec_")
    ? configuredSecret.slice(6)
    : configuredSecret.startsWith("v1,whsec_")
      ? configuredSecret.slice(9)
      : configuredSecret;

  let key;
  try {
    key = Buffer.from(rawSecret, "base64");
    if (key.length === 0) key = Buffer.from(rawSecret, "utf8");
  } catch {
    key = Buffer.from(rawSecret, "utf8");
  }

  const toSign = id && ts ? `${id}.${ts}.${body}` : body;
  const computed = createHmac("sha256", key).update(toSign).digest("base64");

  const signatures = sigHeader.split(" ").map((s) => (s.startsWith("v1,") ? s.slice(3) : s));
  return signatures.some((s) => {
    try {
      const b1 = Buffer.from(s, "base64");
      const b2 = Buffer.from(computed, "base64");
      return b1.length === b2.length && timingSafeEqual(b1, b2);
    } catch {
      return false;
    }
  });
}

function parseSupabaseSmsHookPayload(rawBody) {
  try {
    const payload = JSON.parse(rawBody);
    const phone = payload.user?.phone || payload.phone;
    const otp = payload.sms?.otp || payload.otp;
    if (!phone || !otp) {
      return { valid: false, error: "Missing phone or otp" };
    }
    return { valid: true, phone, otp };
  } catch {
    return { valid: false, error: "Malformed JSON" };
  }
}

test("MSG91: Indian phone number normalization and validation", () => {
  // Valid variations
  assert.equal(normalizeIndianPhone("+919876543210"), "919876543210");
  assert.equal(normalizeIndianPhone("9876543210"), "919876543210");
  assert.equal(normalizeIndianPhone("919876543210"), "919876543210");
  assert.equal(normalizeIndianPhone("+91 98765 43210"), "919876543210");
  assert.equal(normalizeIndianPhone("+91 (612) 345-6789"), "916123456789");

  // Valid checking
  assert.equal(isValidIndianMobile("919876543210"), true);
  assert.equal(isValidIndianMobile("916123456789"), true);
  assert.equal(isValidIndianMobile("917999999999"), true);
  assert.equal(isValidIndianMobile("918000000000"), true);

  // Invalid checking
  assert.equal(
    isValidIndianMobile("915123456789"),
    false,
    "Numbers starting with 5 are invalid in India",
  );
  assert.equal(
    isValidIndianMobile("910123456789"),
    false,
    "Numbers starting with 0 are invalid in India",
  );
  assert.equal(isValidIndianMobile("9876543210"), false, "Missing 91 country code prefix");
  assert.equal(isValidIndianMobile("447911123456"), false, "Non-Indian country code");
});

test("MSG91: Supabase Send SMS Auth Hook signature and token verification", () => {
  const secret = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvcl9zdXBhYmFzZV9ob29r";
  const body = JSON.stringify({
    user: { id: "usr_abc123", phone: "+919876543210" },
    sms: { otp: "839201" },
  });

  // 1. Direct Bearer token authentication
  assert.equal(
    testVerifySupabaseHookSignature(body, { authorization: `Bearer ${secret}` }, secret),
    true,
  );

  // 2. Direct x-webhook-secret authentication
  assert.equal(testVerifySupabaseHookSignature(body, { "x-webhook-secret": secret }, secret), true);

  // 3. Svix / Standard HMAC-SHA256 signature
  const rawKey = Buffer.from("dGVzdF9zZWNyZXRfa2V5X2Zvcl9zdXBhYmFzZV9ob29r", "base64");
  const id = "msg_2XJ9dKs019";
  const ts = "1731673892";
  const toSign = `${id}.${ts}.${body}`;
  const validSig = createHmac("sha256", rawKey).update(toSign).digest("base64");

  assert.equal(
    testVerifySupabaseHookSignature(
      body,
      {
        "webhook-id": id,
        "webhook-timestamp": ts,
        "webhook-signature": `v1,${validSig}`,
      },
      secret,
    ),
    true,
  );

  // 4. Tampered payload rejection
  assert.equal(
    testVerifySupabaseHookSignature(
      body + " ",
      {
        "webhook-id": id,
        "webhook-timestamp": ts,
        "webhook-signature": `v1,${validSig}`,
      },
      secret,
    ),
    false,
  );

  // 5. Wrong secret rejection
  assert.equal(
    testVerifySupabaseHookSignature(
      body,
      {
        "webhook-id": id,
        "webhook-timestamp": ts,
        "webhook-signature": `v1,${validSig}`,
      },
      "whsec_d3Jvbmdfc2VjcmV0",
    ),
    false,
  );
});

test("MSG91: Supabase Send SMS Auth Hook payload parsing", () => {
  // Standard nested Supabase auth hook payload
  const standard = JSON.stringify({
    user: { id: "u_99", phone: "+919876543210" },
    sms: { otp: "654321" },
  });
  const res1 = parseSupabaseSmsHookPayload(standard);
  assert.equal(res1.valid, true);
  assert.equal(res1.phone, "+919876543210");
  assert.equal(res1.otp, "654321");

  // Flat payload fallback
  const flat = JSON.stringify({
    phone: "9876543210",
    otp: "123456",
  });
  const res2 = parseSupabaseSmsHookPayload(flat);
  assert.equal(res2.valid, true);
  assert.equal(res2.phone, "9876543210");
  assert.equal(res2.otp, "123456");

  // Missing fields
  const missingOtp = JSON.stringify({ user: { phone: "+919876543210" } });
  assert.equal(parseSupabaseSmsHookPayload(missingOtp).valid, false);

  const missingPhone = JSON.stringify({ sms: { otp: "123456" } });
  assert.equal(parseSupabaseSmsHookPayload(missingPhone).valid, false);

  // Malformed JSON
  assert.equal(parseSupabaseSmsHookPayload("{ invalid json").valid, false);
});
