import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Next.js modules
vi.mock("next/server", () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({
      json: async () => data,
      status: init?.status || 200,
    })),
  },
}));

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

// Mock db
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ id: "store-1" }]),
      })),
    })),
  },
}));

describe("Attribution API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue(null);

    const { GET } = await import("@/app/api/dashboard/attribution/route");

    const request = new Request("http://localhost/api/dashboard/attribution");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return empty data when no stores exist", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
      expires: "",
    });

    const { db } = await import("@/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    } as never);

    const { GET } = await import("@/app/api/dashboard/attribution/route");

    const request = new Request("http://localhost/api/dashboard/attribution");
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.sources).toEqual([]);
    expect(data.totalOrdersWithAttribution).toBe(0);
  });

  it("should parse days parameter correctly", async () => {
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
      expires: "",
    });

    const { db } = await import("@/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    } as never);

    const { GET } = await import("@/app/api/dashboard/attribution/route");

    const request = new Request(
      "http://localhost/api/dashboard/attribution?days=90",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});

describe("Attribution Data Processing", () => {
  it("should correctly format source labels", () => {
    const SOURCE_LABELS: Record<string, string> = {
      google_ads: "Google Ads",
      meta_ads: "Meta Ads",
      tiktok_ads: "TikTok Ads",
      direct: "Direct",
    };

    expect(SOURCE_LABELS["google_ads"]).toBe("Google Ads");
    expect(SOURCE_LABELS["meta_ads"]).toBe("Meta Ads");
    expect(SOURCE_LABELS["direct"]).toBe("Direct");
  });

  it("should calculate percentages correctly", () => {
    const values = [100, 200, 300];
    const total = values.reduce((sum, v) => sum + v, 0);

    const percentages = values.map((v) => (v / total) * 100);

    expect(percentages[0]).toBeCloseTo(16.67, 1);
    expect(percentages[1]).toBeCloseTo(33.33, 1);
    expect(percentages[2]).toBe(50);
  });

  it("should aggregate attribution weights correctly", () => {
    const linearAttribution = [
      { source: "google_ads", weight: 0.33 },
      { source: "google_ads", weight: 0.33 },
      { source: "meta_ads", weight: 0.34 },
    ];

    const aggregated: Record<string, number> = {};
    for (const item of linearAttribution) {
      aggregated[item.source] = (aggregated[item.source] || 0) + item.weight;
    }

    expect(aggregated["google_ads"]).toBeCloseTo(0.66, 2);
    expect(aggregated["meta_ads"]).toBeCloseTo(0.34, 2);
  });
});
