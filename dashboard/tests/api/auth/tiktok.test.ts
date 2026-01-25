import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Tests for TikTok OAuth API routes

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock db
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock encryption
vi.mock("@/lib/encryption", () => ({
  encrypt: vi.fn((data: string) => `encrypted:${data}`),
  decrypt: vi.fn((data: string) => data.replace("encrypted:", "")),
  encryptJson: vi.fn((data: unknown) => `encrypted:${JSON.stringify(data)}`),
  decryptJson: vi.fn((data: string) =>
    JSON.parse(data.replace("encrypted:", "")),
  ),
  generateStateToken: vi.fn(() => "test-state-token-abc123"),
}));

// Mock TikTok helpers
vi.mock("@/lib/tiktok", () => ({
  buildAuthUrl: vi.fn(
    (state: string) =>
      `https://ads.tiktok.com/marketing_api/auth?app_id=123&state=${state}`,
  ),
  exchangeCodeForTokens: vi.fn(),
  fetchAdvertiserInfo: vi.fn(),
  refreshAccessToken: vi.fn(),
  calculateTokenExpiry: vi.fn(
    (seconds: number) => new Date(Date.now() + seconds * 1000),
  ),
  getConfig: vi.fn(() => ({
    appId: "7012345678901234567",
    appSecret: "test-app-secret",
    redirectUri: "https://dashboard.example.com/api/auth/tiktok/callback",
  })),
  MARKETING_API_VERSION: "v1.3",
}));

// Mock cookies
const mockCookies = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    get: vi.fn((name: string) => {
      const value = mockCookies.get(name);
      return value ? { name, value } : undefined;
    }),
    set: vi.fn(
      (name: string, value: string, _options?: Record<string, unknown>) => {
        mockCookies.set(name, value);
      },
    ),
    delete: vi.fn((name: string) => {
      mockCookies.delete(name);
    }),
  })),
}));

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  exchangeCodeForTokens,
  fetchAdvertiserInfo,
  refreshAccessToken,
  calculateTokenExpiry,
} from "@/lib/tiktok";

