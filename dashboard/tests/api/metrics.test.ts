import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth before importing route
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock db before importing route
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { GET } from "@/app/api/dashboard/metrics/route";
import { auth } from "@/lib/auth";
import { db } from "@/db";

describe("Metrics API - WAB-D-004", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when session has no user id", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { email: "test@example.com" },
        expires: "2099-01-01",
      } as never);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
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

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("No stores connected");
    });
  });

  describe("Metrics calculation", () => {
    const mockAuthenticatedWithStores = () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        // Call 1: Get user stores
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        // Call 2: Current period orders
        if (callCount === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  total: 1000,
                  count: 10,
                  newCustomers: 5,
                  uniqueCustomers: 8,
                  tracked: 8,
                },
              ]),
            }),
          } as ReturnType<typeof db.select>;
        }
        // Call 3: Previous period orders
        if (callCount === 3) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  total: 800,
                  count: 8,
                  uniqueCustomers: 6,
                  tracked: 6,
                },
              ]),
            }),
          } as ReturnType<typeof db.select>;
        }
        // Call 4: Ad platform connections
        if (callCount === 4) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          } as ReturnType<typeof db.select>;
        }
        // Call 5+: Attributed orders
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as ReturnType<typeof db.select>;
      });
    };

    it("returns revenue with correct total and change percentage", async () => {
      mockAuthenticatedWithStores();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.revenue.total).toBe(1000);
      // Change: (1000 - 800) / 800 * 100 = 25%
      expect(data.revenue.change).toBe(25);
    });

    it("returns order count with correct total and change", async () => {
      mockAuthenticatedWithStores();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.orders.total).toBe(10);
      // Change: (10 - 8) / 8 * 100 = 25%
      expect(data.orders.change).toBe(25);
    });

    it("returns customer metrics with unique and new counts", async () => {
      mockAuthenticatedWithStores();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.customers.total).toBe(8);
      expect(data.customers.newCustomers).toBe(5);
      // Change: (8 - 6) / 6 * 100 = 33.33%
      expect(data.customers.change).toBeCloseTo(33.33, 1);
    });

    it("calculates attribution rate correctly", async () => {
      mockAuthenticatedWithStores();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.attribution.tracked).toBe(8);
      // Rate: 8/10 * 100 = 80%
      expect(data.attribution.rate).toBe(80);
    });

    it("returns 0 ROAS when no ad spend", async () => {
      mockAuthenticatedWithStores();

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.adSpend.total).toBe(0);
      expect(data.adSpend.roas).toBe(0);
    });
  });

  describe("Change calculation edge cases", () => {
    it("returns 100% change when previous was 0 and current > 0", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  total: 500,
                  count: 5,
                  newCustomers: 3,
                  uniqueCustomers: 4,
                  tracked: 4,
                },
              ]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount === 3) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  total: 0,
                  count: 0,
                  uniqueCustomers: 0,
                  tracked: 0,
                },
              ]),
            }),
          } as ReturnType<typeof db.select>;
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as ReturnType<typeof db.select>;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.revenue.change).toBe(100);
      expect(data.orders.change).toBe(100);
    });

    it("returns 0% change when both periods are 0", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount === 2 || callCount === 3) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                {
                  total: 0,
                  count: 0,
                  newCustomers: 0,
                  uniqueCustomers: 0,
                  tracked: 0,
                },
              ]),
            }),
          } as ReturnType<typeof db.select>;
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as ReturnType<typeof db.select>;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.revenue.change).toBe(0);
      expect(data.orders.change).toBe(0);
    });
  });

  describe("Top sources", () => {
    it("detects source from gclid as Google Ads", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue([
                  {
                    total: 100,
                    count: 1,
                    newCustomers: 1,
                    uniqueCustomers: 1,
                    tracked: 1,
                  },
                ]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount === 3) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue([
                  { total: 0, count: 0, uniqueCustomers: 0, tracked: 0 },
                ]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount === 4) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          } as ReturnType<typeof db.select>;
        }
        // Call 5: Attributed orders with gclid
        return {
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValue([
                { attribution: { gclid: "test-gclid" }, total: "100.00" },
              ]),
          }),
        } as ReturnType<typeof db.select>;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.topSources).toHaveLength(1);
      expect(data.topSources[0].source).toBe("Google Ads");
      expect(data.topSources[0].revenue).toBe(100);
    });

    it("detects source from fbclid as Meta Ads", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount <= 4) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue(
                  callCount === 2
                    ? [
                        {
                          total: 100,
                          count: 1,
                          newCustomers: 1,
                          uniqueCustomers: 1,
                          tracked: 1,
                        },
                      ]
                    : callCount === 3
                      ? [{ total: 0, count: 0, uniqueCustomers: 0, tracked: 0 }]
                      : [],
                ),
            }),
          } as ReturnType<typeof db.select>;
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValue([
                { attribution: { fbclid: "test-fbclid" }, total: "200.00" },
              ]),
          }),
        } as ReturnType<typeof db.select>;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.topSources[0].source).toBe("Meta Ads");
    });

    it("detects source from ttclid as TikTok Ads", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount <= 4) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue(
                  callCount === 2
                    ? [
                        {
                          total: 100,
                          count: 1,
                          newCustomers: 1,
                          uniqueCustomers: 1,
                          tracked: 1,
                        },
                      ]
                    : callCount === 3
                      ? [{ total: 0, count: 0, uniqueCustomers: 0, tracked: 0 }]
                      : [],
                ),
            }),
          } as ReturnType<typeof db.select>;
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi
              .fn()
              .mockResolvedValue([
                { attribution: { ttclid: "test-ttclid" }, total: "150.00" },
              ]),
          }),
        } as ReturnType<typeof db.select>;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.topSources[0].source).toBe("TikTok Ads");
    });

    it("sorts top sources by revenue descending", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount <= 4) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue(
                  callCount === 2
                    ? [
                        {
                          total: 300,
                          count: 3,
                          newCustomers: 2,
                          uniqueCustomers: 3,
                          tracked: 3,
                        },
                      ]
                    : callCount === 3
                      ? [{ total: 0, count: 0, uniqueCustomers: 0, tracked: 0 }]
                      : [],
                ),
            }),
          } as ReturnType<typeof db.select>;
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { attribution: { gclid: "g1" }, total: "50.00" },
              { attribution: { fbclid: "f1" }, total: "150.00" },
              { attribution: { ttclid: "t1" }, total: "100.00" },
            ]),
          }),
        } as ReturnType<typeof db.select>;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.topSources[0].source).toBe("Meta Ads");
      expect(data.topSources[0].revenue).toBe(150);
      expect(data.topSources[1].source).toBe("TikTok Ads");
      expect(data.topSources[1].revenue).toBe(100);
      expect(data.topSources[2].source).toBe("Google Ads");
      expect(data.topSources[2].revenue).toBe(50);
    });

    it("limits top sources to 5", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount <= 4) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue(
                  callCount === 2
                    ? [
                        {
                          total: 600,
                          count: 6,
                          newCustomers: 4,
                          uniqueCustomers: 5,
                          tracked: 6,
                        },
                      ]
                    : callCount === 3
                      ? [{ total: 0, count: 0, uniqueCustomers: 0, tracked: 0 }]
                      : [],
                ),
            }),
          } as ReturnType<typeof db.select>;
        }
        // Return 7 different sources
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              { attribution: { source: "Source1" }, total: "100.00" },
              { attribution: { source: "Source2" }, total: "90.00" },
              { attribution: { source: "Source3" }, total: "80.00" },
              { attribution: { source: "Source4" }, total: "70.00" },
              { attribution: { source: "Source5" }, total: "60.00" },
              { attribution: { source: "Source6" }, total: "50.00" },
              { attribution: { source: "Source7" }, total: "40.00" },
            ]),
          }),
        } as ReturnType<typeof db.select>;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.topSources).toHaveLength(5);
      expect(data.topSources[0].source).toBe("Source1");
      expect(data.topSources[4].source).toBe("Source5");
    });
  });

  describe("Response structure", () => {
    it("returns all required fields in response", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      let callCount = 0;
      vi.mocked(db.select).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ id: "store-1" }]),
            }),
          } as ReturnType<typeof db.select>;
        }
        if (callCount === 2) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi
                .fn()
                .mockResolvedValue([
                  {
                    total: 100,
                    count: 5,
                    newCustomers: 2,
                    uniqueCustomers: 4,
                    tracked: 4,
                  },
                ]),
            }),
          } as ReturnType<typeof db.select>;
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        } as ReturnType<typeof db.select>;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);

      // Check revenue structure
      expect(data.revenue).toHaveProperty("total");
      expect(data.revenue).toHaveProperty("change");

      // Check orders structure
      expect(data.orders).toHaveProperty("total");
      expect(data.orders).toHaveProperty("change");

      // Check customers structure
      expect(data.customers).toHaveProperty("total");
      expect(data.customers).toHaveProperty("newCustomers");
      expect(data.customers).toHaveProperty("change");

      // Check attribution structure
      expect(data.attribution).toHaveProperty("tracked");
      expect(data.attribution).toHaveProperty("rate");
      expect(data.attribution).toHaveProperty("change");

      // Check adSpend structure
      expect(data.adSpend).toHaveProperty("total");
      expect(data.adSpend).toHaveProperty("roas");
      expect(data.adSpend).toHaveProperty("change");

      // Check topSources is array
      expect(Array.isArray(data.topSources)).toBe(true);
    });
  });
});
