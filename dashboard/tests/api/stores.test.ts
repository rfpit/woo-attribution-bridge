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
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { GET, POST } from "@/app/api/stores/route";
import { auth } from "@/lib/auth";
import { db } from "@/db";

describe("Stores API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/stores", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns empty stores array when user has no stores", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stores).toEqual([]);
    });

    it("returns user stores when authenticated", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const mockStores = [
        {
          id: "store-1",
          name: "Test Store",
          url: "https://test.com",
          platform: "woocommerce",
          status: "active",
          lastSyncAt: null,
          createdAt: new Date(),
        },
      ];

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockStores),
          }),
        }),
      } as ReturnType<typeof db.select>);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.stores).toHaveLength(1);
      expect(data.stores[0].name).toBe("Test Store");
    });
  });

  describe("POST /api/stores", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const request = new NextRequest("http://localhost/api/stores", {
        method: "POST",
        body: JSON.stringify({ name: "Test", url: "https://test.com" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 400 for invalid data", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const request = new NextRequest("http://localhost/api/stores", {
        method: "POST",
        body: JSON.stringify({ name: "", url: "invalid" }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBeTruthy();
    });

    it("creates store successfully", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Mock existing check
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      // Mock insert
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "new-store-id",
              name: "Test Store",
              url: "https://test.com",
              platform: "woocommerce",
              status: "pending",
              apiKey: "wab_test123",
              createdAt: new Date(),
            },
          ]),
        }),
      } as ReturnType<typeof db.insert>);

      const request = new NextRequest("http://localhost/api/stores", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Store",
          url: "https://test.com",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.store.name).toBe("Test Store");
      expect(data.store.apiKey).toBeTruthy();
    });

    it("returns 409 for duplicate store URL", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      // Mock existing store found
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi
              .fn()
              .mockResolvedValue([{ id: "existing", userId: "test-user-id" }]),
          }),
        }),
      } as ReturnType<typeof db.select>);

      const request = new NextRequest("http://localhost/api/stores", {
        method: "POST",
        body: JSON.stringify({
          name: "Test Store",
          url: "https://test.com",
        }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data.error).toBe("This store is already connected");
    });
  });
});
