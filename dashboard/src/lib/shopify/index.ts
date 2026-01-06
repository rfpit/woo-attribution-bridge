/**
 * Shopify Integration
 *
 * Exports all Shopify-related functionality.
 */

export {
  ShopifyClient,
  getShopifyAuthUrl,
  exchangeCodeForToken,
  extractClickIds,
  extractUtmParams,
} from "./client";

export type {
  ShopifyConfig,
  ShopifySession,
  ShopifyOrder,
  ShopifyLineItem,
  ShopifyCustomer,
} from "./client";

export {
  verifyWebhook,
  webhookHandlers,
  handleOrderCreated,
  handleOrderPaid,
  handleOrderFulfilled,
  handleOrderCancelled,
  handleAppUninstalled,
} from "./webhooks";
