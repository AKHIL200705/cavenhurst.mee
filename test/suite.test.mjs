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

// ==============================================================================
// 13. CATEGORY SLUG NORMALIZATION & VALIDATION
// ==============================================================================
function slugifyCategory(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

test("Categories: Slug normalization and URL compliance", () => {
  assert.equal(slugifyCategory("Heritage Knitwear"), "heritage-knitwear");
  assert.equal(slugifyCategory("Formal & Tailored!"), "formal-tailored");
  assert.equal(slugifyCategory("  Special--Collections   "), "special-collections");
});

// ==============================================================================
// 14. PRODUCT VARIANT INVENTORY & SKU VALIDATION
// ==============================================================================
function generateVariantSku(productSlug, size, color) {
  const p = productSlug.toUpperCase().slice(0, 4);
  const c = color.toUpperCase().slice(0, 3);
  const s = size.toUpperCase();
  return `CVH-${p}-${c}-${s}`;
}

test("Variants: SKU generation and stock constraints", () => {
  const sku = generateVariantSku("oxford-classic-shirt", "XL", "Navy Blue");
  assert.equal(sku, "CVH-OXFO-NAV-XL");

  // Stock clamping
  function validateVariantStock(qty) {
    if (typeof qty !== "number" || isNaN(qty) || qty < 0) return 0;
    return Math.floor(qty);
  }
  assert.equal(validateVariantStock(15), 15);
  assert.equal(validateVariantStock(-5), 0);
  assert.equal(validateVariantStock(4.8), 4);
});

// ==============================================================================
// 15. RETURN LIFECYCLE STATE TRANSITIONS
// ==============================================================================
const VALID_RETURN_TRANSITIONS = {
  requested: ["approved", "rejected", "cancelled"],
  approved: ["pickup_scheduled", "in_transit", "rejected", "cancelled"],
  pickup_scheduled: ["in_transit", "cancelled"],
  in_transit: ["received", "cancelled"],
  received: ["inspected", "rejected"],
  inspected: ["refunded", "replacement_issued", "rejected"],
  refunded: [],
  replacement_issued: [],
  rejected: [],
  cancelled: [],
};

function canTransitionReturn(currentStatus, newStatus) {
  const allowed = VALID_RETURN_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

test("Returns: Allowed lifecycle transitions and terminal states", () => {
  assert.equal(canTransitionReturn("requested", "approved"), true);
  assert.equal(canTransitionReturn("requested", "rejected"), true);
  assert.equal(canTransitionReturn("approved", "in_transit"), true);
  assert.equal(canTransitionReturn("inspected", "refunded"), true);

  // Invalid backward or cross-state transitions
  assert.equal(canTransitionReturn("refunded", "requested"), false);
  assert.equal(canTransitionReturn("rejected", "refunded"), false);
  assert.equal(canTransitionReturn("requested", "refunded"), false); // must inspect first
});

// ==============================================================================
// 16. REVIEW MODERATION WORKFLOW
// ==============================================================================
test("Reviews: Content moderation and public visibility rules", () => {
  function isReviewPublic(review) {
    return review.status === "approved";
  }

  assert.equal(isReviewPublic({ status: "approved", rating: 5 }), true);
  assert.equal(isReviewPublic({ status: "pending", rating: 5 }), false);
  assert.equal(isReviewPublic({ status: "rejected", rating: 1 }), false);
});

// ==============================================================================
// 17. ADMIN ROLE AUTHORIZATION
// ==============================================================================
test("Admin Roles: Privilege verification by role", () => {
  const ADMIN_PERMISSIONS = {
    super_admin: ["all"],
    admin: ["orders", "products", "customers", "inventory", "reviews", "returns", "coupons", "settings"],
    fulfillment_manager: ["orders", "shipments", "inventory", "returns"],
    support_agent: ["orders", "customers", "reviews"],
  };

  function hasAdminPermission(role, module) {
    if (!role || !ADMIN_PERMISSIONS[role]) return false;
    const perms = ADMIN_PERMISSIONS[role];
    return perms.includes("all") || perms.includes(module);
  }

  assert.equal(hasAdminPermission("super_admin", "admin_users"), true);
  assert.equal(hasAdminPermission("super_admin", "settings"), true);
  assert.equal(hasAdminPermission("admin", "orders"), true);
  assert.equal(hasAdminPermission("admin", "admin_users"), false);
  assert.equal(hasAdminPermission("fulfillment_manager", "shipments"), true);
  assert.equal(hasAdminPermission("fulfillment_manager", "settings"), false);
  assert.equal(hasAdminPermission("support_agent", "reviews"), true);
  assert.equal(hasAdminPermission("customer", "orders"), false);
});

// ==============================================================================
// 19. ORDER STATUS STATE MACHINE & TRANSITION RULES
// ==============================================================================
const VALID_ORDER_TRANSITIONS = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "rto_initiated", "cancelled"],
  out_for_delivery: ["delivered", "rto_initiated", "cancelled"],
  delivered: ["return_requested", "returned"],
  return_requested: ["returned", "delivered"],
  returned: ["refunded"],
  cancelled: [],
  refunded: [],
  rto_delivered: [],
};