describe("TikTok OAuth Routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockCookies.clear();
    vi.stubEnv("TIKTOK_APP_ID", "7012345678901234567");
    vi.stubEnv("TIKTOK_APP_SECRET", "test-app-secret");
    vi.stubEnv(
      "TIKTOK_REDIRECT_URI",
      "https://dashboard.example.com/api/auth/tiktok/callback",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET /api/auth/tiktok (initiate OAuth)", () => {
    it("should redirect to TikTok OAuth URL when authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      const { GET } = await import("@/app/api/auth/tiktok/route");

      const response = await GET();

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain(
        "https://ads.tiktok.com/marketing_api/auth",
      );
    });

    it("should redirect to sign-in when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { GET } = await import("@/app/api/auth/tiktok/route");

      const response = await GET();

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain("/auth/signin");
    });
  });

  describe("GET /api/auth/tiktok/callback (OAuth callback)", () => {
    const createCallbackRequest = (params: string) => {
      const url = new URL(
        `https://dashboard.example.com/api/auth/tiktok/callback?${params}`,
      );
      return new NextRequest(url);
    };

    beforeEach(() => {
      // Set up state cookie
      const stateData = {
        state: "test-state",
        userId: "user-123",
        expiresAt: Date.now() + 600000,
      };
      mockCookies.set(
        "tiktok_oauth_state",
        `encrypted:${JSON.stringify(stateData)}`,
      );
    });

    it("should exchange code for tokens and redirect to account selection", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        accessTokenExpiresIn: 86400,
        refreshTokenExpiresIn: 31536000,
        advertiserIds: ["adv-111", "adv-222"],
      });

      vi.mocked(fetchAdvertiserInfo).mockResolvedValue([
        {
          advertiserId: "adv-111",
          name: "Test Advertiser 1",
          currency: "GBP",
          timezone: "Europe/London",
          status: "STATUS_ENABLE",
          company: "Test Company",
        },
        {
          advertiserId: "adv-222",
          name: "Test Advertiser 2",
          currency: "USD",
          timezone: "America/New_York",
          status: "STATUS_ENABLE",
          company: "Test Company 2",
        },
      ]);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "pending-token-123" }]),
        }),
      } as never);

      const { GET } = await import("@/app/api/auth/tiktok/callback/route");

      const request = createCallbackRequest(
        "code=test-auth-code&state=test-state",
      );
      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain(
        "/dashboard/platforms/tiktok/select",
      );
      expect(response.headers.get("Location")).toContain("pendingTokenId=");
    });

    it("should redirect to platforms page with error if code is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      const { GET } = await import("@/app/api/auth/tiktok/callback/route");

      const request = createCallbackRequest("state=test-state");
      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain(
        "/dashboard/platforms",
      );
      expect(response.headers.get("Location")).toContain("error=");
    });

    it("should redirect to platforms page on token exchange failure", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(exchangeCodeForTokens).mockRejectedValue(
        new Error("Token exchange failed"),
      );

      const { GET } = await import("@/app/api/auth/tiktok/callback/route");

      const request = createCallbackRequest(
        "code=invalid-code&state=test-state",
      );
      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain(
        "/dashboard/platforms",
      );
      expect(response.headers.get("Location")).toContain("error=");
    });

    it("should redirect directly to platforms on success if only one advertiser", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        accessTokenExpiresIn: 86400,
        refreshTokenExpiresIn: 31536000,
        advertiserIds: ["adv-111"],
      });

      vi.mocked(fetchAdvertiserInfo).mockResolvedValue([
        {
          advertiserId: "adv-111",
          name: "Single Advertiser",
          currency: "GBP",
          timezone: "Europe/London",
          status: "STATUS_ENABLE",
          company: "Test Company",
        },
      ]);

      vi.mocked(calculateTokenExpiry).mockReturnValue(new Date("2025-01-26"));

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "connection-123" }]),
        }),
      } as never);

      const { GET } = await import("@/app/api/auth/tiktok/callback/route");

      const request = createCallbackRequest("code=test-code&state=test-state");
      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain(
        "/dashboard/platforms",
      );
      expect(response.headers.get("Location")).toContain("success=true");
      expect(response.headers.get("Location")).toContain("platform=tiktok_ads");
    });
  });

  describe("POST /api/auth/tiktok/select-account", () => {
    it("should create connection for selected advertiser account", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      // Mock pending token lookup
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "pending-123",
                userId: "user-123",
                accessToken: "encrypted:test-access",
                refreshToken: "encrypted:test-refresh",
                tokenExpiresAt: new Date(Date.now() + 86400000),
                accounts: [
                  {
                    accountId: "adv-111",
                    name: "Test Advertiser",
                    currency: "GBP",
                    timezone: "Europe/London",
                  },
                ],
                expiresAt: new Date(Date.now() + 300000),
              },
            ]),
          }),
        }),
      } as never);

      // Mock existing connection check
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "connection-123" }]),
        }),
      } as never);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { POST } = await import(
        "@/app/api/auth/tiktok/select-account/route"
      );

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/select-account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pendingTokenId: "pending-123",
            accountId: "adv-111",
          }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it("should return 400 if pending token ID is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      const { POST } = await import(
        "@/app/api/auth/tiktok/select-account/route"
      );

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/select-account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountId: "adv-111" }),
        },
      );

      const response = await POST(request);

      expect(response.status).toBe(400);
    });

    it("should return 404 if pending token not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const { POST } = await import(
        "@/app/api/auth/tiktok/select-account/route"
      );

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/select-account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pendingTokenId: "nonexistent",
            accountId: "adv-111",
          }),
        },
      );

      const response = await POST(request);

      expect(response.status).toBe(404);
    });

    it("should return 400 if selected account is not in pending token", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "pending-123",
                userId: "user-123",
                accounts: [{ accountId: "adv-111", name: "Test" }],
                expiresAt: new Date(Date.now() + 300000),
              },
            ]),
          }),
        }),
      } as never);

      const { POST } = await import(
        "@/app/api/auth/tiktok/select-account/route"
      );

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/select-account",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pendingTokenId: "pending-123",
            accountId: "adv-999", // Not in the list
          }),
        },
      );

      const response = await POST(request);

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/auth/tiktok/pending", () => {
    it("should return pending token accounts", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "pending-123",
                userId: "user-123",
                accounts: [
                  {
                    accountId: "adv-111",
                    name: "Test Advertiser",
                    currency: "GBP",
                    timezone: "Europe/London",
                  },
                ],
                expiresAt: new Date(Date.now() + 300000),
              },
            ]),
          }),
        }),
      } as never);

      const { GET } = await import("@/app/api/auth/tiktok/pending/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/pending?id=pending-123",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accounts).toHaveLength(1);
      expect(data.accounts[0].accountId).toBe("adv-111");
    });

    it("should return 400 if ID is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      const { GET } = await import("@/app/api/auth/tiktok/pending/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/pending",
      );

      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    it("should return 404 if pending token not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const { GET } = await import("@/app/api/auth/tiktok/pending/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/pending?id=nonexistent",
      );

      const response = await GET(request);

      expect(response.status).toBe(404);
    });

    it("should return 410 if pending token is expired", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "pending-123",
                userId: "user-123",
                accounts: [],
                expiresAt: new Date(Date.now() - 1000), // Expired
              },
            ]),
          }),
        }),
      } as never);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { GET } = await import("@/app/api/auth/tiktok/pending/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/pending?id=pending-123",
      );

      const response = await GET(request);

      expect(response.status).toBe(410);
    });
  });

  describe("POST /api/auth/tiktok/refresh", () => {
    it("should refresh tokens and update connection", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "connection-123",
                userId: "user-123",
                platform: "tiktok_ads",
                refreshToken: "encrypted:old-refresh-token",
              },
            ]),
          }),
        }),
      } as never);

      vi.mocked(refreshAccessToken).mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        accessTokenExpiresIn: 86400,
        refreshTokenExpiresIn: 31536000,
      });

      vi.mocked(calculateTokenExpiry).mockReturnValue(new Date("2025-01-26"));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      const { POST } = await import("@/app/api/auth/tiktok/refresh/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: "connection-123" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(refreshAccessToken).toHaveBeenCalledWith("old-refresh-token");
    });

    it("should return 404 if connection not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const { POST } = await import("@/app/api/auth/tiktok/refresh/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: "nonexistent" }),
        },
      );

      const response = await POST(request);

      expect(response.status).toBe(404);
    });

    it("should mark connection as needs_reauth when refresh token is expired", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      } as never);

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "connection-123",
                userId: "user-123",
                platform: "tiktok_ads",
                refreshToken: "encrypted:expired-refresh-token",
              },
            ]),
          }),
        }),
      } as never);

      vi.mocked(refreshAccessToken).mockRejectedValue(
        new Error("Refresh token expired"),
      );

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      const { POST } = await import("@/app/api/auth/tiktok/refresh/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/auth/tiktok/refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: "connection-123" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain("expired");
    });
  });

  describe("GET /api/cron/tiktok-refresh (cron job)", () => {
    it("should refresh all TikTok connections with expiring tokens", async () => {
      // Mock connections that need refresh (within 6 hours of expiry)
      const expiringConnections = [
        {
          id: "conn-1",
          userId: "user-1",
          accountId: "adv-111",
          refreshToken: "encrypted:refresh-1",
          tokenExpiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000), // 3 hours from now
        },
        {
          id: "conn-2",
          userId: "user-2",
          accountId: "adv-222",
          refreshToken: "encrypted:refresh-2",
          tokenExpiresAt: new Date(Date.now() + 5 * 60 * 60 * 1000), // 5 hours from now
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(expiringConnections),
        }),
      } as never);

      vi.mocked(refreshAccessToken).mockResolvedValue({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        accessTokenExpiresIn: 86400,
        refreshTokenExpiresIn: 31536000,
      });

      vi.mocked(calculateTokenExpiry).mockReturnValue(new Date("2025-01-26"));

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      const { GET } = await import("@/app/api/cron/tiktok-refresh/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/cron/tiktok-refresh",
        {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET || "test-cron-secret"}`,
          },
        },
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.refreshed).toBe(2);
    });

    it("should mark connections as needs_reauth when refresh fails", async () => {
      const expiringConnections = [
        {
          id: "conn-1",
          userId: "user-1",
          accountId: "adv-111",
          refreshToken: "encrypted:refresh-1",
          tokenExpiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(expiringConnections),
        }),
      } as never);

      vi.mocked(refreshAccessToken).mockRejectedValue(
        new Error("Refresh token expired"),
      );

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      const { GET } = await import("@/app/api/cron/tiktok-refresh/route");

      const request = new NextRequest(
        "https://dashboard.example.com/api/cron/tiktok-refresh",
        {
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET || "test-cron-secret"}`,
          },
        },
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.failed).toBe(1);
    });
  });
});
