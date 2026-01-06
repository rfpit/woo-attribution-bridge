/**
 * Database wrapper providing Prisma-like API for Drizzle
 *
 * This provides a familiar API for database operations while using Drizzle under the hood.
 */

import { db as drizzleDb } from "@/db";
import {
  stores,
  storeIntegrations,
  attributions,
  conversionLogs,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

type StoreInsert = typeof stores.$inferInsert;
type StoreSelect = typeof stores.$inferSelect;
type IntegrationSelect = typeof storeIntegrations.$inferSelect;
type AttributionInsert = typeof attributions.$inferInsert;
type ConversionLogInsert = typeof conversionLogs.$inferInsert;

export const db = {
  store: {
    /**
     * Find first matching store
     */
    async findFirst(options: {
      where: {
        domain?: string;
        platform?: string;
        userId?: string;
      };
    }): Promise<(StoreSelect & { integrations?: IntegrationSelect[] }) | null> {
      const conditions = [];

      if (options.where.domain) {
        conditions.push(eq(stores.domain, options.where.domain));
      }
      if (options.where.platform) {
        conditions.push(eq(stores.platform, options.where.platform));
      }
      if (options.where.userId) {
        conditions.push(eq(stores.userId, options.where.userId));
      }

      if (conditions.length === 0) {
        return null;
      }

      const result = await drizzleDb
        .select()
        .from(stores)
        .where(and(...conditions))
        .limit(1);

      return result[0] || null;
    },

    /**
     * Find unique store by ID
     */
    async findUnique(options: {
      where: { id: string };
      include?: { integrations?: boolean };
    }): Promise<(StoreSelect & { integrations?: IntegrationSelect[] }) | null> {
      const result = await drizzleDb
        .select()
        .from(stores)
        .where(eq(stores.id, options.where.id))
        .limit(1);

      const store = result[0];
      if (!store) {
        return null;
      }

      if (options.include?.integrations) {
        const integs = await drizzleDb
          .select()
          .from(storeIntegrations)
          .where(eq(storeIntegrations.storeId, store.id));

        return { ...store, integrations: integs };
      }

      return store;
    },

    /**
     * Create a new store
     */
    async create(options: { data: StoreInsert }): Promise<StoreSelect> {
      const result = await drizzleDb
        .insert(stores)
        .values(options.data)
        .returning();

      return result[0];
    },

    /**
     * Update a store
     */
    async update(options: {
      where: { id: string };
      data: Partial<StoreInsert>;
    }): Promise<StoreSelect> {
      const result = await drizzleDb
        .update(stores)
        .set(options.data)
        .where(eq(stores.id, options.where.id))
        .returning();

      return result[0];
    },

    /**
     * Update many stores
     */
    async updateMany(options: {
      where: {
        domain?: string;
        platform?: string;
      };
      data: Partial<StoreInsert>;
    }): Promise<{ count: number }> {
      const conditions = [];

      if (options.where.domain) {
        conditions.push(eq(stores.domain, options.where.domain));
      }
      if (options.where.platform) {
        conditions.push(eq(stores.platform, options.where.platform));
      }

      if (conditions.length === 0) {
        return { count: 0 };
      }

      const result = await drizzleDb
        .update(stores)
        .set(options.data)
        .where(and(...conditions))
        .returning();

      return { count: result.length };
    },
  },

  attribution: {
    /**
     * Create attribution record
     */
    async create(options: {
      data: Omit<AttributionInsert, "id">;
    }): Promise<typeof attributions.$inferSelect> {
      const result = await drizzleDb
        .insert(attributions)
        .values(options.data)
        .returning();

      return result[0];
    },

    /**
     * Update many attribution records
     */
    async updateMany(options: {
      where: {
        storeId?: string;
        orderId?: string;
      };
      data: Partial<AttributionInsert>;
    }): Promise<{ count: number }> {
      const conditions = [];

      if (options.where.storeId) {
        conditions.push(eq(attributions.storeId, options.where.storeId));
      }
      if (options.where.orderId) {
        conditions.push(eq(attributions.orderId, options.where.orderId));
      }

      if (conditions.length === 0) {
        return { count: 0 };
      }

      const result = await drizzleDb
        .update(attributions)
        .set(options.data)
        .where(and(...conditions))
        .returning();

      return { count: result.length };
    },
  },

  conversionLog: {
    /**
     * Create conversion log
     */
    async create(options: {
      data: Omit<ConversionLogInsert, "id">;
    }): Promise<typeof conversionLogs.$inferSelect> {
      const result = await drizzleDb
        .insert(conversionLogs)
        .values(options.data)
        .returning();

      return result[0];
    },
  },
};

// Re-export the raw Drizzle instance for advanced queries
export { drizzleDb };
