# WAB-D-001 Store Management

> **Status:** Implemented
> **Author:** Claude
> **Created:** 2026-01-14
> **Updated:** 2026-01-14

## 1. Overview

### 1.1 Purpose
Store Management handles the connection between WooCommerce/Shopify stores and the WAB Dashboard. It manages store registration, API key generation, connection status monitoring, and store lifecycle operations.

### 1.2 Scope
**Covers:**
- Store CRUD operations (create, read, update, delete)
- API key generation and regeneration
- Connection testing and status management
- Multi-platform support (WooCommerce, Shopify)

**Does NOT cover:**
- Order ingestion (see WAB-D-002)
- Attribution processing (see WAB-D-003)
- Shopify OAuth flow (separate implementation)

### 1.3 Dependencies
- NextAuth.js for authentication
- Drizzle ORM for database operations
- Zod for validation
- Node.js crypto for API key generation

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Users can create new store connections | Must |
| FR-002 | Each store receives a unique API key on creation | Must |
| FR-003 | API keys use format `wab_{base64url_random}` | Must |
| FR-004 | Users can list all their connected stores | Must |
| FR-005 | Users can view individual store details | Must |
| FR-006 | Users can update store name and status | Must |
| FR-007 | Users can delete store connections | Must |
| FR-008 | Users can regenerate API keys | Must |
| FR-009 | Users can test store connections (sync) | Must |
| FR-010 | Stores have status: pending, active, paused, disconnected | Must |
| FR-011 | Duplicate store URLs for same user are rejected | Should |
| FR-012 | Store connection test calls plugin health endpoint | Must |
| FR-013 | Users can only access their own stores | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | API response time < 200ms for CRUD operations | P95 |
| NFR-002 | Connection test timeout | 10 seconds |
| NFR-003 | API keys must be cryptographically random | 24 bytes entropy |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dashboard UI   │────▶│  API Routes     │────▶│  PostgreSQL     │
│  (React)        │     │  (Next.js)      │     │  (Drizzle)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  WooCommerce    │
                        │  Plugin Health  │
                        │  Endpoint       │
                        └─────────────────┘
```

### 3.2 Data Structures

```typescript
// Store creation schema
const createStoreSchema = z.object({
  name: z.string().min(1, "Store name is required"),
  url: z.string().url("Invalid store URL"),
  platform: z.enum(["woocommerce", "shopify"]).default("woocommerce"),
});

// Store update schema
const updateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(["active", "paused", "pending"]).optional(),
});

// API key format
type ApiKey = `wab_${string}`; // e.g., "wab_abc123xyz..."
```

### 3.3 Database Schema

```sql
CREATE TABLE stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    domain VARCHAR(255),           -- For Shopify: example.myshopify.com
    platform VARCHAR(50) NOT NULL DEFAULT 'woocommerce',
    api_key TEXT,                  -- For WooCommerce
    access_token TEXT,             -- For Shopify OAuth
    currency VARCHAR(10) DEFAULT 'GBP',
    timezone VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    last_sync_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX stores_user_id_idx ON stores(user_id);
CREATE INDEX stores_domain_idx ON stores(domain);
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stores` | List user's stores |
| POST | `/api/stores` | Create new store |
| GET | `/api/stores/[id]` | Get single store |
| PATCH | `/api/stores/[id]` | Update store |
| DELETE | `/api/stores/[id]` | Delete store |
| POST | `/api/stores/[id]` | Regenerate API key |
| POST | `/api/stores/[id]/sync` | Test connection |

---

## 4. Public Interface

### 4.1 Methods

#### `GET /api/stores`

**Description:** Lists all stores belonging to the authenticated user.

**Authentication:** Required (NextAuth session)

**Returns:**
```json
{
  "stores": [
    {
      "id": "uuid",
      "name": "My Store",
      "url": "https://example.com",
      "platform": "woocommerce",
      "status": "active",
      "lastSyncAt": "2026-01-14T12:00:00Z",
      "createdAt": "2026-01-01T00:00:00Z"
    }
  ]
}
```

**Errors:**
- 401: Unauthorized

---

#### `POST /api/stores`

**Description:** Creates a new store connection with auto-generated API key.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "My Store",
  "url": "https://example.com",
  "platform": "woocommerce"
}
```

**Returns:** (201)
```json
{
  "store": {
    "id": "uuid",
    "name": "My Store",
    "url": "https://example.com",
    "platform": "woocommerce",
    "status": "pending",
    "apiKey": "wab_abc123...",
    "createdAt": "2026-01-14T12:00:00Z"
  },
  "message": "Store created. Install the plugin and configure with this API key."
}
```

**Errors:**
- 400: Validation error
- 401: Unauthorized
- 409: Store URL already connected

---

#### `GET /api/stores/[id]`

**Description:** Gets a single store by ID.

**Authentication:** Required (must own store)

