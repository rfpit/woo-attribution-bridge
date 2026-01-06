import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

const createStoreSchema = z.object({
  name: z.string().min(1, "Store name is required"),
  url: z.string().url("Invalid store URL"),
  platform: z.enum(["woocommerce", "shopify"]).default("woocommerce"),
});

// Generate a secure API key
function generateApiKey(): string {
  const prefix = "wab";
  const key = crypto.randomBytes(24).toString("base64url");
  return `${prefix}_${key}`;
}

// GET /api/stores - List user's stores
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userStores = await db
      .select({
        id: stores.id,
        name: stores.name,
        url: stores.url,
        platform: stores.platform,
        status: stores.status,
        lastSyncAt: stores.lastSyncAt,
        createdAt: stores.createdAt,
      })
      .from(stores)
      .where(eq(stores.userId, session.user.id))
      .orderBy(stores.createdAt);

    return NextResponse.json({ stores: userStores });
  } catch (error) {
    console.error("List stores error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stores" },
      { status: 500 },
    );
  }
}

// POST /api/stores - Create a new store connection
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = createStoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    const { name, url, platform } = parsed.data;

    // Check if store URL already exists for this user
    const existing = await db
      .select()
      .from(stores)
      .where(eq(stores.url, url))
      .limit(1);

    if (existing.length > 0 && existing[0].userId === session.user.id) {
      return NextResponse.json(
        { error: "This store is already connected" },
        { status: 409 },
      );
    }

    // Generate API key for the plugin to use
    const apiKey = generateApiKey();

    const [newStore] = await db
      .insert(stores)
      .values({
        userId: session.user.id,
        name,
        url,
        platform,
        apiKey,
        status: "pending",
      })
      .returning();

    return NextResponse.json(
      {
        store: {
          id: newStore.id,
          name: newStore.name,
          url: newStore.url,
          platform: newStore.platform,
          status: newStore.status,
          apiKey: apiKey, // Only returned on creation
          createdAt: newStore.createdAt,
        },
        message:
          "Store created. Install the plugin and configure with this API key.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create store error:", error);
    return NextResponse.json(
      { error: "Failed to create store" },
      { status: 500 },
    );
  }
}
