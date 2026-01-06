import {
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  decimal,
  boolean,
  integer,
  jsonb,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Users table (NextAuth)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  password: text("password"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

// Accounts table (NextAuth)
export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
  }),
);

// Sessions table (NextAuth)
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// Verification tokens table (NextAuth)
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.identifier, table.token] }),
  }),
);

// Stores table
export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    url: varchar("url", { length: 500 }).notNull(),
    domain: varchar("domain", { length: 255 }), // For Shopify: example.myshopify.com
    platform: varchar("platform", { length: 50 })
      .notNull()
      .default("woocommerce"),
    apiKey: text("api_key"), // For WooCommerce
    accessToken: text("access_token"), // For Shopify OAuth
    currency: varchar("currency", { length: 10 }).default("GBP"),
    timezone: varchar("timezone", { length: 100 }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("stores_user_id_idx").on(table.userId),
    domainIdx: index("stores_domain_idx").on(table.domain),
  }),
);

// Orders table
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 100 }).notNull(),
    orderNumber: varchar("order_number", { length: 100 }).notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    tax: decimal("tax", { precision: 10, scale: 2 }).notNull().default("0"),
    shipping: decimal("shipping", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    discount: decimal("discount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    currency: varchar("currency", { length: 10 }).notNull().default("GBP"),
    status: varchar("status", { length: 50 }).notNull(),
    customerEmailHash: varchar("customer_email_hash", { length: 64 }).notNull(),
    isNewCustomer: boolean("is_new_customer").notNull().default(true),
    paymentMethod: varchar("payment_method", { length: 100 }),
    attribution: jsonb("attribution"),
    surveyResponse: varchar("survey_response", { length: 255 }),
    surveySource: varchar("survey_source", { length: 100 }),
    dateCreated: timestamp("date_created", { mode: "date" }).notNull(),
    dateCompleted: timestamp("date_completed", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdIdx: index("orders_store_id_idx").on(table.storeId),
    dateCreatedIdx: index("orders_date_created_idx").on(table.dateCreated),
    customerEmailHashIdx: index("orders_customer_email_hash_idx").on(
      table.customerEmailHash,
    ),
  }),
);

// Ad platform connections table
export const adPlatformConnections = pgTable(
  "ad_platform_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(),
    accountId: varchar("account_id", { length: 100 }).notNull(),
    accountName: varchar("account_name", { length: 255 }),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { mode: "date" }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("ad_platform_connections_user_id_idx").on(table.userId),
  }),
);

// Ad spend table
export const adSpend = pgTable(
  "ad_spend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => adPlatformConnections.id, { onDelete: "cascade" }),
    campaignId: varchar("campaign_id", { length: 100 }).notNull(),
    campaignName: varchar("campaign_name", { length: 255 }),
    date: timestamp("date", { mode: "date" }).notNull(),
    spend: decimal("spend", { precision: 10, scale: 2 }).notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    currency: varchar("currency", { length: 10 }).notNull().default("GBP"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    connectionIdIdx: index("ad_spend_connection_id_idx").on(table.connectionId),
    dateIdx: index("ad_spend_date_idx").on(table.date),
  }),
);

// Store integrations (per-store ad platform settings)
export const storeIntegrations = pgTable(
  "store_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(), // meta, google, tiktok
    enabled: boolean("enabled").notNull().default(true),
    settings: jsonb("settings"), // Platform-specific settings (pixel ID, access token, etc.)
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdIdx: index("store_integrations_store_id_idx").on(table.storeId),
    platformIdx: index("store_integrations_platform_idx").on(table.platform),
  }),
);

