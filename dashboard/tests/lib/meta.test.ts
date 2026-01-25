import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as crypto from "crypto";

// Tests for Meta Graph API helpers (TDD - written before implementation)

describe("Meta Graph API Helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    // Set up required environment variables
    vi.stubEnv("META_APP_ID", "123456789012345");
    vi.stubEnv("META_APP_SECRET", "test-app-secret");
    vi.stubEnv(
      "META_REDIRECT_URI",
      "https://dashboard.example.com/api/auth/meta/callback",
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("buildAuthUrl", () => {
    it("should generate correct Facebook OAuth URL with all required parameters", async () => {
      const { buildAuthUrl } = await import("@/lib/meta");

      const state = "random-state-token";
      const url = buildAuthUrl(state);

      expect(url).toContain("https://www.facebook.com/v18.0/dialog/oauth");
      expect(url).toContain("client_id=123456789012345");
      expect(url).toContain(
        "redirect_uri=https%3A%2F%2Fdashboard.example.com%2Fapi%2Fauth%2Fmeta%2Fcallback",
      );
      expect(url).toContain("response_type=code");
      expect(url).toContain(`state=${state}`);
    });

    it("should include required scopes for ads access", async () => {
      const { buildAuthUrl } = await import("@/lib/meta");

      const url = buildAuthUrl("test-state");

      expect(url).toContain("scope=");
      expect(url).toContain("ads_read");
      expect(url).toContain("ads_management");
      expect(url).toContain("business_management");
    });

    it("should URL-encode the state parameter", async () => {
      const { buildAuthUrl } = await import("@/lib/meta");

      const state = "state with spaces & special=chars";
      const url = buildAuthUrl(state);

      expect(url).toContain(
        "state=state%20with%20spaces%20%26%20special%3Dchars",
      );
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("should exchange authorization code for short-lived access token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "EAABtest-short-lived-token",
            token_type: "bearer",
            expires_in: 3600,
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForTokens } = await import("@/lib/meta");

      const result = await exchangeCodeForTokens("test-auth-code");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://graph.facebook.com/v18.0/oauth/access_token",
        ),
        expect.objectContaining({
          method: "GET",
        }),
      );

      // Check that URL contains required parameters
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("client_id=123456789012345");
      expect(callUrl).toContain("client_secret=test-app-secret");
      expect(callUrl).toContain("code=test-auth-code");
      expect(callUrl).toContain(
        "redirect_uri=https%3A%2F%2Fdashboard.example.com%2Fapi%2Fauth%2Fmeta%2Fcallback",
      );

      expect(result.accessToken).toBe("EAABtest-short-lived-token");
      expect(result.expiresIn).toBe(3600);
    });

    it("should throw error on failed token exchange", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              message: "Invalid verification code format.",
              type: "OAuthException",
              code: 100,
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForTokens } = await import("@/lib/meta");

      await expect(exchangeCodeForTokens("invalid-code")).rejects.toThrow(
        "Token exchange failed",
      );
    });
  });

  describe("exchangeForLongLivedToken", () => {
    it("should exchange short-lived token for long-lived token (60 days)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "EAABtest-long-lived-token",
            token_type: "bearer",
            expires_in: 5184000, // 60 days in seconds
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeForLongLivedToken } = await import("@/lib/meta");

      const result = await exchangeForLongLivedToken(
        "EAABtest-short-lived-token",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://graph.facebook.com/v18.0/oauth/access_token",
        ),
        expect.objectContaining({
          method: "GET",
        }),
      );

      // Check URL contains fb_exchange_token parameters
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("grant_type=fb_exchange_token");
      expect(callUrl).toContain("client_id=123456789012345");
      expect(callUrl).toContain("client_secret=test-app-secret");
      expect(callUrl).toContain("fb_exchange_token=EAABtest-short-lived-token");

      expect(result.accessToken).toBe("EAABtest-long-lived-token");
      expect(result.expiresIn).toBe(5184000);
    });

    it("should throw error if token exchange fails", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              message: "Error validating access token",
              type: "OAuthException",
              code: 190,
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeForLongLivedToken } = await import("@/lib/meta");

      await expect(exchangeForLongLivedToken("invalid-token")).rejects.toThrow(
        "Failed to exchange for long-lived token",
      );
    });
  });

  describe("generateAppSecretProof", () => {
    it("should generate correct HMAC-SHA256 of access token with app secret", async () => {
      const { generateAppSecretProof } = await import("@/lib/meta");

      const accessToken = "EAABtest-token";
      const proof = generateAppSecretProof(accessToken);

      // Verify it's a valid hex string
      expect(proof).toMatch(/^[a-f0-9]{64}$/);

      // Verify it's the correct HMAC
      const expectedProof = crypto
        .createHmac("sha256", "test-app-secret")
        .update(accessToken)
        .digest("hex");
      expect(proof).toBe(expectedProof);
    });

    it("should generate different proofs for different tokens", async () => {
      const { generateAppSecretProof } = await import("@/lib/meta");

      const proof1 = generateAppSecretProof("token1");
      const proof2 = generateAppSecretProof("token2");

      expect(proof1).not.toBe(proof2);
    });
  });

  describe("fetchAdAccounts", () => {
    it("should fetch list of user's ad accounts", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "act_1234567890",
                name: "My Ad Account",
                account_id: "1234567890",
                currency: "GBP",
                timezone_name: "Europe/London",
                account_status: 1,
              },
              {
                id: "act_0987654321",
                name: "Second Account",
                account_id: "0987654321",
                currency: "USD",
                timezone_name: "America/New_York",
                account_status: 1,
              },
            ],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAdAccounts } = await import("@/lib/meta");

      const accounts = await fetchAdAccounts("EAABtest-token");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://graph.facebook.com/v18.0/me/adaccounts",
        ),
        expect.any(Object),
      );

      // Should include appsecret_proof
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("access_token=EAABtest-token");
      expect(callUrl).toContain("appsecret_proof=");
      // Fields are URL-encoded (commas become %2C)
      expect(callUrl).toContain("fields=");
      expect(callUrl).toContain("account_id");
      expect(callUrl).toContain("currency");
      expect(callUrl).toContain("timezone_name");

      expect(accounts).toHaveLength(2);
      expect(accounts[0].accountId).toBe("1234567890");
      expect(accounts[0].name).toBe("My Ad Account");
      expect(accounts[0].currency).toBe("GBP");
      expect(accounts[0].timezone).toBe("Europe/London");
    });

    it("should return empty array when no ad accounts found", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAdAccounts } = await import("@/lib/meta");

      const accounts = await fetchAdAccounts("EAABtest-token");

      expect(accounts).toEqual([]);
    });

    it("should filter out inactive ad accounts", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              {
                id: "act_1234567890",
                name: "Active Account",
                account_id: "1234567890",
                currency: "GBP",
                timezone_name: "Europe/London",
                account_status: 1, // Active
              },
              {
                id: "act_0987654321",
                name: "Disabled Account",
                account_id: "0987654321",
                currency: "USD",
                timezone_name: "America/New_York",
                account_status: 2, // Disabled
              },
            ],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAdAccounts } = await import("@/lib/meta");

      const accounts = await fetchAdAccounts("EAABtest-token");

      expect(accounts).toHaveLength(1);
      expect(accounts[0].accountId).toBe("1234567890");
    });

    it("should throw error on API failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: {
              message: "Invalid OAuth access token.",
              type: "OAuthException",
              code: 190,
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAdAccounts } = await import("@/lib/meta");

      await expect(fetchAdAccounts("invalid-token")).rejects.toThrow(
        "Failed to fetch ad accounts",
      );
    });

    it("should handle pagination for many ad accounts", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "act_111",
                  name: "Account 1",
                  account_id: "111",
                  currency: "GBP",
                  timezone_name: "Europe/London",
                  account_status: 1,
                },
              ],
              paging: {
                cursors: { after: "cursor123" },
                next: "https://graph.facebook.com/v18.0/me/adaccounts?after=cursor123",
              },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "act_222",
                  name: "Account 2",
                  account_id: "222",
                  currency: "USD",
                  timezone_name: "America/New_York",
                  account_status: 1,
                },
              ],
            }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAdAccounts } = await import("@/lib/meta");

      const accounts = await fetchAdAccounts("EAABtest-token");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(accounts).toHaveLength(2);
      expect(accounts[0].accountId).toBe("111");
      expect(accounts[1].accountId).toBe("222");
    });
  });

  describe("refreshToken", () => {
    it("should exchange current long-lived token for a new one", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "EAABtest-new-long-lived-token",
            token_type: "bearer",
            expires_in: 5184000,
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { refreshToken } = await import("@/lib/meta");

      const result = await refreshToken("EAABtest-old-token");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://graph.facebook.com/v18.0/oauth/access_token",
        ),
        expect.any(Object),
      );

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("grant_type=fb_exchange_token");
      expect(callUrl).toContain("fb_exchange_token=EAABtest-old-token");

      expect(result.accessToken).toBe("EAABtest-new-long-lived-token");
      expect(result.expiresIn).toBe(5184000);
    });

    it("should throw error when token has already expired", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              message: "Error validating access token: Session has expired",
              type: "OAuthException",
              code: 190,
              error_subcode: 463,
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { refreshToken } = await import("@/lib/meta");

      await expect(refreshToken("expired-token")).rejects.toThrow(
        "Token refresh failed",
      );
    });
  });

  describe("revokeToken", () => {
    it("should revoke access token via Graph API", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { revokeToken } = await import("@/lib/meta");

      await revokeToken("EAABtest-token");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://graph.facebook.com/v18.0/me/permissions",
        ),
        expect.objectContaining({
          method: "DELETE",
        }),
      );

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("access_token=EAABtest-token");
    });

    it("should not throw on revocation failure (token may already be invalid)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: { message: "Invalid token" },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { revokeToken } = await import("@/lib/meta");

      // Should not throw
      await expect(revokeToken("invalid-token")).resolves.toBeUndefined();
    });
  });

  describe("getConfig", () => {
    it("should return configuration from environment variables", async () => {
      const { getConfig } = await import("@/lib/meta");

      const config = getConfig();

      expect(config.appId).toBe("123456789012345");
      expect(config.appSecret).toBe("test-app-secret");
      expect(config.redirectUri).toBe(
        "https://dashboard.example.com/api/auth/meta/callback",
      );
    });

    it("should throw if required environment variables are missing", async () => {
      vi.stubEnv("META_APP_ID", "");

      const { getConfig } = await import("@/lib/meta");

      expect(() => getConfig()).toThrow("META_APP_ID");
    });
  });

  describe("calculateTokenExpiry", () => {
    it("should calculate expiry date from expires_in seconds", async () => {
      const { calculateTokenExpiry } = await import("@/lib/meta");

      const now = new Date();
      const expiry = calculateTokenExpiry(5184000); // 60 days

      // Should be approximately 60 days from now (allow 1 second tolerance)
      const expectedTime = now.getTime() + 5184000 * 1000;
      expect(Math.abs(expiry.getTime() - expectedTime)).toBeLessThan(1000);
    });
  });

  describe("GRAPH_API_VERSION", () => {
    it("should export the Graph API version constant", async () => {
      const { GRAPH_API_VERSION } = await import("@/lib/meta");

      expect(GRAPH_API_VERSION).toBe("v18.0");
    });
  });
});