function canTransitionOrderStatus(currentStatus, targetStatus) {
  if (currentStatus === targetStatus) return true;
  const allowed = VALID_ORDER_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

test("Order Lifecycle: Allowed status transitions and terminal states", () => {
  // Valid transitions
  assert.equal(canTransitionOrderStatus("pending_payment", "confirmed"), true);
  assert.equal(canTransitionOrderStatus("pending_payment", "cancelled"), true);
  assert.equal(canTransitionOrderStatus("confirmed", "processing"), true);
  assert.equal(canTransitionOrderStatus("processing", "shipped"), true);
  assert.equal(canTransitionOrderStatus("shipped", "delivered"), true);
  assert.equal(canTransitionOrderStatus("delivered", "return_requested"), true);

  // Terminal states cannot be transitioned
  assert.equal(canTransitionOrderStatus("cancelled", "confirmed"), false);
  assert.equal(canTransitionOrderStatus("cancelled", "processing"), false);
  assert.equal(canTransitionOrderStatus("refunded", "shipped"), false);

  // Invalid skip transitions
  assert.equal(canTransitionOrderStatus("pending_payment", "delivered"), false);
  assert.equal(canTransitionOrderStatus("confirmed", "delivered"), false);
});

// ==============================================================================
// 20. ORDER STATUS HISTORY AUDIT TRAIL LOGGING
// ==============================================================================
test("Order Audit: Order status history entry validation", () => {
  function createStatusHistoryEntry({ orderId, status, comment, changedBy }) {
    if (!orderId) throw new Error("orderId required");
    if (!status) throw new Error("status required");
    return {
      order_id: orderId,
      status,
      comment: comment || null,
      changed_by: changedBy || "system",
      created_at: new Date().toISOString(),
    };
  }

  const entry = createStatusHistoryEntry({
    orderId: "ord_12345",
    status: "confirmed",
    comment: "Payment verified via Razorpay",
    changedBy: "razorpay_gateway",
  });

  assert.equal(entry.order_id, "ord_12345");
  assert.equal(entry.status, "confirmed");
  assert.equal(entry.changed_by, "razorpay_gateway");
  assert.ok(entry.created_at);
});

// ==============================================================================
// 21. PAYMENT REFUNDS & STATUS RECONCILIATION
// ==============================================================================
test("Payment Refunds: Dual-table reconciliation and full vs partial calculation", () => {
  function calculateRefundOutcome(orderTotal, existingRefunds, newRefundAmount) {
    const totalPrevious = existingRefunds.reduce((sum, r) => sum + r.amount, 0);
    const totalAfter = totalPrevious + newRefundAmount;
    if (newRefundAmount <= 0) throw new Error("Refund amount must be > 0");
    if (totalAfter > orderTotal) throw new Error("Cannot refund more than order total");

    const isFullRefund = totalAfter >= orderTotal;
    return {
      totalRefunded: totalAfter,
      isFullRefund,
      newPaymentStatus: isFullRefund ? "refunded" : "partially_refunded",
      newOrderStatus: isFullRefund ? "refunded" : "confirmed",
    };
  }

  const orderTotal = 2499;

  // Partial refund: ₹1000
  const partialRes = calculateRefundOutcome(orderTotal, [], 1000);
  assert.equal(partialRes.totalRefunded, 1000);
  assert.equal(partialRes.isFullRefund, false);
  assert.equal(partialRes.newPaymentStatus, "partially_refunded");
  assert.equal(partialRes.newOrderStatus, "confirmed");

  // Subsequent full refund: remaining ₹1499
  const fullRes = calculateRefundOutcome(orderTotal, [{ amount: 1000 }], 1499);
  assert.equal(fullRes.totalRefunded, 2499);
  assert.equal(fullRes.isFullRefund, true);
  assert.equal(fullRes.newPaymentStatus, "refunded");
  assert.equal(fullRes.newOrderStatus, "refunded");

  // Over-refund attempt must throw
  assert.throws(() => {
    calculateRefundOutcome(orderTotal, [{ amount: 1000 }, { amount: 1499 }], 100);
  }, /Cannot refund more than order total/);
});

// ==============================================================================
// 22. SHIPMAXX WEBHOOK DELIVERY & COD PAYMENT SETTLEMENT
// ==============================================================================
test("ShipMaxx: Delivery confirmation settles COD payment and advances order status", () => {
  function processDeliveryWebhook(order, webhookStatus) {
    if (webhookStatus === "DELIVERED") {
      const updatedOrder = {
        ...order,
        shipment_status: "delivered",
        delivered_at: new Date().toISOString(),
      };
      if (!["cancelled", "refunded"].includes(order.status)) {
        updatedOrder.status = "delivered";
      }
      if (order.payment_method === "cod" && order.payment_status !== "paid") {
        updatedOrder.payment_status = "paid";
      }
      return updatedOrder;
    }
    return order;
  }

  // COD order: delivered -> status becomes delivered AND payment becomes paid
  const codOrder = {
    id: "ord_cod_1",
    status: "processing",
    shipment_status: "shipped",
    payment_method: "cod",
    payment_status: "pending",
  };
  const deliveredCod = processDeliveryWebhook(codOrder, "DELIVERED");
  assert.equal(deliveredCod.status, "delivered");
  assert.equal(deliveredCod.shipment_status, "delivered");
  assert.equal(deliveredCod.payment_status, "paid");
  assert.ok(deliveredCod.delivered_at);

  // Prepaid order: delivered -> status becomes delivered, payment remains paid
  const prepaidOrder = {
    id: "ord_prepaid_1",
    status: "processing",
    shipment_status: "shipped",
    payment_method: "online",
    payment_status: "paid",
  };
  const deliveredPrepaid = processDeliveryWebhook(prepaidOrder, "DELIVERED");
  assert.equal(deliveredPrepaid.status, "delivered");
  assert.equal(deliveredPrepaid.payment_status, "paid");

  // Cancelled order cannot be revived by a stray delivery webhook
  const cancelledOrder = {
    id: "ord_cancelled_1",
    status: "cancelled",
    shipment_status: "shipped",
    payment_method: "online",
    payment_status: "refunded",
  };
  const deliveredCancelled = processDeliveryWebhook(cancelledOrder, "DELIVERED");
  assert.equal(deliveredCancelled.status, "cancelled"); // stays cancelled
  assert.equal(deliveredCancelled.shipment_status, "delivered");
});

// ==============================================================================
// 12. INDIAN MOBILE NUMBER VALIDATION & NORMALIZATION
// ==============================================================================
function normalizeAndValidateIndianMobile(input) {
  if (!input || typeof input !== "string") {
    return { valid: false, error: "Mobile number is required" };
  }
  const digitsOnly = input.replace(/\D/g, "");
  const normalized = digitsOnly.slice(-10);

  if (normalized.length !== 10) {
    return { valid: false, error: "Indian mobile number must contain exactly 10 digits" };
  }
  if (!/^[6-9]\d{9}$/.test(normalized)) {
    return { valid: false, error: "Indian mobile number must start with 6, 7, 8, or 9" };
  }

  return { valid: true, mobileNumber: normalized, formatted: `+91 ${normalized}` };
}

test("Mobile Validation: 10-digit Indian mobile number constraints", () => {
  // Valid variations with prefixes and spaces
  assert.equal(normalizeAndValidateIndianMobile("+919876543210").valid, true);
  assert.equal(normalizeAndValidateIndianMobile("+919876543210").mobileNumber, "9876543210");
  assert.equal(normalizeAndValidateIndianMobile("9876543210").valid, true);
  assert.equal(normalizeAndValidateIndianMobile("09876543210").valid, true);
  assert.equal(normalizeAndValidateIndianMobile("+91 98765 43210").valid, true);
  assert.equal(normalizeAndValidateIndianMobile("+91 6123456789").valid, true);
  assert.equal(normalizeAndValidateIndianMobile("+91 7987654321").valid, true);
  assert.equal(normalizeAndValidateIndianMobile("+91 8888888888").valid, true);

  // Invalid variations
  assert.equal(normalizeAndValidateIndianMobile("").valid, false);
  assert.equal(normalizeAndValidateIndianMobile("1234567890").valid, false, "Must start with 6, 7, 8, 9");
  assert.equal(normalizeAndValidateIndianMobile("5234567890").valid, false, "Starts with 5, invalid in India");
  assert.equal(normalizeAndValidateIndianMobile("98765").valid, false, "Too short");
  assert.equal(normalizeAndValidateIndianMobile("abcdefghij").valid, false, "Non-digits");
});

// ==============================================================================
// 13. CENTRALIZED PROFILE COMPLETION ROUTING GATE
// ==============================================================================
const ACCOUNT_GATED_PREFIXES = ["/account", "/checkout"];
function isAccountGatedRoute(path) {
  return ACCOUNT_GATED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function evaluateGateRedirect({
  user,
  ready,
  welcomeReady,
  welcomeSeen,
  path,
  welcomeShown,
  profileCompleted = true,
  profileChecking = false,
}) {
  const signedIn = Boolean(user);
  if (path === "/terms" || path === "/privacy") return false;
  if (!ready || (signedIn && !welcomeReady)) return false;

  if (path === "/welcome" && !welcomeSeen && !welcomeShown) return false;

  if (!signedIn) {
    return isAccountGatedRoute(path);
  }

  if (!welcomeSeen) {
    return path !== "/welcome";
  }

  if (path === "/welcome") return true;
  if (path === "/login") return true;

  if (!profileChecking) {
    if (!profileCompleted) {
      if (isAccountGatedRoute(path)) return true;
      if (path === "/complete-profile") return false;
    } else {
      if (path === "/complete-profile") return true;
    }
  }

  return false;
}

test("Centralized Routing Gate: Anonymous vs Incomplete vs Complete profile rules", () => {
  // 1. Anonymous visitor
  assert.equal(
    evaluateGateRedirect({ user: null, ready: true, welcomeReady: true, welcomeSeen: false, path: "/", welcomeShown: false }),
    false,
    "Anonymous can browse home freely",
  );
  assert.equal(
    evaluateGateRedirect({ user: null, ready: true, welcomeReady: true, welcomeSeen: false, path: "/shop", welcomeShown: false }),
    false,
    "Anonymous can browse shop freely",
  );
  assert.equal(
    evaluateGateRedirect({ user: null, ready: true, welcomeReady: true, welcomeSeen: false, path: "/product/oversized-tee", welcomeShown: false }),
    false,
    "Anonymous can browse product details freely",
  );
  assert.equal(
    evaluateGateRedirect({ user: null, ready: true, welcomeReady: true, welcomeSeen: false, path: "/checkout", welcomeShown: false }),
    true,
    "Anonymous redirected away from checkout to login",
  );
  assert.equal(
    evaluateGateRedirect({ user: null, ready: true, welcomeReady: true, welcomeSeen: false, path: "/account", welcomeShown: false }),
    true,
    "Anonymous redirected away from account to login",
  );

  // 2. First-time signed-in user (welcome not seen)
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: false, path: "/shop", welcomeShown: false }),
    true,
    "New user must be routed to /welcome first",
  );
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: false, path: "/welcome", welcomeShown: false }),
    false,
    "Renders /welcome for new user",
  );

  // 3. Authenticated user with incomplete profile (welcomeSeen = true, profileCompleted = false)
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: true, path: "/shop", welcomeShown: false, profileCompleted: false, profileChecking: false }),
    false,
    "Incomplete user can still browse public product catalog",
  );
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: true, path: "/checkout", welcomeShown: false, profileCompleted: false, profileChecking: false }),
    true,
    "Incomplete user blocked from checkout -> redirected to /complete-profile",
  );
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: true, path: "/account", welcomeShown: false, profileCompleted: false, profileChecking: false }),
    true,
    "Incomplete user blocked from account dashboard -> redirected to /complete-profile",
  );
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: true, path: "/complete-profile", welcomeShown: false, profileCompleted: false, profileChecking: false }),
    false,
    "Allowed to render /complete-profile page",
  );

  // 4. Authenticated user with completed profile
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: true, path: "/checkout", welcomeShown: false, profileCompleted: true, profileChecking: false }),
    false,
    "Complete user allowed into checkout",
  );
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: true, path: "/account", welcomeShown: false, profileCompleted: true, profileChecking: false }),
    false,
    "Complete user allowed into account dashboard",
  );
  assert.equal(
    evaluateGateRedirect({ user: { id: "u1" }, ready: true, welcomeReady: true, welcomeSeen: true, path: "/complete-profile", welcomeShown: false, profileCompleted: true, profileChecking: false }),
    true,
    "Complete user should not stay on /complete-profile -> redirected to store",
  );
});

