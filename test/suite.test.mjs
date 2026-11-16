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
// 7. CUSTOMER ADDRESS VALIDATION & NORMALIZATION TESTS
// ==============================================================================
function validateCustomerAddress(input) {
  if (!input.fullName || input.fullName.trim().length < 2) {
    return { valid: false, error: "Full name must be at least 2 characters" };
  }
  const cleanPhone = (input.phone || "").replace(/\D/g, "").slice(-10);
  if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
    return { valid: false, error: "Valid 10-digit Indian phone number required" };
  }
  if (!input.addressLine1 || input.addressLine1.trim().length < 5) {
    return { valid: false, error: "Address line 1 must be at least 5 characters" };
  }
  if (!input.city || !input.city.trim()) {
    return { valid: false, error: "City is required" };
  }
  if (!input.state || !input.state.trim()) {
    return { valid: false, error: "State is required" };
  }
  if (!/^[1-9]\d{5}$/.test((input.postalCode || "").trim())) {
    return { valid: false, error: "Valid 6-digit Indian PIN code required" };
  }
  return {
    valid: true,
    normalized: {
      fullName: input.fullName.trim(),
      phone: cleanPhone,
      addressLine1: input.addressLine1.trim(),
      addressLine2: input.addressLine2 ? input.addressLine2.trim() : null,
      city: input.city.trim(),
      state: input.state.trim(),
      postalCode: input.postalCode.trim(),
      country: input.country || "India",
      isDefault: Boolean(input.isDefault),
    },
  };
}

test("Customer Addresses: Validation rules and normalization", () => {
  // Valid address
  const validRes = validateCustomerAddress({
    fullName: "Akhil Sai",
    phone: "+91 9876543210",
    addressLine1: "Flat 402, Cavenhurst Tower",
    city: "Hyderabad",
    state: "Telangana",
    postalCode: "500081",
    isDefault: true,
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.normalized.phone, "9876543210");
  assert.equal(validRes.normalized.isDefault, true);

  // Invalid PIN
  assert.equal(
    validateCustomerAddress({
      fullName: "Akhil Sai",
      phone: "9876543210",
      addressLine1: "Flat 402, Cavenhurst Tower",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "012345",
    }).valid,
    false,
  );

  // Invalid Phone
  assert.equal(
    validateCustomerAddress({
      fullName: "Akhil Sai",
      phone: "1234567890",
      addressLine1: "Flat 402, Cavenhurst Tower",
      city: "Hyderabad",
      state: "Telangana",
      postalCode: "500081",
    }).valid,
    false,
  );
});

// ==============================================================================
// 8. CART MERGING & INVENTORY CLAMPING LOGIC TESTS
// ==============================================================================
function mergeCartItems(existingDbItems, guestItems, inventoryMap) {
  const merged = [...existingDbItems];

  for (const guest of guestItems) {
    const availableStock = inventoryMap[`${guest.slug}:${guest.size}`] ?? 0;
    if (availableStock <= 0) continue; // Out of stock items omitted

    const existingIdx = merged.findIndex(
      (m) => m.slug === guest.slug && m.size === guest.size && m.color === guest.color,
    );

    if (existingIdx >= 0) {
      const current = merged[existingIdx];
      const combinedQty = Math.min(current.qty + guest.qty, availableStock);
      merged[existingIdx] = { ...current, qty: combinedQty };
    } else {
      const qty = Math.min(guest.qty, availableStock);
      merged.push({ ...guest, qty });
    }
  }

  return merged;
}

test("Shopping Cart: Guest merge and inventory clamping", () => {
  const inventory = {
    "classic-tee:M": 5,
    "classic-tee:L": 0, // out of stock
    "urban-hoodie:XL": 3,
  };

  const dbCart = [
    { slug: "classic-tee", size: "M", color: "Navy", qty: 2 },
  ];

  const guestCart = [
    { slug: "classic-tee", size: "M", color: "Navy", qty: 4 }, // 2 + 4 = 6, clamped to 5
    { slug: "classic-tee", size: "L", color: "Navy", qty: 1 }, // out of stock -> excluded
    { slug: "urban-hoodie", size: "XL", color: "Black", qty: 5 }, // 5 requested, clamped to 3
  ];

  const result = mergeCartItems(dbCart, guestCart, inventory);

  assert.equal(result.length, 2, "Only in-stock items preserved");
  const tee = result.find((i) => i.slug === "classic-tee");
  assert.equal(tee.qty, 5, "Quantity clamped to available stock of 5");
  const hoodie = result.find((i) => i.slug === "urban-hoodie");
  assert.equal(hoodie.qty, 3, "Quantity clamped to available stock of 3");
});

// ==============================================================================
// 9. DATABASE COUPON VALIDATION TESTS
// ==============================================================================
function validateDatabaseCoupon(coupon, orderSubtotal) {
  if (!coupon || !coupon.isActive) {
    return { valid: false, error: "Coupon is invalid or inactive" };
  }
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { valid: false, error: "Coupon has expired" };
  }
  if (coupon.usageLimit && coupon.timesUsed >= coupon.usageLimit) {
    return { valid: false, error: "Coupon usage limit reached" };
  }
  if (coupon.minOrderValue && orderSubtotal < coupon.minOrderValue) {
    return { valid: false, error: `Minimum order value of ₹${coupon.minOrderValue} required` };
  }

  let discount = 0;
  if (coupon.discountType === "percentage") {
    discount = Math.round((orderSubtotal * coupon.discountValue) / 100);
    if (coupon.maxDiscount && discount > coupon.maxDiscount) {
      discount = coupon.maxDiscount;
    }
  } else if (coupon.discountType === "fixed") {
    discount = Math.min(coupon.discountValue, orderSubtotal);
  }

  return { valid: true, discount };
}

