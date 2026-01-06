/**
 * Marketplace Connectors
 *
 * Exports all marketplace integration functionality.
 */

export * from "./types";
export { AmazonConnector, createAmazonConnector } from "./amazon";
export { EbayConnector, createEbayConnector } from "./ebay";
export { EtsyConnector, createEtsyConnector } from "./etsy";

import { MarketplaceConnector } from "./types";
import { createAmazonConnector, AmazonConnector } from "./amazon";
import { createEbayConnector, EbayConnector } from "./ebay";
import { createEtsyConnector, EtsyConnector } from "./etsy";

/**
 * Create a marketplace connector by platform name
 */
export function createMarketplaceConnector(
  platform: "amazon" | "ebay" | "etsy",
  marketplace?: string,
): MarketplaceConnector {
  switch (platform) {
    case "amazon":
      return createAmazonConnector(marketplace);
    case "ebay":
      return createEbayConnector(marketplace);
    case "etsy":
      return createEtsyConnector();
    default:
      throw new Error(`Unknown marketplace platform: ${platform}`);
  }
}

/**
 * Get all supported marketplaces
 */
export function getSupportedMarketplaces(): {
  platform: string;
  name: string;
  regions: string[];
}[] {
  return [
    {
      platform: "amazon",
      name: "Amazon",
      regions: [
        "US",
        "CA",
        "MX",
        "UK",
        "DE",
        "FR",
        "IT",
        "ES",
        "NL",
        "JP",
        "AU",
      ],
    },
    {
      platform: "ebay",
      name: "eBay",
      regions: ["US", "UK", "DE", "FR", "IT", "ES", "AU", "CA"],
    },
    {
      platform: "etsy",
      name: "Etsy",
      regions: ["GLOBAL"],
    },
  ];
}
