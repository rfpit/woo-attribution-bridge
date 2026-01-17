/**
 * Referrer parsing utilities for attribution display
 */

export interface ParsedReferrer {
  domain: string;
  displayName: string;
  type: "search" | "social" | "referral" | "direct";
  isOrganic: boolean;
}

/**
 * Known referrer domains and their display names
 */
const knownReferrers: Record<
  string,
  { name: string; type: "search" | "social" | "referral" }
> = {
  // Google
  "google.com": { name: "Google", type: "search" },
  "google.co.uk": { name: "Google", type: "search" },
  "google.de": { name: "Google", type: "search" },
  "google.fr": { name: "Google", type: "search" },
  "google.es": { name: "Google", type: "search" },
  "google.it": { name: "Google", type: "search" },
  "google.nl": { name: "Google", type: "search" },
  "google.be": { name: "Google", type: "search" },
  "google.ca": { name: "Google", type: "search" },
  "google.com.au": { name: "Google", type: "search" },

  // Bing
  "bing.com": { name: "Bing", type: "search" },

  // Yahoo
  "yahoo.com": { name: "Yahoo", type: "search" },
  "search.yahoo.com": { name: "Yahoo", type: "search" },

  // DuckDuckGo
  "duckduckgo.com": { name: "DuckDuckGo", type: "search" },

  // Facebook/Meta
  "facebook.com": { name: "Facebook", type: "social" },
  "m.facebook.com": { name: "Facebook", type: "social" },
  "l.facebook.com": { name: "Facebook", type: "social" },
  "lm.facebook.com": { name: "Facebook", type: "social" },

  // Instagram
  "instagram.com": { name: "Instagram", type: "social" },
  "l.instagram.com": { name: "Instagram", type: "social" },

  // Twitter/X
  "twitter.com": { name: "Twitter", type: "social" },
  "x.com": { name: "X", type: "social" },
  "t.co": { name: "Twitter", type: "social" },

  // LinkedIn
  "linkedin.com": { name: "LinkedIn", type: "social" },
  "lnkd.in": { name: "LinkedIn", type: "social" },

  // Pinterest
  "pinterest.com": { name: "Pinterest", type: "social" },
  "pinterest.co.uk": { name: "Pinterest", type: "social" },

  // TikTok
  "tiktok.com": { name: "TikTok", type: "social" },

  // YouTube
  "youtube.com": { name: "YouTube", type: "social" },
  "youtu.be": { name: "YouTube", type: "social" },

  // Reddit
  "reddit.com": { name: "Reddit", type: "social" },
  "old.reddit.com": { name: "Reddit", type: "social" },
};

/**
 * Extract the base domain from a hostname (removes www. and subdomains for known domains)
 */
function getBaseDomain(hostname: string): string {
  // Remove www. prefix
  let domain = hostname.replace(/^www\./, "");

  // Check if we have a direct match with the cleaned hostname
  if (knownReferrers[domain]) {
    return domain;
  }

  // For subdomains like l.facebook.com, check if we have a match
  const parts = domain.split(".");
  if (parts.length > 2) {
    // Try the last 2 parts (e.g., facebook.com from l.facebook.com)
    const baseDomain = parts.slice(-2).join(".");
    if (knownReferrers[baseDomain]) {
      return baseDomain;
    }
    // Try the last 3 parts for domains like google.co.uk
    const threePartDomain = parts.slice(-3).join(".");
    if (knownReferrers[threePartDomain]) {
      return threePartDomain;
    }
  }

  return domain;
}

/**
 * Parse a referrer URL to extract meaningful display information
 */
export function parseReferrer(url: string | undefined | null): ParsedReferrer {
  if (!url || url.trim() === "") {
    return {
      domain: "",
      displayName: "Direct",
      type: "direct",
      isOrganic: false,
    };
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const baseDomain = getBaseDomain(hostname);

    // Check if we have a known referrer
    const known = knownReferrers[baseDomain] || knownReferrers[hostname];

    if (known) {
      return {
        domain: baseDomain,
        displayName: known.name,
        type: known.type,
        isOrganic: known.type === "search" || known.type === "social",
      };
    }

    // Unknown referrer - just show the domain
    return {
      domain: baseDomain,
      displayName: baseDomain,
      type: "referral",
      isOrganic: false,
    };
  } catch {
    // Invalid URL - return as-is
    return {
      domain: url,
      displayName: url,
      type: "referral",
      isOrganic: false,
    };
  }
}

/**
 * Get a display label for a referrer, considering click ID presence
 */
export function getReferrerLabel(
  referrer: string | undefined | null,
  hasClickId: boolean,
): string {
  const parsed = parseReferrer(referrer);

  if (parsed.type === "direct") {
    return "Direct";
  }

  if (parsed.type === "search") {
    return hasClickId
      ? `${parsed.displayName} (Paid)`
      : `${parsed.displayName} (Organic)`;
  }

  if (parsed.type === "social") {
    return hasClickId
      ? `${parsed.displayName} (Paid)`
      : `${parsed.displayName}`;
  }

  return parsed.displayName;
}

/**
 * Get appropriate badge styling based on referrer type
 */
export function getReferrerStyle(type: ParsedReferrer["type"]): {
  bgColor: string;
  textColor: string;
  borderColor: string;
} {
  switch (type) {
    case "search":
      return {
        bgColor: "bg-green-50 dark:bg-green-950",
        textColor: "text-green-700 dark:text-green-300",
        borderColor: "border-green-200 dark:border-green-800",
      };
    case "social":
      return {
        bgColor: "bg-purple-50 dark:bg-purple-950",
        textColor: "text-purple-700 dark:text-purple-300",
        borderColor: "border-purple-200 dark:border-purple-800",
      };
    case "referral":
      return {
        bgColor: "bg-amber-50 dark:bg-amber-950",
        textColor: "text-amber-700 dark:text-amber-300",
        borderColor: "border-amber-200 dark:border-amber-800",
      };
    case "direct":
    default:
      return {
        bgColor: "bg-gray-50 dark:bg-gray-900",
        textColor: "text-gray-700 dark:text-gray-300",
        borderColor: "border-gray-200 dark:border-gray-700",
      };
  }
}