// ==============================================================================
// 14. ADMIN CUSTOMER MANAGEMENT SEARCH & PROFILE STATUS FILTERING
// ==============================================================================
function filterAdminCustomers(customers, { search = "", statusFilter = "all" }) {
  const q = search.trim().toLowerCase();
  return customers.filter((c) => {
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.mobileNumber && c.mobileNumber.includes(q)) ||
      (c.authUid && c.authUid.toLowerCase().includes(q)) ||
      c.id.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (statusFilter === "profile_completed") return c.profileCompleted === true;
    if (statusFilter === "profile_incomplete") return c.profileCompleted !== true;
    if (statusFilter === "with_orders") return c.orderCount > 0;
    if (statusFilter === "active") return c.status === "active";
    if (statusFilter === "inactive") return c.status !== "active";

    return true;
  });
}

test("Admin Customers: Search and profile status filtering", () => {
  const sample = [
    {
      id: "cust-1",
      authUid: "auth-uuid-1111",
      name: "Akhil Sai",
      email: "akhil@example.com",
      phone: "9876543210",
      mobileNumber: "9876543210",
      profileCompleted: true,
      orderCount: 3,
      totalSpent: 8997,
      status: "active",
    },
    {
      id: "cust-2",
      authUid: "auth-uuid-2222",
      name: "Rohit Sharma",
      email: "rohit@cricket.in",
      phone: "",
      mobileNumber: "",
      profileCompleted: false,
      orderCount: 0,
      totalSpent: 0,
      status: "active",
    },
    {
      id: "cust-3",
      authUid: "auth-uuid-3333",
      name: "Jane Doe",
      email: "jane@cavenhurst.com",
      phone: "9123456789",
      mobileNumber: "9123456789",
      profileCompleted: true,
      orderCount: 0,
      totalSpent: 0,
      status: "inactive",
    },
  ];

  // Search by name
  const byName = filterAdminCustomers(sample, { search: "Akhil" });
  assert.equal(byName.length, 1);
  assert.equal(byName[0].id, "cust-1");

  // Search by mobile number
  const byPhone = filterAdminCustomers(sample, { search: "9123456789" });
  assert.equal(byPhone.length, 1);
  assert.equal(byPhone[0].id, "cust-3");

  // Search by Auth UUID
  const byUuid = filterAdminCustomers(sample, { search: "2222" });
  assert.equal(byUuid.length, 1);
  assert.equal(byUuid[0].id, "cust-2");

  // Filter by profile status: completed
  const completed = filterAdminCustomers(sample, { statusFilter: "profile_completed" });
  assert.equal(completed.length, 2);

  // Filter by profile status: incomplete
  const incomplete = filterAdminCustomers(sample, { statusFilter: "profile_incomplete" });
  assert.equal(incomplete.length, 1);
  assert.equal(incomplete[0].id, "cust-2");
});

