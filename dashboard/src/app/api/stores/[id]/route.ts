import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { stores } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import crypto from "crypto";

const updateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "paused", "pending"]).optional(),
});

// GET /api/stores/[id] - Get a single store
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const [store] = await db
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
      .where(and(eq(stores.id, id), eq(stores.userId, session.user.id)));

    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    return NextResponse.json({ store });
  } catch (error) {
    console.error("Get store error:", error);
    return NextResponse.json(
      { error: "Failed to fetch store" },
      { status: 500 },
    );
  }
}

// PATCH /api/stores/[id] - Update a store
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const parsed = updateStoreSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0].message },
        { status: 400 },
      );
    }

    // Verify ownership
    const [existing] = await db
      .select()
      .from(stores)
      .where(and(eq(stores.id, id), eq(stores.userId, session.user.id)));

    if (!existing) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const [updated] = await db
      .update(stores)
      .set({
        ...parsed.data,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, id))
      .returning();

    return NextResponse.json({
      store: {
        id: updated.id,
        name: updated.name,
        url: updated.url,
        platform: updated.platform,
        status: updated.status,
        lastSyncAt: updated.lastSyncAt,
        createdAt: updated.createdAt,
      },
    });
  } catch (error) {
    console.error("Update store error:", error);
    return NextResponse.json(
      { error: "Failed to update store" },
      { status: 500 },
    );
  }
}

// DELETE /api/stores/[id] - Delete a store
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(stores)
      .where(and(eq(stores.id, id), eq(stores.userId, session.user.id)));

    if (!existing) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    await db.delete(stores).where(eq(stores.id, id));

    return NextResponse.json({ message: "Store deleted successfully" });
  } catch (error) {
    console.error("Delete store error:", error);
    return NextResponse.json(
      { error: "Failed to delete store" },
      { status: 500 },
    );
  }
}

// POST /api/stores/[id]/regenerate-key - Regenerate API key
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Verify ownership
    const [existing] = await db
      .select()
      .from(stores)
      .where(and(eq(stores.id, id), eq(stores.userId, session.user.id)));

    if (!existing) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // Generate new API key
    const newApiKey = `wab_${crypto.randomBytes(24).toString("base64url")}`;

    await db
      .update(stores)
      .set({
        apiKey: newApiKey,
        updatedAt: new Date(),
      })
      .where(eq(stores.id, id));

    return NextResponse.json({
      apiKey: newApiKey,
      message: "API key regenerated. Update your plugin configuration.",
    });
  } catch (error) {
    console.error("Regenerate key error:", error);
    return NextResponse.json(
      { error: "Failed to regenerate API key" },
      { status: 500 },
    );
  }
}