// Attribution data (from order webhooks)
export const attributions = pgTable(
  "attributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: varchar("order_id", { length: 100 }).notNull(),
    orderNumber: varchar("order_number", { length: 100 }),
    email: varchar("email", { length: 255 }), // Hashed or raw depending on platform
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    clickIds: jsonb("click_ids"), // {fbclid, gclid, ttclid, etc.}
    utmParams: jsonb("utm_params"), // {source, medium, campaign, etc.}
    attribution: jsonb("attribution"), // Full attribution object
    landingPage: text("landing_page"),
    referrer: text("referrer"),
    userAgent: text("user_agent"),
    ipHash: varchar("ip_hash", { length: 64 }),
    isNewCustomer: boolean("is_new_customer").default(false),
    status: varchar("status", { length: 50 }).default("created"), // created, paid, fulfilled, cancelled
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdIdx: index("attributions_store_id_idx").on(table.storeId),
    orderIdIdx: index("attributions_order_id_idx").on(table.orderId),
    createdAtIdx: index("attributions_created_at_idx").on(table.createdAt),
  }),
);

// Conversion dispatch logs
export const conversionLogs = pgTable(
  "conversion_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    orderId: varchar("order_id", { length: 100 }).notNull(),
    dispatches: jsonb("dispatches"), // [{platform, status, error?}]
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    storeIdIdx: index("conversion_logs_store_id_idx").on(table.storeId),
    orderIdIdx: index("conversion_logs_order_id_idx").on(table.orderId),
  }),
);

// Marketplace connections (Amazon, eBay, Etsy)
export const marketplaceConnections = pgTable(
  "marketplace_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(), // amazon, ebay, etsy
    sellerId: varchar("seller_id", { length: 100 }).notNull(),
    sellerName: varchar("seller_name", { length: 255 }),
    marketplace: varchar("marketplace", { length: 50 }), // US, UK, DE, etc.
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { mode: "date" }),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    settings: jsonb("settings"), // Platform-specific settings
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("marketplace_connections_user_id_idx").on(table.userId),
    platformIdx: index("marketplace_connections_platform_idx").on(
      table.platform,
    ),
  }),
);

// Marketplace orders (synced from Amazon, eBay, Etsy)
export const marketplaceOrders = pgTable(
  "marketplace_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => marketplaceConnections.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 100 }).notNull(),
    orderNumber: varchar("order_number", { length: 100 }).notNull(),
    platform: varchar("platform", { length: 50 }).notNull(),
    status: varchar("status", { length: 50 }).notNull(),
    total: decimal("total", { precision: 10, scale: 2 }).notNull(),
    subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
    tax: decimal("tax", { precision: 10, scale: 2 }).notNull().default("0"),
    shipping: decimal("shipping", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    fees: decimal("fees", { precision: 10, scale: 2 }).notNull().default("0"),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    customerEmail: varchar("customer_email", { length: 255 }),
    customerName: varchar("customer_name", { length: 255 }),
    items: jsonb("items"), // Line items
    orderDate: timestamp("order_date", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    connectionIdIdx: index("marketplace_orders_connection_id_idx").on(
      table.connectionId,
    ),
    externalIdIdx: index("marketplace_orders_external_id_idx").on(
      table.externalId,
    ),
    orderDateIdx: index("marketplace_orders_order_date_idx").on(
      table.orderDate,
    ),
  }),
);

// Marketplace ad spend
export const marketplaceAdSpend = pgTable(
  "marketplace_ad_spend",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => marketplaceConnections.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(),
    campaignId: varchar("campaign_id", { length: 100 }).notNull(),
    campaignName: varchar("campaign_name", { length: 255 }),
    date: timestamp("date", { mode: "date" }).notNull(),
    spend: decimal("spend", { precision: 10, scale: 2 }).notNull(),
    impressions: integer("impressions").notNull().default(0),
    clicks: integer("clicks").notNull().default(0),
    sales: decimal("sales", { precision: 10, scale: 2 }).notNull().default("0"),
    acos: decimal("acos", { precision: 5, scale: 2 }), // Amazon Advertising Cost of Sale
    roas: decimal("roas", { precision: 5, scale: 2 }),
    currency: varchar("currency", { length: 10 }).notNull().default("USD"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    connectionIdIdx: index("marketplace_ad_spend_connection_id_idx").on(
      table.connectionId,
    ),
    dateIdx: index("marketplace_ad_spend_date_idx").on(table.date),
  }),
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  stores: many(stores),
  adPlatformConnections: many(adPlatformConnections),
  marketplaceConnections: many(marketplaceConnections),
  marketingConnections: many(marketingConnections),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  user: one(users, {
    fields: [stores.userId],
    references: [users.id],
  }),
  orders: many(orders),
  integrations: many(storeIntegrations),
  attributions: many(attributions),
  conversionLogs: many(conversionLogs),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  store: one(stores, {
    fields: [orders.storeId],
    references: [stores.id],
  }),
}));

