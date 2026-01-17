import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "GBP"): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("en-GB").format(num);
}

export function formatPercentage(num: number): string {
  return `${num.toFixed(1)}%`;
}

// Alias for formatPercentage
export const formatPercent = formatPercentage;

export function formatROAS(num: number): string {
  return `${num.toFixed(1)}x`;
}

export function calculatePercentageChange(
  current: number,
  previous: number,
): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Safely parse a timestamp that could be:
 * - Date object
 * - ISO 8601 string ("2024-01-17T14:30:45+00:00")
 * - Unix timestamp in seconds (1705502445)
 * - Unix timestamp in milliseconds (1705502445000)
 * - undefined/null
 *
 * @returns timestamp in milliseconds, or null if invalid
 */
export function parseTimestamp(
  timestamp: string | number | Date | null | undefined,
): number | null {
  if (timestamp == null || timestamp === "") {
    return null;
  }

  let ms: number;

  if (timestamp instanceof Date) {
    ms = timestamp.getTime();
  } else if (typeof timestamp === "string") {
    // Check if it's a numeric string (Unix timestamp as string)
    const numericValue = Number(timestamp);
    if (!isNaN(numericValue) && /^\d+$/.test(timestamp)) {
      // It's a numeric string - treat as Unix timestamp
      if (numericValue < 1e12) {
        // Unix seconds - convert to milliseconds
        ms = numericValue * 1000;
      } else {
        // Already milliseconds
        ms = numericValue;
      }
    } else {
      // ISO 8601 string or other date format
      ms = new Date(timestamp).getTime();
    }
  } else if (typeof timestamp === "number") {
    // Detect if it's seconds or milliseconds
    // Timestamps before year 2001 in ms would be < 1e12
    // Timestamps in seconds are typically 10 digits (< 1e10)
    if (timestamp < 1e12) {
      // Unix seconds - convert to milliseconds
      ms = timestamp * 1000;
    } else {
      // Already milliseconds
      ms = timestamp;
    }
  } else {
    return null;
  }

  // Validate the result
  if (isNaN(ms) || ms <= 0) {
    return null;
  }

  return ms;
}

/**
 * Format a time gap in human-readable form (e.g., "2.5 days", "3 hours")
 * Returns null if the input is invalid
 */
export function formatTimeGap(ms: number | null): string | null {
  if (ms == null || isNaN(ms)) {
    return null;
  }

  const days = ms / (1000 * 60 * 60 * 24);

  if (days < 1) {
    const hours = Math.round(days * 24);
    if (hours < 1) {
      const minutes = Math.round(days * 24 * 60);
      return `${minutes} min`;
    }
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  if (days < 7) {
    const rounded = Math.round(days * 10) / 10;
    return `${rounded} day${rounded !== 1 ? "s" : ""}`;
  }
  const weeks = Math.round((days / 7) * 10) / 10;
  return `${weeks} week${weeks !== 1 ? "s" : ""}`;
}