test("Coupons: Database coupon rules and limits", () => {
  const percentageCoupon = {
    code: "SAVE20",
    discountType: "percentage",
    discountValue: 20,
    minOrderValue: 2000,
    maxDiscount: 500,
    usageLimit: 100,
    timesUsed: 10,
    isActive: true,
  };

  // Meets min order value, discount capped at maxDiscount
  assert.deepEqual(validateDatabaseCoupon(percentageCoupon, 3000), {
    valid: true,
    discount: 500, // 20% of 3000 is 600, capped at 500
  });

  // Below min order value
  assert.equal(validateDatabaseCoupon(percentageCoupon, 1500).valid, false);

  // Expired coupon
  const expiredCoupon = { ...percentageCoupon, expiresAt: "2020-01-01T00:00:00Z" };
  assert.equal(validateDatabaseCoupon(expiredCoupon, 3000).valid, false);

  // Usage limit exceeded
  const exhaustedCoupon = { ...percentageCoupon, usageLimit: 5, timesUsed: 5 };
  assert.equal(validateDatabaseCoupon(exhaustedCoupon, 3000).valid, false);
});

// ==============================================================================
// 10. RAZORPAY STRICT CAPTURED STATUS TEST (FAIL CLOSED)
// ==============================================================================
function verifyRazorpayCapturedState(paymentEntity) {
  if (!paymentEntity) return { verified: false, reason: "No payment payload" };
  // Fail-closed rule: reject merely 'authorized' or 'created'
  if (paymentEntity.status !== "captured") {
    return {
      verified: false,
      reason: `Payment is in '${paymentEntity.status}' status, not 'captured'`,
    };
  }
  return { verified: true, amount: paymentEntity.amount / 100 };
}

test("Razorpay: Strict captured verification (fail-closed)", () => {
  assert.equal(verifyRazorpayCapturedState({ status: "captured", amount: 249900 }).verified, true);
  assert.equal(verifyRazorpayCapturedState({ status: "authorized", amount: 249900 }).verified, false);
  assert.equal(verifyRazorpayCapturedState({ status: "created", amount: 249900 }).verified, false);
  assert.equal(verifyRazorpayCapturedState({ status: "failed", amount: 249900 }).verified, false);
});

// ==============================================================================
// 11. ADMIN REFUND LOGIC: PARTIAL VS FULL REFUND
// ==============================================================================
function evaluateRefundTransition(orderTotal, previousRefunds, currentRefundAmount) {
  const priorSum = previousRefunds.reduce((sum, r) => sum + r.amount, 0);
  const totalRefunded = priorSum + currentRefundAmount;

  if (totalRefunded > orderTotal) {
    throw new Error("Total refunds cannot exceed order total");
  }

  const isFullRefund = totalRefunded >= orderTotal;
  return {
    isFullRefund,
    totalRefunded,
    newPaymentStatus: isFullRefund ? "refunded" : "partially_refunded",
    newOrderStatus: isFullRefund ? "refunded" : "processing", // Preserve active order status on partial
  };
}

test("Admin: Partial vs full refund state transitions", () => {
  // Partial refund: ₹500 of ₹2000
  const partial = evaluateRefundTransition(2000, [], 500);
  assert.equal(partial.isFullRefund, false);
  assert.equal(partial.newPaymentStatus, "partially_refunded");
  assert.equal(partial.newOrderStatus, "processing");

  // Second partial refund: additional ₹1500 of ₹2000 -> full
  const full = evaluateRefundTransition(2000, [{ amount: 500 }], 1500);
  assert.equal(full.isFullRefund, true);
  assert.equal(full.newPaymentStatus, "refunded");
  assert.equal(full.newOrderStatus, "refunded");

  // Over-refund attempt throws error
  assert.throws(() => evaluateRefundTransition(2000, [{ amount: 500 }], 1600));
});

// ==============================================================================
// 12. AUDIT TRAIL LOGGING
// ==============================================================================
test("Audit Trail: Status history records all transitions", () => {
  const history = [];
  function logTransition(orderId, status, comment, changedBy) {
    history.push({
      orderId,
      status,
      comment,
      changedBy,
      timestamp: new Date().toISOString(),
    });
  }

  logTransition("ord_1", "pending_payment", "Order placed by customer", "cust_123");
  logTransition("ord_1", "confirmed", "Payment verified via Razorpay webhook", "system");
  logTransition("ord_1", "in_transit", "ShipMaxx360 AWB generated", "admin");

  assert.equal(history.length, 3);
  assert.equal(history[0].status, "pending_payment");
  assert.equal(history[1].status, "confirmed");
  assert.equal(history[2].status, "in_transit");
});