export const adPlatformConnectionsRelations = relations(
  adPlatformConnections,
  ({ one, many }) => ({
    user: one(users, {
      fields: [adPlatformConnections.userId],
      references: [users.id],
    }),
    adSpend: many(adSpend),
  }),
);

export const adSpendRelations = relations(adSpend, ({ one }) => ({
  connection: one(adPlatformConnections, {
    fields: [adSpend.connectionId],
    references: [adPlatformConnections.id],
  }),
}));

export const storeIntegrationsRelations = relations(
  storeIntegrations,
  ({ one }) => ({
    store: one(stores, {
      fields: [storeIntegrations.storeId],
      references: [stores.id],
    }),
  }),
);

export const attributionsRelations = relations(attributions, ({ one }) => ({
  store: one(stores, {
    fields: [attributions.storeId],
    references: [stores.id],
  }),
}));

export const conversionLogsRelations = relations(conversionLogs, ({ one }) => ({
  store: one(stores, {
    fields: [conversionLogs.storeId],
    references: [stores.id],
  }),
}));

// Marketplace relations
export const marketplaceConnectionsRelations = relations(
  marketplaceConnections,
  ({ one, many }) => ({
    user: one(users, {
      fields: [marketplaceConnections.userId],
      references: [users.id],
    }),
    orders: many(marketplaceOrders),
    adSpend: many(marketplaceAdSpend),
  }),
);

export const marketplaceOrdersRelations = relations(
  marketplaceOrders,
  ({ one }) => ({
    connection: one(marketplaceConnections, {
      fields: [marketplaceOrders.connectionId],
      references: [marketplaceConnections.id],
    }),
  }),
);

export const marketplaceAdSpendRelations = relations(
  marketplaceAdSpend,
  ({ one }) => ({
    connection: one(marketplaceConnections, {
      fields: [marketplaceAdSpend.connectionId],
      references: [marketplaceConnections.id],
    }),
  }),
);

// Marketing platform connections (Klaviyo, Postscript, etc.)
export const marketingConnections = pgTable(
  "marketing_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: varchar("platform", { length: 50 }).notNull(), // klaviyo, postscript, mailchimp, etc.
    name: varchar("name", { length: 255 }), // Display name
    apiKey: text("api_key").notNull(), // Encrypted API key
    publicApiKey: text("public_api_key"), // For Klaviyo public API
    shopId: varchar("shop_id", { length: 100 }), // For Postscript
    accountId: varchar("account_id", { length: 100 }), // Platform account ID
    status: varchar("status", { length: 50 }).notNull().default("active"),
    settings: jsonb("settings"), // Platform-specific settings
    lastSyncAt: timestamp("last_sync_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    userIdIdx: index("marketing_connections_user_id_idx").on(table.userId),
    platformIdx: index("marketing_connections_platform_idx").on(table.platform),
  }),
);

