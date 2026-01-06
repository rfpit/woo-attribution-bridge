import { describe, it, expect } from "vitest";
import {
  cn,
  formatCurrency,
  formatNumber,
  formatPercentage,
} from "@/lib/utils";

describe("Utils", () => {
  describe("cn", () => {
    it("merges class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("handles conditional classes", () => {
      expect(cn("foo", false && "bar", "baz")).toBe("foo baz");
    });

    it("handles undefined and null", () => {
      expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
    });

    it("merges tailwind classes correctly", () => {
      expect(cn("p-4", "p-2")).toBe("p-2");
      expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
    });
  });

  describe("formatCurrency", () => {
    it("formats GBP currency by default", () => {
      const result = formatCurrency(1234.56);
      expect(result).toBe("£1,235");
    });

    it("formats USD currency", () => {
      const result = formatCurrency(1234.56, "USD");
      expect(result).toContain("$");
      expect(result).toContain("1,235");
    });

    it("formats EUR currency", () => {
      const result = formatCurrency(1234.56, "EUR");
      expect(result).toContain("€");
      expect(result).toContain("1,235");
    });

    it("handles zero", () => {
      const result = formatCurrency(0);
      expect(result).toBe("£0");
    });

    it("handles negative numbers", () => {
      const result = formatCurrency(-50);
      expect(result).toBe("-£50");
    });

    it("handles large numbers", () => {
      const result = formatCurrency(1234567.89);
      expect(result).toBe("£1,234,568");
    });
  });

  describe("formatNumber", () => {
    it("formats integers", () => {
      expect(formatNumber(1234)).toBe("1,234");
    });

    it("formats decimals", () => {
      // Intl.NumberFormat with default options keeps 3 decimal places
      expect(formatNumber(1234.5678)).toBe("1,234.568");
    });

    it("handles zero", () => {
      expect(formatNumber(0)).toBe("0");
    });

    it("handles large numbers", () => {
      expect(formatNumber(1234567890)).toBe("1,234,567,890");
    });
  });

  describe("formatPercentage", () => {
    it("formats positive percentages", () => {
      expect(formatPercentage(50)).toBe("50.0%");
    });

    it("formats negative percentages", () => {
      expect(formatPercentage(-25)).toBe("-25.0%");
    });

    it("formats decimal percentages", () => {
      expect(formatPercentage(33.333)).toBe("33.3%");
    });

    it("handles zero", () => {
      expect(formatPercentage(0)).toBe("0.0%");
    });

    it("handles 100%", () => {
      expect(formatPercentage(100)).toBe("100.0%");
    });
  });
});
