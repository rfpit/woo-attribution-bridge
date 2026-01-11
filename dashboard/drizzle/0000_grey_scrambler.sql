CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "ad_platform_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"account_id" varchar(100) NOT NULL,
	"account_name" varchar(255),
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"campaign_id" varchar(100) NOT NULL,
	"campaign_name" varchar(255),
	"date" timestamp NOT NULL,
	"spend" numeric(10, 2) NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"currency" varchar(10) DEFAULT 'GBP' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" varchar(100) NOT NULL,
	"order_number" varchar(100),
	"email" varchar(255),
	"total" numeric(10, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"click_ids" jsonb,
	"utm_params" jsonb,
	"attribution" jsonb,
	"landing_page" text,
	"referrer" text,
	"user_agent" text,
	"ip_hash" varchar(64),
	"is_new_customer" boolean DEFAULT false,
	"status" varchar(50) DEFAULT 'created',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversion_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"order_id" varchar(100) NOT NULL,
	"dispatches" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"subject" text,
	"message_body" text,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"sent" integer DEFAULT 0 NOT NULL,
	"delivered" integer DEFAULT 0 NOT NULL,
	"opened" integer DEFAULT 0 NOT NULL,
	"clicked" integer DEFAULT 0 NOT NULL,
	"converted" integer DEFAULT 0 NOT NULL,
	"unsubscribed" integer DEFAULT 0 NOT NULL,
	"bounced" integer DEFAULT 0 NOT NULL,
	"revenue" numeric(10, 2) DEFAULT '0' NOT NULL,
	"attributed_orders" integer DEFAULT 0 NOT NULL,
	"attributed_revenue" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"name" varchar(255),
	"api_key" text NOT NULL,
	"public_api_key" text,
	"shop_id" varchar(100),
	"account_id" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"settings" jsonb,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"subscriber_id" uuid,
	"event_name" varchar(100) NOT NULL,
	"email" varchar(255),
	"phone_number" varchar(50),
	"order_id" varchar(100),
	"value" numeric(10, 2),
	"properties" jsonb,
	"sent_to_provider" boolean DEFAULT false,
	"provider_event_id" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"email" varchar(255),
	"phone_number" varchar(50),
	"first_name" varchar(100),
	"last_name" varchar(100),
	"status" varchar(50) NOT NULL,
	"tags" jsonb,
	"lists" jsonb,
	"attribution_source" varchar(100),
	"attribution_medium" varchar(100),
	"attribution_campaign" varchar(255),
	"acquisition_channel" varchar(100),
	"total_spent" numeric(10, 2) DEFAULT '0',
	"order_count" integer DEFAULT 0,
	"last_order_at" timestamp,
	"is_new_customer" boolean DEFAULT true,
	"last_engaged_at" timestamp,
	"subscribed_at" timestamp,
	"unsubscribed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketing_sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"sync_type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"records_failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_ad_spend" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"campaign_id" varchar(100) NOT NULL,
	"campaign_name" varchar(255),
	"date" timestamp NOT NULL,
	"spend" numeric(10, 2) NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"sales" numeric(10, 2) DEFAULT '0' NOT NULL,
	"acos" numeric(5, 2),
	"roas" numeric(5, 2),
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"seller_id" varchar(100) NOT NULL,
	"seller_name" varchar(255),
	"marketplace" varchar(50),
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"order_number" varchar(100) NOT NULL,
	"platform" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0' NOT NULL,
	"shipping" numeric(10, 2) DEFAULT '0' NOT NULL,
	"fees" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"customer_email" varchar(255),
	"customer_name" varchar(255),
	"items" jsonb,
	"order_date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"order_number" varchar(100) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"tax" numeric(10, 2) DEFAULT '0' NOT NULL,
	"shipping" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"currency" varchar(10) DEFAULT 'GBP' NOT NULL,
	"status" varchar(50) NOT NULL,
	"customer_email_hash" varchar(64) NOT NULL,
	"is_new_customer" boolean DEFAULT true NOT NULL,
	"payment_method" varchar(100),
	"attribution" jsonb,
	"survey_response" varchar(255),
	"survey_source" varchar(100),
	"date_created" timestamp NOT NULL,
	"date_completed" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"platform" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" varchar(500) NOT NULL,
	"domain" varchar(255),
	"platform" varchar(50) DEFAULT 'woocommerce' NOT NULL,
	"api_key" text,
	"access_token" text,
	"currency" varchar(10) DEFAULT 'GBP',
	"timezone" varchar(100),
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_platform_connections" ADD CONSTRAINT "ad_platform_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_spend" ADD CONSTRAINT "ad_spend_connection_id_ad_platform_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."ad_platform_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_logs" ADD CONSTRAINT "conversion_logs_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_connection_id_marketing_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."marketing_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_connections" ADD CONSTRAINT "marketing_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_events" ADD CONSTRAINT "marketing_events_connection_id_marketing_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."marketing_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_events" ADD CONSTRAINT "marketing_events_subscriber_id_marketing_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."marketing_subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_subscribers" ADD CONSTRAINT "marketing_subscribers_connection_id_marketing_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."marketing_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_sync_logs" ADD CONSTRAINT "marketing_sync_logs_connection_id_marketing_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."marketing_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_ad_spend" ADD CONSTRAINT "marketplace_ad_spend_connection_id_marketplace_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."marketplace_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_connections" ADD CONSTRAINT "marketplace_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_connection_id_marketplace_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."marketplace_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_integrations" ADD CONSTRAINT "store_integrations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_platform_connections_user_id_idx" ON "ad_platform_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ad_spend_connection_id_idx" ON "ad_spend" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "ad_spend_date_idx" ON "ad_spend" USING btree ("date");--> statement-breakpoint
CREATE INDEX "attributions_store_id_idx" ON "attributions" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "attributions_order_id_idx" ON "attributions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "attributions_created_at_idx" ON "attributions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversion_logs_store_id_idx" ON "conversion_logs" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "conversion_logs_order_id_idx" ON "conversion_logs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_connection_id_idx" ON "marketing_campaigns" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_external_id_idx" ON "marketing_campaigns" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_sent_at_idx" ON "marketing_campaigns" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "marketing_campaigns_type_idx" ON "marketing_campaigns" USING btree ("type");--> statement-breakpoint
CREATE INDEX "marketing_connections_user_id_idx" ON "marketing_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketing_connections_platform_idx" ON "marketing_connections" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "marketing_events_connection_id_idx" ON "marketing_events" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "marketing_events_event_name_idx" ON "marketing_events" USING btree ("event_name");--> statement-breakpoint
CREATE INDEX "marketing_events_email_idx" ON "marketing_events" USING btree ("email");--> statement-breakpoint
CREATE INDEX "marketing_events_created_at_idx" ON "marketing_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "marketing_subscribers_connection_id_idx" ON "marketing_subscribers" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "marketing_subscribers_email_idx" ON "marketing_subscribers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "marketing_subscribers_phone_idx" ON "marketing_subscribers" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "marketing_subscribers_external_id_idx" ON "marketing_subscribers" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "marketing_sync_logs_connection_id_idx" ON "marketing_sync_logs" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "marketing_sync_logs_started_at_idx" ON "marketing_sync_logs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "marketplace_ad_spend_connection_id_idx" ON "marketplace_ad_spend" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "marketplace_ad_spend_date_idx" ON "marketplace_ad_spend" USING btree ("date");--> statement-breakpoint
CREATE INDEX "marketplace_connections_user_id_idx" ON "marketplace_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "marketplace_connections_platform_idx" ON "marketplace_connections" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "marketplace_orders_connection_id_idx" ON "marketplace_orders" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_external_id_idx" ON "marketplace_orders" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "marketplace_orders_order_date_idx" ON "marketplace_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "orders_store_id_idx" ON "orders" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "orders_date_created_idx" ON "orders" USING btree ("date_created");--> statement-breakpoint
CREATE INDEX "orders_customer_email_hash_idx" ON "orders" USING btree ("customer_email_hash");--> statement-breakpoint
CREATE INDEX "store_integrations_store_id_idx" ON "store_integrations" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_integrations_platform_idx" ON "store_integrations" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "stores_user_id_idx" ON "stores" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stores_domain_idx" ON "stores" USING btree ("domain");