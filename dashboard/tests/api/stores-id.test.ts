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
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { GET, PATCH, DELETE, POST } from "@/app/api/stores/[id]/route";
import { auth } from "@/lib/auth";
import { db } from "@/db";

describe("Stores [id] API - WAB-D-001", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createRequest = (method: string, body?: object) => {
    return new NextRequest(`http://localhost/api/stores/store-id`, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  const createParams = (id: string = "store-id") => ({
    params: Promise.resolve({ id }),
  });

  describe("GET /api/stores/[id]", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const response = await GET(createRequest("GET"), createParams());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 404 when store not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as ReturnType<typeof db.select>);

      const response = await GET(createRequest("GET"), createParams());
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Store not found");
    });

    it("returns store when found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const mockStore = {
        id: "store-id",
        name: "Test Store",
        url: "https://example.com",
        platform: "woocommerce",
        status: "active",
        lastSyncAt: new Date(),
        createdAt: new Date(),
      };

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockStore]),
        }),
      } as ReturnType<typeof db.select>);

      const response = await GET(createRequest("GET"), createParams());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.store.id).toBe("store-id");
      expect(data.store.name).toBe("Test Store");
    });
  });

  describe("PATCH /api/stores/[id]", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const response = await PATCH(
        createRequest("PATCH", { name: "New Name" }),
        createParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 400 for invalid status", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      const response = await PATCH(
        createRequest("PATCH", { status: "invalid" }),
        createParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(400);
    });

    it("returns 404 when store not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as ReturnType<typeof db.select>);

      const response = await PATCH(
        createRequest("PATCH", { name: "New Name" }),
        createParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Store not found");
    });

    it("updates store name successfully", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ id: "store-id", userId: "test-user-id" }]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "store-id",
                name: "Updated Name",
                url: "https://example.com",
                platform: "woocommerce",
                status: "active",
                lastSyncAt: null,
                createdAt: new Date(),
              },
            ]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const response = await PATCH(
        createRequest("PATCH", { name: "Updated Name" }),
        createParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.store.name).toBe("Updated Name");
    });

    it("updates store status successfully", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ id: "store-id", userId: "test-user-id" }]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: "store-id",
                name: "Test Store",
                url: "https://example.com",
                platform: "woocommerce",
                status: "paused",
                lastSyncAt: null,
                createdAt: new Date(),
              },
            ]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const response = await PATCH(
        createRequest("PATCH", { status: "paused" }),
        createParams(),
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.store.status).toBe("paused");
    });
  });

  describe("DELETE /api/stores/[id]", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const response = await DELETE(createRequest("DELETE"), createParams());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 404 when store not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as ReturnType<typeof db.select>);

      const response = await DELETE(createRequest("DELETE"), createParams());
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Store not found");
    });

    it("deletes store successfully", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ id: "store-id", userId: "test-user-id" }]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as unknown as ReturnType<typeof db.delete>);

      const response = await DELETE(createRequest("DELETE"), createParams());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toBe("Store deleted successfully");
    });
  });

  describe("POST /api/stores/[id] (Regenerate Key)", () => {
    it("returns 401 when not authenticated", async () => {
      vi.mocked(auth).mockResolvedValue(null);

      const response = await POST(createRequest("POST"), createParams());
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 404 when store not found", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as ReturnType<typeof db.select>);

      const response = await POST(createRequest("POST"), createParams());
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe("Store not found");
    });

    it("regenerates API key successfully", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ id: "store-id", userId: "test-user-id" }]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const response = await POST(createRequest("POST"), createParams());
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.apiKey).toMatch(/^wab_/);
      expect(data.message).toContain("API key regenerated");
    });

    it("generates API key with correct format", async () => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: "test-user-id", email: "test@example.com" },
        expires: "2099-01-01",
      });

      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ id: "store-id", userId: "test-user-id" }]),
        }),
      } as ReturnType<typeof db.select>);

      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      } as unknown as ReturnType<typeof db.update>);

      const response = await POST(createRequest("POST"), createParams());
      const data = await response.json();

      // API key should be wab_ prefix + 32 chars (24 bytes base64url encoded)
      expect(data.apiKey).toMatch(/^wab_[A-Za-z0-9_-]{32}$/);
    });
  });
});
