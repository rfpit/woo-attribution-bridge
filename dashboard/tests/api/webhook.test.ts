import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock db before importing route
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { GET, POST } from "@/app/api/webhook/orders/route";
import { db } from "@/db";

describe("Webhook Orders API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/webhook/orders", () => {
    it("returns health check status", async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe("ok");
      expect(data.service).toBe("wab-webhook");
    });
  });

  describe("POST /api/webhook/orders", () => {
    it("returns 401 without API key", async () => {
      const request = new NextRequest("http://localhost/api/webhook/orders", {
        method: "POST",
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Invalid or missing API key");
    });

    it("returns 401 with invalid API key", async () => {
      // Mock no store found
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      const request = new NextRequest("http://localhost/api/webhook/orders", {
        method: "POST",
        headers: {
          "X-WAB-API-Key": "invalid-key",
        },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Invalid or missing API key");
    });

    it("returns 400 for invalid payload", async () => {
      // Mock valid store found
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "store-1" }]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      const request = new NextRequest("http://localhost/api/webhook/orders", {
        method: "POST",
        headers: {
          "X-WAB-API-Key": "wab_valid_key",
        },
        body: JSON.stringify({ event: "invalid.event" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid payload");
    });

    it("creates new order successfully", async () => {
      let selectCallCount = 0;

      // Mock store lookup (first call) and order check (second call)
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Store lookup
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: "store-1" }]),
              }),
            }),
          } as ReturnType<typeof db.select>;
        }
        // Order check - no existing order
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        } as ReturnType<typeof db.select>;
      });

      // Mock insert
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof db.insert>);

      // Mock update (for store lastSyncAt)
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const request = new NextRequest("http://localhost/api/webhook/orders", {
        method: "POST",
        headers: {
          "X-WAB-API-Key": "wab_valid_key",
        },
        body: JSON.stringify({
          event: "order.created",
          order: {
            external_id: "123",
            order_number: "WC-123",
            total: 99.99,
            subtotal: 89.99,
            tax: 10.0,
            currency: "GBP",
            status: "completed",
            customer_email_hash: "abc123",
            is_new_customer: true,
            date_created: "2024-01-15T10:00:00Z",
            attribution: { gclid: "test-gclid" },
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("WC-123");
      expect(data.message).toContain("created");
    });

    it("updates existing order", async () => {
      let selectCallCount = 0;

      // Mock store lookup (first call) and order check (second call)
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // Store lookup
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([{ id: "store-1" }]),
              }),
            }),
          } as ReturnType<typeof db.select>;
        }
        // Order check - existing order found
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([{ id: "existing-order" }]),
            }),
          }),
        } as ReturnType<typeof db.select>;
      });

      // Mock update
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const request = new NextRequest("http://localhost/api/webhook/orders", {
        method: "POST",
        headers: {
          "X-WAB-API-Key": "wab_valid_key",
        },
        body: JSON.stringify({
          event: "order.updated",
          order: {
            external_id: "123",
            order_number: "WC-123",
            total: 99.99,
            subtotal: 89.99,
            tax: 10.0,
            currency: "GBP",
            status: "completed",
            customer_email_hash: "abc123",
            is_new_customer: true,
            date_created: "2024-01-15T10:00:00Z",
          },
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain("updated");
    });
  });
});