// Marketing campaigns (email and SMS campaigns synced from platforms)
export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => marketingConnections.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 100 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 50 }).notNull(), // email, sms
    status: varchar("status", { length: 50 }).notNull(), // draft, scheduled, sent, cancelled
    subject: text("subject"), // For email campaigns
    messageBody: text("message_body"), // For SMS campaigns
    scheduledAt: timestamp("scheduled_at", { mode: "date" }),
    sentAt: timestamp("sent_at", { mode: "date" }),
    // Metrics
    sent: integer("sent").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    opened: integer("opened").notNull().default(0),
    clicked: integer("clicked").notNull().default(0),
    converted: integer("converted").notNull().default(0),
    unsubscribed: integer("unsubscribed").notNull().default(0),
    bounced: integer("bounced").notNull().default(0),
    revenue: decimal("revenue", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Attribution data
    attributedOrders: integer("attributed_orders").notNull().default(0),
    attributedRevenue: decimal("attributed_revenue", {
      precision: 10,
      scale: 2,
    })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    connectionIdIdx: index("marketing_campaigns_connection_id_idx").on(
      table.connectionId,
    ),
    externalIdIdx: index("marketing_campaigns_external_id_idx").on(
      table.externalId,
    ),
    sentAtIdx: index("marketing_campaigns_sent_at_idx").on(table.sentAt),
    typeIdx: index("marketing_campaigns_type_idx").on(table.type),
  }),
);

// Marketing subscribers (synced from platforms)
export const marketingSubscribers = pgTable(
  "marketing_subscribers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => marketingConnections.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 50 }),
    firstName: varchar("first_name", { length: 100 }),
    lastName: varchar("last_name", { length: 100 }),
    status: varchar("status", { length: 50 }).notNull(), // subscribed, unsubscribed, pending
    tags: jsonb("tags"), // Array of tags
    lists: jsonb("lists"), // Array of list IDs
    // Attribution data
    attributionSource: varchar("attribution_source", { length: 100 }),
    attributionMedium: varchar("attribution_medium", { length: 100 }),
    attributionCampaign: varchar("attribution_campaign", { length: 255 }),
    acquisitionChannel: varchar("acquisition_channel", { length: 100 }),
    // Customer data
    totalSpent: decimal("total_spent", { precision: 10, scale: 2 }).default(
      "0",
    ),
    orderCount: integer("order_count").default(0),
    lastOrderAt: timestamp("last_order_at", { mode: "date" }),
    isNewCustomer: boolean("is_new_customer").default(true),
    // Engagement
    lastEngagedAt: timestamp("last_engaged_at", { mode: "date" }),
    subscribedAt: timestamp("subscribed_at", { mode: "date" }),
    unsubscribedAt: timestamp("unsubscribed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    connectionIdIdx: index("marketing_subscribers_connection_id_idx").on(
      table.connectionId,
    ),
    emailIdx: index("marketing_subscribers_email_idx").on(table.email),
    phoneIdx: index("marketing_subscribers_phone_idx").on(table.phoneNumber),
    externalIdIdx: index("marketing_subscribers_external_id_idx").on(
      table.externalId,
    ),
  }),
);

// Marketing sync logs
export const marketingSyncLogs = pgTable(
  "marketing_sync_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => marketingConnections.id, { onDelete: "cascade" }),
    syncType: varchar("sync_type", { length: 50 }).notNull(), // campaigns, subscribers, metrics
    status: varchar("status", { length: 50 }).notNull(), // pending, running, completed, failed
    recordsProcessed: integer("records_processed").notNull().default(0),
    recordsFailed: integer("records_failed").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { mode: "date" }).notNull(),
    completedAt: timestamp("completed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    connectionIdIdx: index("marketing_sync_logs_connection_id_idx").on(
      table.connectionId,
    ),
    startedAtIdx: index("marketing_sync_logs_started_at_idx").on(
      table.startedAt,
    ),
  }),
);

