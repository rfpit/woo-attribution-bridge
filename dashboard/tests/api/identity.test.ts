import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth before importing route
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

// Mock db before importing route
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { GET } from "@/app/api/dashboard/identity/[email_hash]/route";
import { auth } from "@/auth";
import { db } from "@/db";

describe("Identity API - WAB-D-005", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (emailHash: string) => {
    return new Request(`http://localhost/api/dashboard/identity/${emailHash}`);
  };

  const createParams = (emailHash: string) => ({
    params: Promise.resolve({ email_hash: emailHash }),
  });

  describe("Authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const response = await GET(
        createRequest("abc123"),
        createParams("a".repeat(64)),
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when session has no user id", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "test@example.com" },
        expires: "2099-01-01",
      } as never);

      const response = await GET(
        createRequest("a".repeat(64)),
        createParams("a".repeat(64)),
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });
  });

  describe("Email hash validation", () => {
    it("returns 400 for hash shorter than 64 characters", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const response = await GET(
        createRequest("abc123"),
        createParams("abc123"),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid email hash format");
    });

    it("returns 400 for hash longer than 64 characters", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const response = await GET(
        createRequest("a".repeat(65)),
        createParams("a".repeat(65)),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid email hash format");
    });

    it("returns 400 for hash with uppercase characters", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const hash = "A".repeat(64);
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid email hash format");
    });

    it("returns 400 for hash with non-hex characters", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const hash = "g".repeat(64); // 'g' is not a hex character
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Invalid email hash format");
    });

    it("accepts valid 64-character lowercase hex hash", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { id: "store-1", url: "https://example.com", apiKey: "wab_test" },
            ]),
        }),
      } as ReturnType<typeof db.select>);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ email_hash: "a".repeat(64), identity: {} }),
      });

      const hash = "abcdef0123456789".repeat(4); // Valid 64-char hex
      const response = await GET(createRequest(hash), createParams(hash));

      expect(response.status).toBe(200);
    });
  });

  describe("Store validation", () => {
    it("returns 404 when user has no stores", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as ReturnType<typeof db.select>);

      const hash = "a".repeat(64);
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("No stores connected");
    });
  });

  describe("Plugin API proxy", () => {
    it("sends X-WAB-API-Key header when store has apiKey", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              {
                id: "store-1",
                url: "https://example.com",
                apiKey: "wab_secret",
              },
            ]),
        }),
      } as ReturnType<typeof db.select>);

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ email_hash: "a".repeat(64), identity: {} }),
      });

      const hash = "a".repeat(64);
      await GET(createRequest(hash), createParams(hash));

      expect(mockFetch).toHaveBeenCalledWith(
        `https://example.com/wp-json/wab/v1/identity/${"a".repeat(64)}`,
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-WAB-API-Key": "wab_secret",
          }),
        }),
      );
    });

    it("returns 404 when plugin returns 404", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { id: "store-1", url: "https://example.com", apiKey: "wab_test" },
            ]),
        }),
      } as ReturnType<typeof db.select>);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      const hash = "a".repeat(64);
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("No identity data found for this customer");
    });

    it("returns 500 when plugin returns other error", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { id: "store-1", url: "https://example.com", apiKey: "wab_test" },
            ]),
        }),
      } as ReturnType<typeof db.select>);

      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const hash = "a".repeat(64);
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch identity data");
    });

    it("returns plugin data on success", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { id: "store-1", url: "https://example.com", apiKey: "wab_test" },
            ]),
        }),
      } as ReturnType<typeof db.select>);

      const mockIdentityData = {
        email_hash: "a".repeat(64),
        identity: {
          visitors: [
            {
              visitor_id: "wab_xyz",
              device_type: "desktop",
              first_seen: "2026-01-01T10:00:00Z",
              last_seen: "2026-01-14T15:00:00Z",
            },
          ],
          device_count: 1,
          visitor_count: 1,
        },
        journey: [
          {
            id: "1",
            visitor_id: "wab_xyz",
            source: "google",
            medium: "cpc",
            campaign: "winter",
            click_id_type: "gclid",
            created_at: "2026-01-01T10:00:00Z",
            identity_device: "desktop",
          },
        ],
        attribution: {
          first_touch: { "google / cpc": 1.0 },
          last_touch: { "google / cpc": 1.0 },
          linear: { "google / cpc": 1.0 },
          position_based: { "google / cpc": 1.0 },
        },
        insights: {
          first_touch_date: "2026-01-01T10:00:00Z",
          last_touch_date: "2026-01-14T15:00:00Z",
          total_touchpoints: 1,
          devices_used: { desktop: 1 },
          channels_used: { "google / cpc": 1 },
          journey_duration_days: 13,
          visitor_count: 1,
          device_count: 1,
        },
        generated_at: "2026-01-14T16:00:00Z",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockIdentityData,
      });

      const hash = "a".repeat(64);
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockIdentityData);
    });
  });

  describe("Multi-device identity", () => {
    it("returns data for customer with multiple devices", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { id: "store-1", url: "https://example.com", apiKey: "wab_test" },
            ]),
        }),
      } as ReturnType<typeof db.select>);

      const mockMultiDeviceData = {
        email_hash: "a".repeat(64),
        identity: {
          visitors: [
            {
              visitor_id: "wab_1",
              device_type: "desktop",
              first_seen: "2026-01-01T10:00:00Z",
              last_seen: "2026-01-10T10:00:00Z",
            },
            {
              visitor_id: "wab_2",
              device_type: "mobile",
              first_seen: "2026-01-05T08:00:00Z",
              last_seen: "2026-01-14T12:00:00Z",
            },
            {
              visitor_id: "wab_3",
              device_type: "tablet",
              first_seen: "2026-01-08T14:00:00Z",
              last_seen: "2026-01-12T18:00:00Z",
            },
          ],
          device_count: 3,
          visitor_count: 3,
        },
        journey: [],
        attribution: {},
        insights: {
          devices_used: { desktop: 1, mobile: 1, tablet: 1 },
          device_count: 3,
          visitor_count: 3,
        },
        generated_at: "2026-01-14T16:00:00Z",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockMultiDeviceData,
      });

      const hash = "a".repeat(64);
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.identity.visitors).toHaveLength(3);
      expect(data.identity.device_count).toBe(3);
    });
  });

  describe("Error handling", () => {
    it("returns 500 when fetch throws error", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([
              { id: "store-1", url: "https://example.com", apiKey: "wab_test" },
            ]),
        }),
      } as ReturnType<typeof db.select>);

      mockFetch.mockRejectedValue(new Error("Network error"));

      const hash = "a".repeat(64);
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch identity data");
    });

    it("returns 500 when database query fails", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockRejectedValue(new Error("Database error")),
        }),
      } as ReturnType<typeof db.select>);

      const hash = "a".repeat(64);
      const response = await GET(createRequest(hash), createParams(hash));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to fetch identity data");
    });
  });
});