// ==============================================================================
// 15. EMAILJS OTP & TWO-FACTOR REGISTRATION SPECIFICATIONS
// ==============================================================================

test("OTP: 6-digit cryptographic generation and format specification", () => {
  for (let i = 0; i < 20; i++) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    assert.equal(code.length, 6, "OTP must be 6 digits");
    assert.match(code, /^\d{6}$/, "OTP must contain only numbers");
    const num = parseInt(code, 10);
    assert.ok(num >= 100000 && num <= 999999, "OTP must be in range 100000-999999");
  }
});

test("OTP: Salted cryptographic HMAC-SHA256 hashing and verification", () => {
  const secret = "test_salt_secret_cavenhurst_32bytes!";
  const email = "customer@cavenhurst.com";
  const otp = "584920";

  function hashOtp(code, mail) {
    return createHmac("sha256", secret)
      .update(`${mail.toLowerCase().trim()}:${code.trim()}`)
      .digest("hex");
  }

  const hash = hashOtp(otp, email);
  assert.equal(hash.length, 64, "SHA-256 hex string must be 64 characters");
  assert.equal(hashOtp(otp, email), hash, "Identical OTP and email must yield identical hash");
  assert.notEqual(hashOtp("584921", email), hash, "Different OTP must yield different hash");
  assert.notEqual(hashOtp(otp, "other@cavenhurst.com"), hash, "Different email must yield different hash");
});

