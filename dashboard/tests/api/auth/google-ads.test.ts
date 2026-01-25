import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Tests for Google Ads OAuth API routes (TDD - written before implementation)

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

// Mock google-ads helpers
vi.mock("@/lib/google-ads", () => ({
  buildAuthUrl: vi.fn(
    (state: string) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`,
  ),
  exchangeCodeForTokens: vi.fn(),
  refreshAccessToken: vi.fn(),
  fetchAccessibleCustomers: vi.fn(),
  fetchCustomerDetails: vi.fn(),
  fetchMultipleCustomerDetails: vi.fn(),
  revokeToken: vi.fn(),
  calculateTokenExpiry: vi.fn(
    (seconds: number) => new Date(Date.now() + seconds * 1000),
  ),
  getConfig: vi.fn(() => ({
    clientId: "test-client-id",
    clientSecret: "test-secret",
    redirectUri: "https://test.com/callback",
    developerToken: "test-dev-token",
  })),
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
  fetchAccessibleCustomers,
  fetchMultipleCustomerDetails,
  refreshAccessToken,
} from "@/lib/google-ads";
import { encryptJson, decryptJson } from "@/lib/encryption";

describe("Google Ads OAuth API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.clear();

    // Set up required environment variables
    vi.stubEnv(
      "GOOGLE_ADS_CLIENT_ID",
      "test-client-id.apps.googleusercontent.com",
    );
    vi.stubEnv("GOOGLE_ADS_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv(
      "GOOGLE_ADS_REDIRECT_URI",
      "https://dashboard.example.com/api/auth/google-ads/callback",
    );
    vi.stubEnv("GOOGLE_ADS_DEVELOPER_TOKEN", "test-developer-token");
    vi.stubEnv(
      "TOKEN_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET /api/auth/google-ads (OAuth Initiation)", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { GET } = await import("@/app/api/auth/google-ads/route");
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("redirects to Google OAuth with correct parameters", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/google-ads/route");
      const response = await GET();

      expect(response.status).toBe(307);
      const location = response.headers.get("Location");
      expect(location).toContain("accounts.google.com");
      expect(location).toContain("state=test-state-token-abc123");
    });

    it("stores state in encrypted cookie", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/google-ads/route");
      await GET();

      // State should be stored in cookie
      expect(mockCookies.has("google_ads_oauth_state")).toBe(true);
      const storedState = mockCookies.get("google_ads_oauth_state");
      expect(storedState).toContain("encrypted:");
    });
  });

  describe("GET /api/auth/google-ads/callback (OAuth Callback)", () => {
    it("returns 400 when code is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/google-ads/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/callback?state=test-state",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("code");
    });

    it("returns 400 when state is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/google-ads/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/callback?code=test-code",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.toLowerCase()).toContain("state");
    });

    it("returns 400 when state does not match cookie", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Store different state in cookie
      const stateData = {
        state: "different-state",
        userId: "test-user-id",
        expiresAt: Date.now() + 600000,
      };
      mockCookies.set(
        "google_ads_oauth_state",
        `encrypted:${JSON.stringify(stateData)}`,
      );

      const { GET } = await import("@/app/api/auth/google-ads/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/callback?code=test-code&state=wrong-state",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("Invalid state");
    });

    it("returns 400 when state is expired", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Store expired state in cookie
      const stateData = {
        state: "test-state",
        userId: "test-user-id",
        expiresAt: Date.now() - 1000, // Expired
      };
      mockCookies.set(
        "google_ads_oauth_state",
        `encrypted:${JSON.stringify(stateData)}`,
      );

      const { GET } = await import("@/app/api/auth/google-ads/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/callback?code=test-code&state=test-state",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("expired");
    });

    it("exchanges code for tokens and fetches accounts", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Store valid state
      const stateData = {
        state: "test-state",
        userId: "test-user-id",
        expiresAt: Date.now() + 600000,
      };
      mockCookies.set(
        "google_ads_oauth_state",
        `encrypted:${JSON.stringify(stateData)}`,
      );

      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        accessToken: "ya29.test-access-token",
        refreshToken: "1//test-refresh-token",
        expiresIn: 3600,
      });

      vi.mocked(fetchAccessibleCustomers).mockResolvedValue([
        "1234567890",
        "0987654321",
      ]);

      vi.mocked(fetchMultipleCustomerDetails).mockResolvedValue([
        {
          customerId: "1234567890",
          name: "Account 1",
          currency: "GBP",
          timezone: "Europe/London",
        },
        {
          customerId: "0987654321",
          name: "Account 2",
          currency: "USD",
          timezone: "America/New_York",
        },
      ]);

      // Mock pending token insert
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "pending-token-id" }]),
        }),
      } as ReturnType<typeof db.insert>);

      const { GET } = await import("@/app/api/auth/google-ads/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/callback?code=test-code&state=test-state",
      );

      const response = await GET(request);

      expect(exchangeCodeForTokens).toHaveBeenCalledWith("test-code");
      expect(fetchAccessibleCustomers).toHaveBeenCalledWith(
        "ya29.test-access-token",
      );

      // Should redirect to account selection page when multiple accounts
      expect(response.status).toBe(307);
      const location = response.headers.get("Location");
      expect(location).toContain("/dashboard/platforms/google-ads/select");
    });

    it("creates connection directly when only one account", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const stateData = {
        state: "test-state",
        userId: "test-user-id",
        expiresAt: Date.now() + 600000,
      };
      mockCookies.set(
        "google_ads_oauth_state",
        `encrypted:${JSON.stringify(stateData)}`,
      );

      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        accessToken: "ya29.test-access-token",
        refreshToken: "1//test-refresh-token",
        expiresIn: 3600,
      });

      vi.mocked(fetchAccessibleCustomers).mockResolvedValue(["1234567890"]);

      vi.mocked(fetchMultipleCustomerDetails).mockResolvedValue([
        {
          customerId: "1234567890",
          name: "Only Account",
          currency: "GBP",
          timezone: "Europe/London",
        },
      ]);

      // Mock connection insert
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "connection-id" }]),
        }),
      } as ReturnType<typeof db.insert>);

      const { GET } = await import("@/app/api/auth/google-ads/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/callback?code=test-code&state=test-state",
      );

      const response = await GET(request);

      // Should redirect to platforms page with success when only one account
      expect(response.status).toBe(307);
      const location = response.headers.get("Location");
      expect(location).toContain("/dashboard/platforms");
      expect(location).toContain("success=true");
    });

    it("handles Google OAuth error response", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/google-ads/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/callback?error=access_denied&error_description=User%20denied%20access",
      );

      const response = await GET(request);

      // Should redirect to platforms page with error
      expect(response.status).toBe(307);
      const location = response.headers.get("Location");
      expect(location).toContain("/dashboard/platforms");
      expect(location).toContain("error=");
    });
  });

  describe("POST /api/auth/google-ads/select-account (Account Selection)", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { POST } = await import(
        "@/app/api/auth/google-ads/select-account/route"
      );
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/select-account",
        {
          method: "POST",
          body: JSON.stringify({
            pendingTokenId: "token-id",
            accountId: "123",
          }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 400 when pendingTokenId is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { POST } = await import(
        "@/app/api/auth/google-ads/select-account/route"
      );
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/select-account",
        {
          method: "POST",
          body: JSON.stringify({ accountId: "123" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("pendingTokenId");
    });

    it("returns 400 when accountId is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { POST } = await import(
        "@/app/api/auth/google-ads/select-account/route"
      );
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/select-account",
        {
          method: "POST",
          body: JSON.stringify({ pendingTokenId: "token-id" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("accountId");
    });

    it("returns 404 when pending token not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      const { POST } = await import(
        "@/app/api/auth/google-ads/select-account/route"
      );
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/select-account",
        {
          method: "POST",
          body: JSON.stringify({
            pendingTokenId: "nonexistent-id",
            accountId: "123",
          }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain("not found");
    });

    it("creates connection from pending token", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const pendingToken = {
        id: "pending-id",
        userId: "test-user-id",
        platform: "google_ads",
        accessToken: "encrypted:ya29.test-token",
        refreshToken: "encrypted:1//refresh-token",
        tokenExpiresAt: new Date(Date.now() + 3600000),
        accounts: [
          {
            customerId: "123",
            name: "Account 1",
            currency: "GBP",
            timezone: "Europe/London",
          },
          {
            customerId: "456",
            name: "Account 2",
            currency: "USD",
            timezone: "America/New_York",
          },
        ],
        expiresAt: new Date(Date.now() + 600000),
      };

      // First call: find pending token (returns pendingToken)
      // Second call: check existing connection (returns empty - no existing)
      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi
                .fn()
                .mockResolvedValue(selectCallCount === 1 ? [pendingToken] : []),
            }),
          }),
        } as ReturnType<typeof db.select>;
      });

      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "new-connection-id" }]),
        }),
      } as ReturnType<typeof db.insert>);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      } as ReturnType<typeof db.delete>);

      const { POST } = await import(
        "@/app/api/auth/google-ads/select-account/route"
      );
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/select-account",
        {
          method: "POST",
          body: JSON.stringify({
            pendingTokenId: "pending-id",
            accountId: "123",
          }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.connectionId).toBe("new-connection-id");
      expect(db.insert).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled(); // Pending token should be deleted
    });
  });

  describe("POST /api/auth/google-ads/refresh (Token Refresh)", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { POST } = await import("@/app/api/auth/google-ads/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/refresh",
        {
          method: "POST",
          body: JSON.stringify({ connectionId: "conn-id" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 400 when connectionId is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { POST } = await import("@/app/api/auth/google-ads/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/refresh",
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("connectionId");
    });

    it("returns 404 when connection not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      const { POST } = await import("@/app/api/auth/google-ads/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/refresh",
        {
          method: "POST",
          body: JSON.stringify({ connectionId: "nonexistent" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain("not found");
    });

    it("refreshes token and updates connection", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const connection = {
        id: "conn-id",
        userId: "test-user-id",
        platform: "google_ads",
        refreshToken: "encrypted:1//old-refresh-token",
        status: "active",
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([connection]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(refreshAccessToken).mockResolvedValue({
        accessToken: "ya29.new-access-token",
        expiresIn: 3600,
      });

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({ rowCount: 1 }),
        }),
      } as ReturnType<typeof db.update>);

      const { POST } = await import("@/app/api/auth/google-ads/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/refresh",
        {
          method: "POST",
          body: JSON.stringify({ connectionId: "conn-id" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(refreshAccessToken).toHaveBeenCalled();
      expect(db.update).toHaveBeenCalled();
    });

    it("returns 400 when connection has no refresh token", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const connection = {
        id: "conn-id",
        userId: "test-user-id",
        platform: "google_ads",
        refreshToken: null, // No refresh token
        status: "active",
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([connection]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      const { POST } = await import("@/app/api/auth/google-ads/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads/refresh",
        {
          method: "POST",
          body: JSON.stringify({ connectionId: "conn-id" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("refresh token");
    });
  });

  describe("DELETE /api/auth/google-ads (Disconnect)", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { DELETE } = await import("@/app/api/auth/google-ads/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads?connectionId=conn-id",
        { method: "DELETE" },
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 400 when connectionId is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { DELETE } = await import("@/app/api/auth/google-ads/route");
      const request = new NextRequest("http://localhost/api/auth/google-ads", {
        method: "DELETE",
      });

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("connectionId");
    });

    it("deletes connection successfully", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const connection = {
        id: "conn-id",
        userId: "test-user-id",
        platform: "google_ads",
        accessToken: "encrypted:token",
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([connection]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue({ rowCount: 1 }),
      } as ReturnType<typeof db.delete>);

      const { DELETE } = await import("@/app/api/auth/google-ads/route");
      const request = new NextRequest(
        "http://localhost/api/auth/google-ads?connectionId=conn-id",
        { method: "DELETE" },
      );

      const response = await DELETE(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
