import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Tests for Meta OAuth API routes (TDD - written before implementation)

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

// Mock meta helpers
vi.mock("@/lib/meta", () => ({
  buildAuthUrl: vi.fn(
    (state: string) =>
      `https://www.facebook.com/v18.0/dialog/oauth?state=${state}`,
  ),
  exchangeCodeForTokens: vi.fn(),
  exchangeForLongLivedToken: vi.fn(),
  fetchAdAccounts: vi.fn(),
  refreshToken: vi.fn(),
  revokeToken: vi.fn(),
  calculateTokenExpiry: vi.fn(
    (seconds: number) => new Date(Date.now() + seconds * 1000),
  ),
  generateAppSecretProof: vi.fn(() => "mock-appsecret-proof"),
  getConfig: vi.fn(() => ({
    appId: "123456789012345",
    appSecret: "test-app-secret",
    redirectUri: "https://test.com/callback",
  })),
  GRAPH_API_VERSION: "v18.0",
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
  exchangeForLongLivedToken,
  fetchAdAccounts,
  refreshToken,
} from "@/lib/meta";
import { encryptJson, decryptJson } from "@/lib/encryption";

describe("Meta OAuth API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCookies.clear();

    // Set up required environment variables
    vi.stubEnv("META_APP_ID", "123456789012345");
    vi.stubEnv("META_APP_SECRET", "test-app-secret");
    vi.stubEnv(
      "META_REDIRECT_URI",
      "https://dashboard.example.com/api/auth/meta/callback",
    );
    vi.stubEnv(
      "TOKEN_ENCRYPTION_KEY",
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("GET /api/auth/meta (OAuth Initiation)", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { GET } = await import("@/app/api/auth/meta/route");
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("redirects to Facebook OAuth with correct parameters", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/meta/route");
      const response = await GET();

      expect(response.status).toBe(307);
      const location = response.headers.get("Location");
      expect(location).toContain("facebook.com");
      expect(location).toContain("state=test-state-token-abc123");
    });

    it("stores state in encrypted cookie", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/meta/route");
      await GET();

      // State should be stored in cookie
      expect(mockCookies.has("meta_oauth_state")).toBe(true);
      const storedState = mockCookies.get("meta_oauth_state");
      expect(storedState).toContain("encrypted:");
    });
  });

  describe("GET /api/auth/meta/callback (OAuth Callback)", () => {
    it("returns 400 when code is missing", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/meta/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/callback?state=test-state",
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

      const { GET } = await import("@/app/api/auth/meta/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/callback?code=test-code",
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
      vi.mocked(encryptJson).mockReturnValue(
        `encrypted:${JSON.stringify(stateData)}`,
      );
      vi.mocked(decryptJson).mockReturnValue(stateData);
      mockCookies.set(
        "meta_oauth_state",
        `encrypted:${JSON.stringify(stateData)}`,
      );

      const { GET } = await import("@/app/api/auth/meta/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/callback?code=test-code&state=wrong-state",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.toLowerCase()).toContain("state");
    });

    it("exchanges code for short-lived token then long-lived token", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Set up valid state
      const stateData = {
        state: "valid-state",
        userId: "test-user-id",
        expiresAt: Date.now() + 600000,
      };
      vi.mocked(decryptJson).mockReturnValue(stateData);
      mockCookies.set(
        "meta_oauth_state",
        `encrypted:${JSON.stringify(stateData)}`,
      );

      // Mock token exchange - short-lived
      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        accessToken: "short-lived-token",
        expiresIn: 3600,
      });

      // Mock long-lived token exchange
      vi.mocked(exchangeForLongLivedToken).mockResolvedValue({
        accessToken: "long-lived-token",
        expiresIn: 5184000, // 60 days
      });

      // Mock ad accounts (single account - direct connection)
      vi.mocked(fetchAdAccounts).mockResolvedValue([
        {
          accountId: "1234567890",
          name: "Test Ad Account",
          currency: "GBP",
          timezone: "Europe/London",
        },
      ]);

      // Mock db.select for checking existing connection
      const mockSelectFn = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      });
      vi.mocked(db.select).mockImplementation(mockSelectFn);

      // Mock db.insert for creating connection
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "new-connection-id" }]),
        }),
      } as never);

      const { GET } = await import("@/app/api/auth/meta/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/callback?code=test-code&state=valid-state",
      );

      const response = await GET(request);

      // Should exchange for short-lived token first
      expect(exchangeCodeForTokens).toHaveBeenCalledWith("test-code");

      // Then exchange for long-lived token
      expect(exchangeForLongLivedToken).toHaveBeenCalledWith(
        "short-lived-token",
      );

      // Should fetch ad accounts
      expect(fetchAdAccounts).toHaveBeenCalledWith("long-lived-token");

      // Should redirect to platforms page with success
      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain(
        "/dashboard/platforms",
      );
      expect(response.headers.get("Location")).toContain("success=true");
    });

    it("redirects to account selection when multiple ad accounts", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const stateData = {
        state: "valid-state",
        userId: "test-user-id",
        expiresAt: Date.now() + 600000,
      };
      vi.mocked(decryptJson).mockReturnValue(stateData);
      mockCookies.set(
        "meta_oauth_state",
        `encrypted:${JSON.stringify(stateData)}`,
      );

      vi.mocked(exchangeCodeForTokens).mockResolvedValue({
        accessToken: "short-lived-token",
        expiresIn: 3600,
      });

      vi.mocked(exchangeForLongLivedToken).mockResolvedValue({
        accessToken: "long-lived-token",
        expiresIn: 5184000,
      });

      // Multiple ad accounts
      vi.mocked(fetchAdAccounts).mockResolvedValue([
        {
          accountId: "111",
          name: "Account 1",
          currency: "GBP",
          timezone: "Europe/London",
        },
        {
          accountId: "222",
          name: "Account 2",
          currency: "USD",
          timezone: "America/New_York",
        },
      ]);

      // Mock db.insert for pending token
      let insertCallCount = 0;
      vi.mocked(db.insert).mockImplementation(() => {
        insertCallCount++;
        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: "pending-token-id" }]),
          }),
        } as never;
      });

      const { GET } = await import("@/app/api/auth/meta/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/callback?code=test-code&state=valid-state",
      );

      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain(
        "/dashboard/platforms/meta/select",
      );
      expect(response.headers.get("Location")).toContain("pendingTokenId=");
    });

    it("handles Facebook error response", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const { GET } = await import("@/app/api/auth/meta/callback/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/callback?error=access_denied&error_reason=user_denied&error_description=Permissions+error",
      );

      const response = await GET(request);

      expect(response.status).toBe(307);
      expect(response.headers.get("Location")).toContain(
        "/dashboard/platforms",
      );
      expect(response.headers.get("Location")).toContain("error=");
    });
  });

  describe("POST /api/auth/meta/select-account", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { POST } = await import("@/app/api/auth/meta/select-account/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/select-account",
        {
          method: "POST",
          body: JSON.stringify({ pendingTokenId: "xxx", accountId: "111" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("creates connection from pending token", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Mock pending token lookup
      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call: pending token lookup
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: "pending-token-id",
                    userId: "test-user-id",
                    platform: "meta_ads",
                    accessToken: "encrypted:long-lived-token",
                    tokenExpiresAt: new Date(Date.now() + 5184000000),
                    accounts: [
                      {
                        accountId: "111",
                        name: "Account 1",
                        currency: "GBP",
                        timezone: "Europe/London",
                      },
                    ],
                    expiresAt: new Date(Date.now() + 600000),
                  },
                ]),
              }),
            }),
          } as never;
        } else {
          // Second call: check existing connection
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }),
          } as never;
        }
      });

      // Mock db.insert for connection
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "new-connection-id" }]),
        }),
      } as never);

      // Mock db.delete for pending token cleanup
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { POST } = await import("@/app/api/auth/meta/select-account/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/select-account",
        {
          method: "POST",
          body: JSON.stringify({
            pendingTokenId: "pending-token-id",
            accountId: "111",
          }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.connection.id).toBe("new-connection-id");
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
      } as never);

      const { POST } = await import("@/app/api/auth/meta/select-account/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/select-account",
        {
          method: "POST",
          body: JSON.stringify({
            pendingTokenId: "invalid-id",
            accountId: "111",
          }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain("not found");
    });

    it("returns 409 when account already connected", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let selectCallCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          // First call: pending token lookup
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([
                  {
                    id: "pending-token-id",
                    userId: "test-user-id",
                    platform: "meta_ads",
                    accessToken: "encrypted:long-lived-token",
                    tokenExpiresAt: new Date(Date.now() + 5184000000),
                    accounts: [
                      {
                        accountId: "111",
                        name: "Account 1",
                        currency: "GBP",
                        timezone: "Europe/London",
                      },
                    ],
                    expiresAt: new Date(Date.now() + 600000),
                  },
                ]),
              }),
            }),
          } as never;
        } else {
          // Second call: existing connection exists
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue([{ id: "existing-connection" }]),
              }),
            }),
          } as never;
        }
      });

      const { POST } = await import("@/app/api/auth/meta/select-account/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/select-account",
        {
          method: "POST",
          body: JSON.stringify({
            pendingTokenId: "pending-token-id",
            accountId: "111",
          }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toContain("already connected");
    });
  });

  describe("POST /api/auth/meta/refresh", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { POST } = await import("@/app/api/auth/meta/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/refresh",
        {
          method: "POST",
          body: JSON.stringify({ connectionId: "xxx" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("refreshes token and updates expiry", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Mock connection lookup
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "connection-id",
                userId: "test-user-id",
                platform: "meta_ads",
                accessToken: "encrypted:old-token",
                tokenExpiresAt: new Date(Date.now() + 86400000), // 1 day left
              },
            ]),
          }),
        }),
      } as never);

      // Mock token refresh
      vi.mocked(refreshToken).mockResolvedValue({
        accessToken: "new-long-lived-token",
        expiresIn: 5184000,
      });

      // Mock db.update
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as never);

      const { POST } = await import("@/app/api/auth/meta/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/refresh",
        {
          method: "POST",
          body: JSON.stringify({ connectionId: "connection-id" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.expiresAt).toBeDefined();
      expect(refreshToken).toHaveBeenCalled();
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
      } as never);

      const { POST } = await import("@/app/api/auth/meta/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/refresh",
        {
          method: "POST",
          body: JSON.stringify({ connectionId: "invalid-id" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain("not found");
    });

    it("returns 400 when token has already expired", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Mock connection with expired token
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "connection-id",
                userId: "test-user-id",
                platform: "meta_ads",
                accessToken: "encrypted:expired-token",
                tokenExpiresAt: new Date(Date.now() - 86400000), // Expired 1 day ago
              },
            ]),
          }),
        }),
      } as never);

      const { POST } = await import("@/app/api/auth/meta/refresh/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/refresh",
        {
          method: "POST",
          body: JSON.stringify({ connectionId: "connection-id" }),
        },
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("expired");
    });
  });

  describe("GET /api/auth/meta/pending", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const { GET } = await import("@/app/api/auth/meta/pending/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/pending?id=xxx",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns pending token data with accounts", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "pending-token-id",
                userId: "test-user-id",
                platform: "meta_ads",
                accounts: [
                  {
                    accountId: "111",
                    name: "Account 1",
                    currency: "GBP",
                    timezone: "Europe/London",
                  },
                  {
                    accountId: "222",
                    name: "Account 2",
                    currency: "USD",
                    timezone: "America/New_York",
                  },
                ],
                expiresAt: new Date(Date.now() + 600000),
              },
            ]),
          }),
        }),
      } as never);

      const { GET } = await import("@/app/api/auth/meta/pending/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/pending?id=pending-token-id",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.accounts).toHaveLength(2);
      expect(data.accounts[0].accountId).toBe("111");
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
      } as never);

      const { GET } = await import("@/app/api/auth/meta/pending/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/pending?id=invalid-id",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain("not found");
    });

    it("returns 400 when pending token has expired", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "pending-token-id",
                userId: "test-user-id",
                platform: "meta_ads",
                accounts: [],
                expiresAt: new Date(Date.now() - 60000), // Expired
              },
            ]),
          }),
        }),
      } as never);

      // Mock db.delete for cleanup
      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as never);

      const { GET } = await import("@/app/api/auth/meta/pending/route");
      const request = new NextRequest(
        "http://localhost/api/auth/meta/pending?id=pending-token-id",
      );

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain("expired");
    });
  });
});