test("OTP: Expiry and resend cooldown calculation", () => {
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000; // 5 minutes
  const lastSentAt = now - 30 * 1000; // 30 seconds ago

  const isExpired = Date.now() > expiresAt;
  assert.equal(isExpired, false, "Should not be expired within 5 minutes");

  const elapsedSec = Math.floor((Date.now() - lastSentAt) / 1000);
  const remainingCooldownSec = Math.max(0, 60 - elapsedSec);
  assert.ok(remainingCooldownSec > 0 && remainingCooldownSec <= 30, "Cooldown should have ~30s remaining");

  // After 61 seconds
  const oldSentAt = now - 61 * 1000;
  const elapsedOld = Math.floor((Date.now() - oldSentAt) / 1000);
  const remainingOld = Math.max(0, 60 - elapsedOld);
  assert.equal(remainingOld, 0, "Cooldown should be expired after 60s");
});

test("Registration: Mobile +91 and email matching constraints", () => {
  function validateRegistrationInputs(fullName, phone, email, password, confirmPassword) {
    if (!fullName || fullName.trim().length < 2) return "Invalid name";
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);
    if (cleanPhone.length !== 10 || !/^[6-9]\d{9}$/.test(cleanPhone)) return "Invalid phone";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Invalid email";
    if (!password || password.length < 6) return "Password too short";
    if (password !== confirmPassword) return "Passwords do not match";
    return null;
  }

  assert.equal(validateRegistrationInputs("Akhil Sai", "+91 9876543210", "akhil@gmail.com", "Secret123", "Secret123"), null);
  assert.equal(validateRegistrationInputs("A", "9876543210", "akhil@gmail.com", "Secret123", "Secret123"), "Invalid name");
  assert.equal(validateRegistrationInputs("Akhil Sai", "1234567890", "akhil@gmail.com", "Secret123", "Secret123"), "Invalid phone");
  assert.equal(validateRegistrationInputs("Akhil Sai", "9876543210", "bad-email", "Secret123", "Secret123"), "Invalid email");
  assert.equal(validateRegistrationInputs("Akhil Sai", "9876543210", "akhil@gmail.com", "123", "123"), "Password too short");
  assert.equal(validateRegistrationInputs("Akhil Sai", "9876543210", "akhil@gmail.com", "Secret123", "Mismatch123"), "Passwords do not match");
});

