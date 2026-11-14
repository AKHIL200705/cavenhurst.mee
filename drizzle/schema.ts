import { pgTable, uuid, text, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";

export const customerCarts = pgTable("customer_carts", {
  userId: uuid("user_id").primaryKey(),
  items: jsonb("items").notNull().default([]),
  wishlist: jsonb("wishlist").notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id"),
  orderNumber: text("order_number").unique(),
  customerName: text("customer_name"),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  items: jsonb("items").notNull(),
  total: integer("total").notNull(),
  subtotal: integer("subtotal").default(0),
  discount: integer("discount").default(0),
  shippingFee: integer("shipping_fee").default(0),
  taxes: integer("taxes").default(0),
  status: text("status").notNull().default("pending_payment"),
  paymentMethod: text("payment_method").default("online"),
  paymentStatus: text("payment_status").default("pending"),
  shipmentStatus: text("shipment_status").default("unfulfilled"),
  shipping: jsonb("shipping").notNull().default({}),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  shipmaxxShipmentId: text("shipmaxx_shipment_id"),
  awbNumber: text("awb_number"),
  courierPartner: text("courier_partner"),
  trackingUrl: text("tracking_url"),
  trackingData: jsonb("tracking_data").default({}),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  returnRequestedAt: timestamp("return_requested_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productSlug: text("product_slug").notNull(),
  name: text("name").notNull(),
  size: text("size").notNull(),
  color: text("color").notNull(),
  price: integer("price").notNull(),
  qty: integer("qty").notNull(),
  image: text("image"),
});

export const shippingAddresses = pgTable("shipping_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  state: text("state").notNull(),
  pincode: text("pincode").notNull(),
  country: text("country").notNull().default("India"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  gateway: text("gateway").notNull().default("razorpay"),
  paymentMethod: text("payment_method").notNull().default("online"),
  razorpayOrderId: text("razorpay_order_id"),
  razorpayPaymentId: text("razorpay_payment_id"),
  razorpaySignature: text("razorpay_signature"),
  amount: integer("amount").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  status: text("status").notNull().default("pending"),
  errorCode: text("error_code"),
  errorDescription: text("error_description"),
  payload: jsonb("payload").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  userId: uuid("user_id"),
  provider: text("provider").notNull().default("shipmaxx360"),
  shipmaxxShipmentId: text("shipmaxx_shipment_id"),
  orderNumber: text("order_number").notNull(),
  awbNumber: text("awb_number"),
  courierPartner: text("courier_partner"),
  paymentMode: text("payment_mode").notNull().default("prepaid"),
  codAmount: integer("cod_amount").default(0),
  pickupPincode: text("pickup_pincode").notNull().default("521212"),
  deliveryPincode: text("delivery_pincode").notNull(),
  packageWeightGrams: integer("package_weight_grams").default(500),
  packageType: text("package_type").default("One packed T-shirt"),
  status: text("status").notNull().default("created"),
  shippingLabelUrl: text("shipping_label_url"),
  rawResponse: jsonb("raw_response").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shippingTracking = pgTable("shipping_tracking", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id").references(() => shipments.id, { onDelete: "cascade" }),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
  awbNumber: text("awb_number").notNull(),
  currentStatus: text("current_status").notNull(),
  statusLocation: text("status_location"),
  statusTime: timestamp("status_time", { withTimezone: true }).defaultNow(),
  activity: text("activity"),
  rawData: jsonb("raw_data").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  gateway: text("gateway").notNull().default("razorpay"),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").default(false),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shippingWebhookEvents = pgTable("shipping_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: text("event_id").notNull().unique(),
  provider: text("provider").notNull().default("shipmaxx360"),
  eventType: text("event_type").notNull(),
  awbNumber: text("awb_number"),
  payload: jsonb("payload").notNull(),
  processed: boolean("processed").default(false),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shippingSettings = pgTable("shipping_settings", {
  id: text("id").primaryKey().default("default"),
  pickupPincode: text("pickup_pincode").notNull().default("521212"),
  pickupAddressName: text("pickup_address_name").default("CAVENHURST Dispatch Hub"),
  pickupAddressLine1: text("pickup_address_line1"),
  pickupAddressCity: text("pickup_address_city"),
  pickupAddressState: text("pickup_address_state"),
  pickupPhone: text("pickup_phone"),
  defaultPackageWeightGrams: integer("default_package_weight_grams").notNull().default(500),
  packageType: text("package_type").notNull().default("One packed T-shirt"),
  codEnabled: boolean("cod_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerWelcome = pgTable("customer_welcome", {
  userId: uuid("user_id").primaryKey(),
  welcomeSeenAt: timestamp("welcome_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

export const customerProfiles = pgTable("customer_profiles", {
  id: uuid("id").primaryKey(),
  fullName: text("full_name"),
  phone: text("phone"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const newsletterSubscribers = pgTable("newsletter_subscribers", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contactMessages = pgTable("contact_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  categorySlug: text("category_slug").references(() => productCategories.slug),
  price: integer("price").notNull(),
  mrp: integer("mrp").notNull(),
  fabric: text("fabric"),
  fit: text("fit"),
  description: text("description"),
  colors: jsonb("colors").default([]),
  stock: jsonb("stock").default({}),
  images: text("images").array().default([]),
  isNew: boolean("is_new").default(true),
  isPublished: boolean("is_published").default(true),
  isFeatured: boolean("is_featured").default(false),
  views: integer("views").default(0),
  sold: integer("sold").default(0),
  rank: integer("rank").default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  role: text("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull(),
  discountValue: integer("discount_value").notNull(),
  minOrderValue: integer("min_order_value").notNull().default(0),
  maxDiscount: integer("max_discount"),
  usageLimit: integer("usage_limit"),
  timesUsed: integer("times_used").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const refunds = pgTable("refunds", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  paymentId: uuid("payment_id").references(() => payments.id),
  razorpayPaymentId: text("razorpay_payment_id").notNull(),
  razorpayRefundId: text("razorpay_refund_id"),
  amount: integer("amount").notNull(),
  amountPaise: integer("amount_paise").notNull(),
  currency: text("currency").notNull().default("INR"),
  reason: text("reason"),
  status: text("status").notNull().default("pending"),
  adminUserId: uuid("admin_user_id"),
  rawResponse: jsonb("raw_response").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  productSlug: text("product_slug").notNull(),
  size: text("size").notNull(),
  color: text("color"),
  changeQty: integer("change_qty").notNull(),
  newStock: integer("new_stock").notNull(),
  reason: text("reason").notNull(),
  referenceId: text("reference_id"),
  adminUserId: uuid("admin_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  adminUserId: uuid("admin_user_id"),
  adminEmail: text("admin_email"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  details: jsonb("details").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
