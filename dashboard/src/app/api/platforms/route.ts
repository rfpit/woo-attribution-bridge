import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { adPlatformConnections } from "@/db/schema";
import { eq } from "drizzle-orm";

// GET /api/platforms - List user's ad platform connections
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connections = await db
      .select({
        id: adPlatformConnections.id,
        platform: adPlatformConnections.platform,
        accountId: adPlatformConnections.accountId,
        accountName: adPlatformConnections.accountName,
        status: adPlatformConnections.status,
        createdAt: adPlatformConnections.createdAt,
      })
      .from(adPlatformConnections)
      .where(eq(adPlatformConnections.userId, session.user.id))
      .orderBy(adPlatformConnections.createdAt);

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("List platforms error:", error);
    return NextResponse.json(
      { error: "Failed to fetch platforms" },
      { status: 500 },
    );
  }
}