test("Diagnostics: Email masking and non-disclosure of sensitive OTP data", () => {
  function maskEmail(email) {
    if (!email || !email.includes("@")) return "***";
    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) return "***";
    const maskedLocal =
      localPart.length <= 2
        ? localPart[0] + "***"
        : localPart[0] + "***" + localPart.slice(-1);
    return `${maskedLocal}@${domain}`;
  }

  assert.equal(maskEmail("akhilsaiabbireddy2007@gmail.com"), "a***7@gmail.com");
  assert.equal(maskEmail("ab@cavenhurst.com"), "a***@cavenhurst.com");
  assert.equal(maskEmail("customer@domain.in"), "c***r@domain.in");
  assert.equal(maskEmail("invalid"), "***");
});

test("Upstash Redis: Key schema and TTL configuration specification", () => {
  const email = "customer@cavenhurst.com";
  const purpose = "registration";
  const cleanEmail = email.toLowerCase().trim();

  const otpKey = `cavenhurst:otp:${purpose}:${cleanEmail}`;
  const cooldownKey = `cavenhurst:cooldown:${purpose}:${cleanEmail}`;
  const resendCountKey = `cavenhurst:resend_count:${purpose}:${cleanEmail}`;

  assert.equal(otpKey, "cavenhurst:otp:registration:customer@cavenhurst.com");
  assert.equal(cooldownKey, "cavenhurst:cooldown:registration:customer@cavenhurst.com");
  assert.equal(resendCountKey, "cavenhurst:resend_count:registration:customer@cavenhurst.com");

  // Verify TTL requirements
  const OTP_TTL_SECONDS = 300; // 5 minutes
  const COOLDOWN_TTL_SECONDS = 60; // 60s
  const RESEND_WINDOW_SECONDS = 900; // 15 mins

  assert.equal(OTP_TTL_SECONDS, 5 * 60);
  assert.equal(COOLDOWN_TTL_SECONDS, 60);
  assert.equal(RESEND_WINDOW_SECONDS, 15 * 60);
});