**Returns:**
```json
{
  "store": {
    "id": "uuid",
    "name": "My Store",
    "url": "https://example.com",
    "platform": "woocommerce",
    "status": "active",
    "lastSyncAt": "2026-01-14T12:00:00Z",
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

**Errors:**
- 401: Unauthorized
- 404: Store not found

---

#### `PATCH /api/stores/[id]`

**Description:** Updates store name or status.

**Authentication:** Required (must own store)

**Request Body:**
```json
{
  "name": "Updated Name",
  "status": "paused"
}
```

**Returns:**
```json
{
  "store": { /* updated store object */ }
}
```

**Errors:**
- 400: Validation error
- 401: Unauthorized
- 404: Store not found

---

#### `DELETE /api/stores/[id]`

**Description:** Deletes a store and all associated data.

**Authentication:** Required (must own store)

**Returns:**
```json
{
  "message": "Store deleted successfully"
}
```

**Errors:**
- 401: Unauthorized
- 404: Store not found

---

#### `POST /api/stores/[id]` (Regenerate Key)

**Description:** Regenerates the API key for a store.

**Authentication:** Required (must own store)

**Returns:**
```json
{
  "apiKey": "wab_newkey123...",
  "message": "API key regenerated. Update your plugin configuration."
}
```

**Errors:**
- 401: Unauthorized
- 404: Store not found

---

#### `POST /api/stores/[id]/sync`

**Description:** Tests the connection to a store by calling its health endpoint.

**Authentication:** Required (must own store)

**Behavior:**
1. Fetches `{store_url}/wp-json/wab/v1/health` with API key header
2. On success: Updates status to "active", stores currency/timezone
3. On 401/403: Updates status to "disconnected" (API key mismatch)
4. On timeout/error: Returns pending status with message

**Returns:**
```json
{
  "success": true,
  "status": "active",
  "lastSyncAt": "2026-01-14T12:00:00Z",
  "message": "Store connection verified successfully."
}
```

**Errors:**
- 401: Unauthorized
- 404: Store not found
- 500: Internal error

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| 400 | Validation error | Invalid request body | Fix request data |
| 401 | Unauthorized | Missing/invalid session | Log in |
| 404 | Store not found | Store doesn't exist or not owned | Check store ID |
| 409 | Store already connected | Duplicate URL | Use existing store |
| 500 | Failed to [action] store | Server error | Retry or contact support |

### 5.2 Logging

- **Level:** Error for 5xx, Warning for 4xx auth issues
- **Format:** `[Store ID] [Action] [Error details]`
- **Destination:** Console (development), CloudWatch (production)

---

## 6. Security Considerations

- **Authentication:** All endpoints require valid NextAuth session
- **Authorization:** Users can only access/modify their own stores
- **API Keys:** Generated with crypto.randomBytes(24) for 192-bit entropy
- **Key Storage:** API keys stored in database (hashed in future)
- **Connection Test:** Uses X-WAB-API-Key header, 10s timeout
- **Input Validation:** Zod schemas validate all input
- **SQL Injection:** Drizzle ORM prevents SQL injection

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_create_store_success | Create store with valid data | Returns 201 with store and API key |
| test_create_store_invalid_url | Create store with invalid URL | Returns 400 validation error |
| test_create_store_duplicate_url | Create store with existing URL | Returns 409 conflict |
| test_create_store_unauthorized | Create store without session | Returns 401 |
| test_list_stores_success | List user's stores | Returns array of stores |
| test_list_stores_only_own | User only sees own stores | Returns only user's stores |
| test_get_store_success | Get existing store | Returns store object |
| test_get_store_not_found | Get non-existent store | Returns 404 |
| test_get_store_not_owner | Get another user's store | Returns 404 |
| test_update_store_success | Update store name | Returns updated store |
| test_update_store_status | Update store status | Returns updated store |
| test_delete_store_success | Delete existing store | Returns success message |
| test_delete_store_not_owner | Delete another user's store | Returns 404 |
| test_regenerate_key_success | Regenerate API key | Returns new key |
| test_sync_store_success | Sync with reachable store | Returns active status |
| test_sync_store_unreachable | Sync with unreachable store | Returns pending/error |
| test_sync_store_auth_error | Sync with wrong API key | Returns disconnected status |
| test_api_key_format | API key uses correct format | Matches `wab_*` pattern |

### 7.2 Integration Tests

- Full CRUD lifecycle for a store
- Connection test with mock WooCommerce endpoint
- Multi-user isolation verification

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `dashboard/src/app/api/stores/route.ts`
  - `dashboard/src/app/api/stores/[id]/route.ts`
  - `dashboard/src/app/api/stores/[id]/sync/route.ts`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `dashboard/src/app/api/stores/route.ts` | List and create stores |
| `dashboard/src/app/api/stores/[id]/route.ts` | Get, update, delete, regenerate key |
| `dashboard/src/app/api/stores/[id]/sync/route.ts` | Connection testing |
| `dashboard/src/db/schema.ts` | Database schema (stores table) |
| `dashboard/src/app/dashboard/stores/page.tsx` | UI component |

### 8.2 API Key Generation

```typescript
function generateApiKey(): string {
  const prefix = "wab";
  const key = crypto.randomBytes(24).toString("base64url");
  return `${prefix}_${key}`;
}
```

### 8.3 Known Limitations

- API keys are stored in plaintext (should be hashed in production)
- No rate limiting on connection tests
- Shopify OAuth flow is separate from this module

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-14 | Initial spec |
