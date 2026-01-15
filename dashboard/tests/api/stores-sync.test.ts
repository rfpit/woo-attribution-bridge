import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock auth before importing route
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock db before importing route
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { POST } from "@/app/api/stores/[id]/sync/route";
import { auth } from "@/lib/auth";
import { db } from "@/db";

describe("Stores Sync API - WAB-D-001", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = () => {
    return new NextRequest(`http://localhost/api/stores/store-id/sync`, {
      method: "POST",
    });
  };

  const createParams = (id: string = "store-id") => ({
    params: Promise.resolve({ id }),
  });

  describe("Authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const response = await POST(createRequest(), createParams());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Store validation", () => {
    it("returns 404 when store not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as ReturnType<typeof db.select>);

      const response = await POST(createRequest(), createParams());
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Store not found");
    });
  });

  describe("Connection testing", () => {
    it("returns success when store is reachable", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "store-id",
              url: "https://example.com",
              apiKey: "wab_test",
              status: "pending",
            },
          ]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ currency: "GBP", timezone: "Europe/London" }),
      });

      const response = await POST(createRequest(), createParams());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe("active");
      expect(data.message).toContain("verified successfully");
    });

    it("sends X-WAB-API-Key header in health check request", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "store-id",
              url: "https://example.com",
              apiKey: "wab_secret_key",
              status: "pending",
            },
          ]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await POST(createRequest(), createParams());

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/wp-json/wab/v1/health",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-WAB-API-Key": "wab_secret_key",
          }),
        }),
      );
    });

    it("returns disconnected status on 401 response", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "store-id",
              url: "https://example.com",
              apiKey: "wab_wrong_key",
              status: "pending",
            },
          ]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const response = await POST(createRequest(), createParams());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.status).toBe("disconnected");
      expect(data.message).toContain("API key mismatch");
    });

    it("returns disconnected status on 403 response", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "store-id",
              url: "https://example.com",
              apiKey: "wab_key",
              status: "active",
            },
          ]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const response = await POST(createRequest(), createParams());
      const data = await response.json();

      expect(data.status).toBe("disconnected");
    });

    it("returns pending message when store is unreachable and status is pending", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "store-id",
              url: "https://example.com",
              apiKey: "wab_key",
              status: "pending",
            },
          ]),
        }),
      } as ReturnType<typeof db.select>);

      mockFetch.mockRejectedValue(new Error("Connection refused"));

      const response = await POST(createRequest(), createParams());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.status).toBe("pending");
      expect(data.message).toContain("Could not reach the store");
    });

    it("does not change active status on temporary network failure", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "store-id",
              url: "https://example.com",
              apiKey: "wab_key",
              status: "active",
            },
          ]),
        }),
      } as ReturnType<typeof db.select>);

      mockFetch.mockRejectedValue(new Error("Timeout"));

      const response = await POST(createRequest(), createParams());
      const data = await response.json();

      // Status should remain active (not changed to pending)
      expect(data.status).toBe("active");
    });

    it("updates store currency and timezone from health response", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "store-id",
              url: "https://example.com",
              apiKey: "wab_key",
              status: "pending",
              currency: null,
              timezone: null,
            },
          ]),
        }),
      } as ReturnType<typeof db.select>);

      const mockUpdate = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      vi.mocked(db.update).mockReturnValue({
        set: mockUpdate,
      } as unknown as ReturnType<typeof db.update>);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          currency: "USD",
          timezone: "America/New_York",
        }),
      });

      await POST(createRequest(), createParams());

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "active",
          currency: "USD",
          timezone: "America/New_York",
        }),
      );
    });
  });

  describe("URL handling", () => {
    it("constructs correct health endpoint URL", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: "store-id",
              url: "https://mystore.com/shop/",
              apiKey: "wab_key",
              status: "pending",
            },
          ]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await POST(createRequest(), createParams());

      // Should use origin only, not full path
      expect(mockFetch).toHaveBeenCalledWith(
        "https://mystore.com/wp-json/wab/v1/health",
        expect.anything(),
      );
    });
  });
});
