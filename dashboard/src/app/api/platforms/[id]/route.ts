import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections } from "@/db/schema";
import { eq, and } from "drizzle-orm";

// DELETE /api/platforms/[id] - Disconnect a platform
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
      .from(adPlatformConnections)
      .where(
        and(
          eq(adPlatformConnections.id, id),
          eq(adPlatformConnections.userId, session.user.id),
        ),
      );

    if (!existing) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    await db
      .delete(adPlatformConnections)
      .where(eq(adPlatformConnections.id, id));

    return NextResponse.json({ message: "Platform disconnected successfully" });
  } catch (error) {
    console.error("Delete platform error:", error);
    return NextResponse.json(
      { error: "Failed to disconnect platform" },
      { status: 500 },
    );
  }
}
