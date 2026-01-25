import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Tests for Google Ads API helpers (TDD - written before implementation)

describe("Google Ads API Helpers", () => {
  beforeEach(() => {
    vi.resetModules();
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
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("buildAuthUrl", () => {
    it("should generate correct OAuth URL with all required parameters", async () => {
      const { buildAuthUrl } = await import("@/lib/google-ads");

      const state = "random-state-token";
      const url = buildAuthUrl(state);

      expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(url).toContain(
        "client_id=test-client-id.apps.googleusercontent.com",
      );
      expect(url).toContain(
        "redirect_uri=https%3A%2F%2Fdashboard.example.com%2Fapi%2Fauth%2Fgoogle-ads%2Fcallback",
      );
      expect(url).toContain("response_type=code");
      expect(url).toContain(
        "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadwords",
      );
      expect(url).toContain("access_type=offline");
      expect(url).toContain("prompt=consent");
      expect(url).toContain(`state=${state}`);
    });

    it("should URL-encode the state parameter", async () => {
      const { buildAuthUrl } = await import("@/lib/google-ads");

      const state = "state with spaces & special=chars";
      const url = buildAuthUrl(state);

      expect(url).toContain(
        "state=state%20with%20spaces%20%26%20special%3Dchars",
      );
    });
  });

  describe("exchangeCodeForTokens", () => {
    it("should exchange authorization code for tokens", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "ya29.test-access-token",
            refresh_token: "1//test-refresh-token",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "https://www.googleapis.com/auth/adwords",
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForTokens } = await import("@/lib/google-ads");

      const result = await exchangeCodeForTokens("test-auth-code");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }),
      );

      expect(result.accessToken).toBe("ya29.test-access-token");
      expect(result.refreshToken).toBe("1//test-refresh-token");
      expect(result.expiresIn).toBe(3600);
    });

    it("should throw error on failed token exchange", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "invalid_grant",
            error_description: "Code has already been used",
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForTokens } = await import("@/lib/google-ads");

      await expect(exchangeCodeForTokens("used-code")).rejects.toThrow(
        "Token exchange failed",
      );
    });

    it("should handle missing refresh token (re-auth without consent)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "ya29.test-access-token",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "https://www.googleapis.com/auth/adwords",
            // No refresh_token when user already granted access
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { exchangeCodeForTokens } = await import("@/lib/google-ads");

      const result = await exchangeCodeForTokens("test-auth-code");

      expect(result.accessToken).toBe("ya29.test-access-token");
      expect(result.refreshToken).toBeUndefined();
    });
  });

  describe("refreshAccessToken", () => {
    it("should refresh access token using refresh token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "ya29.new-access-token",
            expires_in: 3600,
            token_type: "Bearer",
            scope: "https://www.googleapis.com/auth/adwords",
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { refreshAccessToken } = await import("@/lib/google-ads");

      const result = await refreshAccessToken("1//test-refresh-token");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/token",
        expect.objectContaining({
          method: "POST",
        }),
      );

      const callBody = mockFetch.mock.calls[0][1].body;
      expect(callBody).toContain("grant_type=refresh_token");
      expect(callBody).toContain("refresh_token=1%2F%2Ftest-refresh-token");

      expect(result.accessToken).toBe("ya29.new-access-token");
      expect(result.expiresIn).toBe(3600);
    });

    it("should throw error when refresh token is invalid", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "invalid_grant",
            error_description: "Token has been revoked",
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { refreshAccessToken } = await import("@/lib/google-ads");

      await expect(refreshAccessToken("revoked-token")).rejects.toThrow(
        "Token refresh failed",
      );
    });
  });

  describe("fetchAccessibleCustomers", () => {
    it("should fetch list of accessible Google Ads customer IDs", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            resourceNames: ["customers/1234567890", "customers/0987654321"],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAccessibleCustomers } = await import("@/lib/google-ads");

      const customers = await fetchAccessibleCustomers("ya29.test-token");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://googleads.googleapis.com/v15/customers:listAccessibleCustomers",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer ya29.test-token",
            "developer-token": "test-developer-token",
          }),
        }),
      );

      expect(customers).toEqual(["1234567890", "0987654321"]);
    });

    it("should return empty array when no customers found", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            resourceNames: [],
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAccessibleCustomers } = await import("@/lib/google-ads");

      const customers = await fetchAccessibleCustomers("ya29.test-token");

      expect(customers).toEqual([]);
    });

    it("should throw error on API failure", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            error: {
              code: 401,
              message: "Request had invalid authentication credentials",
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchAccessibleCustomers } = await import("@/lib/google-ads");

      await expect(fetchAccessibleCustomers("invalid-token")).rejects.toThrow(
        "Failed to fetch accessible customers",
      );
    });
  });

  describe("fetchCustomerDetails", () => {
    it("should fetch details for a specific customer", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              customer: {
                resourceName: "customers/1234567890",
                id: "1234567890",
                descriptiveName: "My Test Account",
                currencyCode: "GBP",
                timeZone: "Europe/London",
              },
            },
          ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchCustomerDetails } = await import("@/lib/google-ads");

      const details = await fetchCustomerDetails(
        "ya29.test-token",
        "1234567890",
      );

      expect(mockFetch).toHaveBeenCalledWith(
        "https://googleads.googleapis.com/v15/customers/1234567890/googleAds:searchStream",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer ya29.test-token",
            "developer-token": "test-developer-token",
            "login-customer-id": "1234567890",
          }),
        }),
      );

      expect(details.customerId).toBe("1234567890");
      expect(details.name).toBe("My Test Account");
      expect(details.currency).toBe("GBP");
      expect(details.timezone).toBe("Europe/London");
    });

    it("should handle customer without descriptive name", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              customer: {
                resourceName: "customers/1234567890",
                id: "1234567890",
                currencyCode: "USD",
                timeZone: "America/New_York",
              },
            },
          ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchCustomerDetails } = await import("@/lib/google-ads");

      const details = await fetchCustomerDetails(
        "ya29.test-token",
        "1234567890",
      );

      expect(details.customerId).toBe("1234567890");
      expect(details.name).toBeNull();
    });

    it("should support manager account login-customer-id", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              customer: {
                resourceName: "customers/1234567890",
                id: "1234567890",
                descriptiveName: "Client Account",
                currencyCode: "EUR",
                timeZone: "Europe/Paris",
              },
            },
          ]),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchCustomerDetails } = await import("@/lib/google-ads");

      await fetchCustomerDetails("ya29.test-token", "1234567890", "9999999999");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "login-customer-id": "9999999999",
          }),
        }),
      );
    });
  });

  describe("fetchMultipleCustomerDetails", () => {
    it("should fetch details for multiple customers", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                customer: {
                  id: "111",
                  descriptiveName: "Account 1",
                  currencyCode: "GBP",
                  timeZone: "Europe/London",
                },
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                customer: {
                  id: "222",
                  descriptiveName: "Account 2",
                  currencyCode: "USD",
                  timeZone: "America/New_York",
                },
              },
            ]),
        });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchMultipleCustomerDetails } = await import("@/lib/google-ads");

      const details = await fetchMultipleCustomerDetails("ya29.test-token", [
        "111",
        "222",
      ]);

      expect(details).toHaveLength(2);
      expect(details[0].customerId).toBe("111");
      expect(details[1].customerId).toBe("222");
    });

    it("should handle partial failures gracefully", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve([
              {
                customer: {
                  id: "111",
                  descriptiveName: "Account 1",
                  currencyCode: "GBP",
                  timeZone: "Europe/London",
                },
              },
            ]),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: () => Promise.resolve({ error: "Permission denied" }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchMultipleCustomerDetails } = await import("@/lib/google-ads");

      const details = await fetchMultipleCustomerDetails("ya29.test-token", [
        "111",
        "222",
      ]);

      // Should return successful ones only
      expect(details).toHaveLength(1);
      expect(details[0].customerId).toBe("111");
    });
  });

  describe("revokeToken", () => {
    it("should revoke an access token", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
      });
      vi.stubGlobal("fetch", mockFetch);

      const { revokeToken } = await import("@/lib/google-ads");

      await revokeToken("ya29.test-token");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/revoke",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "token=ya29.test-token",
        }),
      );
    });

    it("should not throw on revocation failure (token may already be invalid)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
      });
      vi.stubGlobal("fetch", mockFetch);

      const { revokeToken } = await import("@/lib/google-ads");

      // Should not throw
      await expect(revokeToken("invalid-token")).resolves.toBeUndefined();
    });
  });

  describe("getConfig", () => {
    it("should return configuration from environment variables", async () => {
      const { getConfig } = await import("@/lib/google-ads");

      const config = getConfig();

      expect(config.clientId).toBe("test-client-id.apps.googleusercontent.com");
      expect(config.clientSecret).toBe("test-client-secret");
      expect(config.redirectUri).toBe(
        "https://dashboard.example.com/api/auth/google-ads/callback",
      );
      expect(config.developerToken).toBe("test-developer-token");
    });

    it("should throw if required environment variables are missing", async () => {
      vi.stubEnv("GOOGLE_ADS_CLIENT_ID", "");

      const { getConfig } = await import("@/lib/google-ads");

      expect(() => getConfig()).toThrow("GOOGLE_ADS_CLIENT_ID");
    });
  });

  describe("calculateTokenExpiry", () => {
    it("should calculate expiry date from expires_in seconds", async () => {
      const { calculateTokenExpiry } = await import("@/lib/google-ads");

      const now = new Date();
      const expiry = calculateTokenExpiry(3600); // 1 hour

      // Should be approximately 1 hour from now (allow 1 second tolerance)
      const expectedTime = now.getTime() + 3600 * 1000;
      expect(Math.abs(expiry.getTime() - expectedTime)).toBeLessThan(1000);
    });
  });
});