// Marketing automation events (tracked events for Klaviyo/Postscript)
export const marketingEvents = pgTable(
  "marketing_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => marketingConnections.id, { onDelete: "cascade" }),
    subscriberId: uuid("subscriber_id").references(
      () => marketingSubscribers.id,
      { onDelete: "set null" },
    ),
    eventName: varchar("event_name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    phoneNumber: varchar("phone_number", { length: 50 }),
    orderId: varchar("order_id", { length: 100 }),
    value: decimal("value", { precision: 10, scale: 2 }),
    properties: jsonb("properties"),
    sentToProvider: boolean("sent_to_provider").default(false),
    providerEventId: varchar("provider_event_id", { length: 100 }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => ({
    connectionIdIdx: index("marketing_events_connection_id_idx").on(
      table.connectionId,
    ),
    eventNameIdx: index("marketing_events_event_name_idx").on(table.eventName),
    emailIdx: index("marketing_events_email_idx").on(table.email),
    createdAtIdx: index("marketing_events_created_at_idx").on(table.createdAt),
  }),
);

// Marketing connections relations
export const marketingConnectionsRelations = relations(
  marketingConnections,
  ({ one, many }) => ({
    user: one(users, {
      fields: [marketingConnections.userId],
      references: [users.id],
    }),
    campaigns: many(marketingCampaigns),
    subscribers: many(marketingSubscribers),
    syncLogs: many(marketingSyncLogs),
    events: many(marketingEvents),
  }),
);

export const marketingCampaignsRelations = relations(
  marketingCampaigns,
  ({ one }) => ({
    connection: one(marketingConnections, {
      fields: [marketingCampaigns.connectionId],
      references: [marketingConnections.id],
    }),
  }),
);

export const marketingSubscribersRelations = relations(
  marketingSubscribers,
  ({ one, many }) => ({
    connection: one(marketingConnections, {
      fields: [marketingSubscribers.connectionId],
      references: [marketingConnections.id],
    }),
    events: many(marketingEvents),
  }),
);

export const marketingSyncLogsRelations = relations(
  marketingSyncLogs,
  ({ one }) => ({
    connection: one(marketingConnections, {
      fields: [marketingSyncLogs.connectionId],
      references: [marketingConnections.id],
    }),
  }),
);

export const marketingEventsRelations = relations(
  marketingEvents,
  ({ one }) => ({
    connection: one(marketingConnections, {
      fields: [marketingEvents.connectionId],
      references: [marketingConnections.id],
    }),
    subscriber: one(marketingSubscribers, {
      fields: [marketingEvents.subscriberId],
      references: [marketingSubscribers.id],
    }),
  }),
);

// Type exports
export type UserSelect = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type StoreSelect = typeof stores.$inferSelect;
export type StoreInsert = typeof stores.$inferInsert;
export type OrderSelect = typeof orders.$inferSelect;
export type OrderInsert = typeof orders.$inferInsert;
export type MarketplaceConnectionSelect =
  typeof marketplaceConnections.$inferSelect;
export type MarketplaceConnectionInsert =
  typeof marketplaceConnections.$inferInsert;
export type MarketplaceOrderSelect = typeof marketplaceOrders.$inferSelect;
export type MarketplaceOrderInsert = typeof marketplaceOrders.$inferInsert;
export type MarketplaceAdSpendSelect = typeof marketplaceAdSpend.$inferSelect;
export type MarketplaceAdSpendInsert = typeof marketplaceAdSpend.$inferInsert;
export type MarketingConnectionSelect =
  typeof marketingConnections.$inferSelect;
export type MarketingConnectionInsert =
  typeof marketingConnections.$inferInsert;
export type MarketingCampaignSelect = typeof marketingCampaigns.$inferSelect;
export type MarketingCampaignInsert = typeof marketingCampaigns.$inferInsert;
export type MarketingSubscriberSelect =
  typeof marketingSubscribers.$inferSelect;
export type MarketingSubscriberInsert =
  typeof marketingSubscribers.$inferInsert;
export type MarketingSyncLogSelect = typeof marketingSyncLogs.$inferSelect;
export type MarketingSyncLogInsert = typeof marketingSyncLogs.$inferInsert;
export type MarketingEventSelect = typeof marketingEvents.$inferSelect;
export type MarketingEventInsert = typeof marketingEvents.$inferInsert;
