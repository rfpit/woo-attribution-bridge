import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Tests for TikTok Marketing API helpers (TDD - written before implementation)

describe("TikTok Marketing API Helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    // Set up required environment variables
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

  describe("MARKETING_API_VERSION", () => {
    it("should export the TikTok Marketing API version", async () => {
      const { MARKETING_API_VERSION } = await import("@/lib/tiktok");
      expect(MARKETING_API_VERSION).toBe("v1.3");
    });
  });

  describe("getConfig", () => {
    it("should return configuration from environment variables", async () => {
      const { getConfig } = await import("@/lib/tiktok");

      const config = getConfig();

      expect(config.appId).toBe("7012345678901234567");
      expect(config.appSecret).toBe("test-app-secret");
      expect(config.redirectUri).toBe(
        "https://dashboard.example.com/api/auth/tiktok/callback",
      );
    });

    it("should throw if TIKTOK_APP_ID is missing", async () => {
      vi.stubEnv("TIKTOK_APP_ID", "");

      const { getConfig } = await import("@/lib/tiktok");

      expect(() => getConfig()).toThrow("TIKTOK_APP_ID");
    });

    it("should throw if TIKTOK_APP_SECRET is missing", async () => {
      vi.stubEnv("TIKTOK_APP_SECRET", "");

      const { getConfig } = await import("@/lib/tiktok");

      expect(() => getConfig()).toThrow("TIKTOK_APP_SECRET");
    });

    it("should throw if TIKTOK_REDIRECT_URI is missing", async () => {
      vi.stubEnv("TIKTOK_REDIRECT_URI", "");

      const { getConfig } = await import("@/lib/tiktok");

      expect(() => getConfig()).toThrow("TIKTOK_REDIRECT_URI");
    });
  });

  describe("buildAuthUrl", () => {
    it("should generate correct TikTok OAuth URL with all required parameters", async () => {
      const { buildAuthUrl } = await import("@/lib/tiktok");

      const state = "random-state-token";
      const url = buildAuthUrl(state);

      expect(url).toContain("https://ads.tiktok.com/marketing_api/auth");
      expect(url).toContain("app_id=7012345678901234567");
      expect(url).toContain(
        "redirect_uri=https%3A%2F%2Fdashboard.example.com%2Fapi%2Fauth%2Ftiktok%2Fcallback",
      );
      expect(url).toContain(`state=${state}`);
    });

    it("should URL-encode the state parameter", async () => {
      const { buildAuthUrl } = await import("@/lib/tiktok");

      const state = "state with spaces & special=chars";
      const url = buildAuthUrl(state);

      expect(url).toContain(
        "state=state%20with%20spaces%20%26%20special%3Dchars",
      );
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("should exchange auth code for access and refresh tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 0,
            message: "OK",
            data: {
              access_token: "test-access-token",
              refresh_token: "test-refresh-token",
              access_token_expire_in: 86400, // 24 hours
              refresh_token_expire_in: 31536000, // 1 year
              open_id: "test-open-id",
              advertiser_ids: ["7012345678901234567", "7098765432109876543"],
              scope: ["advertiser_management", "campaign_management"],
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForTokens } = await import("@/lib/tiktok");

      const result = await exchangeCodeForTokens("test-auth-code");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      expect(result.accessToken).toBe("test-access-token");
      expect(result.refreshToken).toBe("test-refresh-token");
      expect(result.accessTokenExpiresIn).toBe(86400);
      expect(result.refreshTokenExpiresIn).toBe(31536000);
      expect(result.advertiserIds).toEqual([
        "7012345678901234567",
        "7098765432109876543",
      ]);
    });

    it("should throw error on failed token exchange", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 40001,
            message: "Invalid auth code",
            data: null,
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForTokens } = await import("@/lib/tiktok");

      await expect(exchangeCodeForTokens("invalid-code")).rejects.toThrow(
        "Token exchange failed",
      );
    });

    it("should throw error on network failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForTokens } = await import("@/lib/tiktok");

      await expect(exchangeCodeForTokens("test-code")).rejects.toThrow();
    });
  });

  describe("refreshAccessToken", () => {
    it("should refresh tokens and return new tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 0,
            message: "OK",
            data: {
              access_token: "new-access-token",
              refresh_token: "new-refresh-token", // TikTok rotates refresh tokens
              access_token_expire_in: 86400,
              refresh_token_expire_in: 31536000,
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { refreshAccessToken } = await import("@/lib/tiktok");

      const result = await refreshAccessToken("old-refresh-token");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://business-api.tiktok.com/open_api/v1.3/oauth2/refresh_token/",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      // Verify request body
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.refresh_token).toBe("old-refresh-token");
      expect(callBody.app_id).toBe("7012345678901234567");
      expect(callBody.secret).toBe("test-app-secret");

      expect(result.accessToken).toBe("new-access-token");
      expect(result.refreshToken).toBe("new-refresh-token");
      expect(result.accessTokenExpiresIn).toBe(86400);
    });

    it("should throw error when refresh token is expired", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 40104,
            message: "Refresh token expired",
            data: null,
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { refreshAccessToken } = await import("@/lib/tiktok");

      await expect(refreshAccessToken("expired-token")).rejects.toThrow(
        "Refresh token expired",
      );
    });

    it("should throw error when refresh token is invalid", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 40002,
            message: "Unauthorized",
            data: null,
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { refreshAccessToken } = await import("@/lib/tiktok");

      await expect(refreshAccessToken("invalid-token")).rejects.toThrow();
    });
  });

  describe("fetchAdvertiserInfo", () => {
    it("should fetch advertiser details for given IDs", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 0,
            message: "OK",
            data: {
              list: [
                {
                  advertiser_id: "7012345678901234567",
                  advertiser_name: "Test Advertiser 1",
                  currency: "GBP",
                  timezone: "Europe/London",
                  status: "STATUS_ENABLE",
                  company: "Test Company",
                },
                {
                  advertiser_id: "7098765432109876543",
                  advertiser_name: "Test Advertiser 2",
                  currency: "USD",
                  timezone: "America/New_York",
                  status: "STATUS_ENABLE",
                  company: "Test Company 2",
                },
              ],
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAdvertiserInfo } = await import("@/lib/tiktok");

      const advertisers = await fetchAdvertiserInfo("test-access-token", [
        "7012345678901234567",
        "7098765432109876543",
      ]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          "https://business-api.tiktok.com/open_api/v1.3/advertiser/info/",
        ),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "Access-Token": "test-access-token",
          }),
        }),
      );

      expect(advertisers).toHaveLength(2);
      expect(advertisers[0].advertiserId).toBe("7012345678901234567");
      expect(advertisers[0].name).toBe("Test Advertiser 1");
      expect(advertisers[0].currency).toBe("GBP");
      expect(advertisers[0].timezone).toBe("Europe/London");
      expect(advertisers[1].advertiserId).toBe("7098765432109876543");
    });

    it("should filter out disabled advertisers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 0,
            message: "OK",
            data: {
              list: [
                {
                  advertiser_id: "111",
                  advertiser_name: "Active Account",
                  currency: "GBP",
                  timezone: "Europe/London",
                  status: "STATUS_ENABLE",
                  company: "Test",
                },
                {
                  advertiser_id: "222",
                  advertiser_name: "Disabled Account",
                  currency: "USD",
                  timezone: "America/New_York",
                  status: "STATUS_DISABLE",
                  company: "Test",
                },
              ],
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAdvertiserInfo } = await import("@/lib/tiktok");

      const advertisers = await fetchAdvertiserInfo("test-token", [
        "111",
        "222",
      ]);

      // Should only return active advertisers
      expect(advertisers).toHaveLength(1);
      expect(advertisers[0].advertiserId).toBe("111");
    });

    it("should throw error on API failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 40100,
            message: "Access token expired",
            data: null,
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAdvertiserInfo } = await import("@/lib/tiktok");

      await expect(
        fetchAdvertiserInfo("expired-token", ["111"]),
      ).rejects.toThrow();
    });
  });

  describe("revokeToken", () => {
    it("should revoke an access token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            code: 0,
            message: "OK",
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { revokeToken } = await import("@/lib/tiktok");

      await revokeToken("test-access-token");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://business-api.tiktok.com/open_api/v1.3/oauth2/revoke_token/",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    it("should not throw on revocation failure (token may already be invalid)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      });
      vi.stubGlobal("fetch", mockFetch);

      const { revokeToken } = await import("@/lib/tiktok");

      // Should not throw
      await expect(revokeToken("invalid-token")).resolves.toBeUndefined();
    });
  });

  describe("calculateTokenExpiry", () => {
    it("should calculate expiry date from expires_in seconds", async () => {
      const { calculateTokenExpiry } = await import("@/lib/tiktok");

      const now = new Date();
      const expiry = calculateTokenExpiry(86400); // 24 hours

      // Should be approximately 24 hours from now (allow 1 second tolerance)
      const expectedTime = now.getTime() + 86400 * 1000;
      expect(Math.abs(expiry.getTime() - expectedTime)).toBeLessThan(1000);
    });
  });

  describe("isRefreshTokenExpiredError", () => {
    it("should return true for error code 40104", async () => {
      const { isRefreshTokenExpiredError } = await import("@/lib/tiktok");

      expect(isRefreshTokenExpiredError(40104)).toBe(true);
    });

    it("should return false for other error codes", async () => {
      const { isRefreshTokenExpiredError } = await import("@/lib/tiktok");

      expect(isRefreshTokenExpiredError(40001)).toBe(false);
      expect(isRefreshTokenExpiredError(40100)).toBe(false);
      expect(isRefreshTokenExpiredError(0)).toBe(false);
    });
  });
});