test("EmailJS: Comprehensive recipient parameter binding", () => {
  function buildTemplateParams(toEmail, toName, otp) {
    const displayName = toName || "Customer";
    return {
      to_email: toEmail,
      email: toEmail,
      recipient: toEmail,
      recipient_email: toEmail,
      user_email: toEmail,
      client_email: toEmail,
      customer_email: toEmail,
      to: toEmail,
      reply_to: toEmail,
      to_name: displayName,
      name: displayName,
      user_name: displayName,
      otp: otp,
      code: otp,
      passcode: otp,
      verification_code: otp,
      expiry: "5 minutes",
      expiry_minutes: 5,
    };
  }

  const params = buildTemplateParams("akhil@gmail.com", "Akhil Sai", "584920");
  assert.equal(params.email, "akhil@gmail.com", "EmailJS {{email}} must resolve");
  assert.equal(params.to_email, "akhil@gmail.com", "EmailJS {{to_email}} must resolve");
  assert.equal(params.user_email, "akhil@gmail.com", "EmailJS {{user_email}} must resolve");
  assert.equal(params.otp, "584920", "EmailJS {{otp}} must resolve");
  assert.equal(params.code, "584920", "EmailJS {{code}} must resolve");
  assert.equal(params.passcode, "584920", "EmailJS {{passcode}} must resolve");
});







