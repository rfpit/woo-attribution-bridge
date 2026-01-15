# WAB-D-005 Identity Resolution

> **Status:** Implemented
> **Author:** Claude
> **Created:** 2026-01-14
> **Updated:** 2026-01-14

## 1. Overview

### 1.1 Purpose
Identity Resolution enables cross-device customer tracking by linking multiple visitor sessions to a single customer identity via email hash. It provides customer journey visualization, device graph analysis, and per-customer attribution insights.

### 1.2 Scope
**Covers:**
- Customer lookup by email (client-side hashed)
- Cross-device identity graph visualization
- Customer journey timeline
- Per-customer attribution analysis
- Device and channel distribution insights

**Does NOT cover:**
- Aggregate identity statistics (see WAB-D-004)
- Real-time identity stitching (done by plugin)
- Probabilistic matching (uses deterministic email hash)

### 1.3 Dependencies
- NextAuth.js for authentication
- Plugin REST API (WAB-P-007) for identity data
- Drizzle ORM for store lookup
- Recharts for data visualization

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Search customers by email address | Must |
| FR-002 | Hash email client-side for privacy | Must |
| FR-003 | Validate email hash format (64 hex chars) | Must |
| FR-004 | Display linked visitor identities | Must |
| FR-005 | Show device types for each visitor | Must |
| FR-006 | Display customer journey timeline | Must |
| FR-007 | Show channel and source for each touchpoint | Must |
| FR-008 | Calculate per-customer attribution models | Must |
| FR-009 | Display device usage distribution | Should |
| FR-010 | Display channel distribution | Should |
| FR-011 | Show journey duration in days | Should |
| FR-012 | Proxy requests through dashboard (not direct to plugin) | Must |
| FR-013 | Handle customers with no identity data | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Query response time < 1s | P95 |
| NFR-002 | Email never transmitted in plaintext | 100% |
| NFR-003 | UI responsive across screen sizes | Mobile + Desktop |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dashboard UI   │────▶│  Identity API   │────▶│  WooCommerce    │
│  (React)        │     │  (Next.js)      │     │  Plugin API     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
       │                        │                        │
       │                        ▼                        ▼
       │                 ┌─────────────────┐     ┌─────────────────┐
       │                 │  stores table   │     │  wp_wab_visitors│
       │                 │  (store URL)    │     │  wp_wab_identity│
       └─────────────────┴─────────────────┘     └─────────────────┘
         SHA-256 hash
         (client-side)
```

### 3.2 Data Flow

```
1. User enters email in search form
2. Client-side SHA-256 hash computed
3. Dashboard API receives hash (never plaintext email)
4. API fetches user's store from database
5. API proxies request to plugin endpoint
6. Plugin returns identity graph + journey + attribution
7. Dashboard renders visualization
```

### 3.3 Data Structures

```typescript
// API Response from plugin
interface IdentityResponse {
  email_hash: string;
  identity: {
    email_hash: string;
    visitors: Array<{
      visitor_id: string;
      device_type: string;      // "desktop" | "mobile" | "tablet" | "unknown"
      first_seen: string;       // ISO 8601
      last_seen: string;        // ISO 8601
    }>;
    device_count: number;
    visitor_count: number;
  };
  journey: Array<{
    id: string;
    visitor_id: string;
    source: string;             // utm_source or detected source
    medium: string;             // utm_medium or detected medium
    campaign: string;           // utm_campaign
    click_id_type: string;      // "gclid" | "fbclid" | "ttclid" | null
    created_at: string;         // ISO 8601
    identity_device: string;    // Device type at this touchpoint
  }>;
  attribution: {
    first_touch: Record<string, number>;   // source -> weight (0-1)
    last_touch: Record<string, number>;
    linear: Record<string, number>;
    position_based: Record<string, number>;
  };
  insights: {
    first_touch_date: string;
    last_touch_date: string;
    total_touchpoints: number;
    devices_used: Record<string, number>;   // device_type -> count
    channels_used: Record<string, number>;  // channel -> count
    journey_duration_days: number;
    visitor_count: number;
    device_count: number;
  };
  generated_at: string;
}
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/identity/[email_hash]` | Get customer identity data |

---

## 4. Public Interface

### 4.1 Methods

#### `GET /api/dashboard/identity/[email_hash]`

**Description:** Retrieves identity resolution data for a customer by their email hash. Proxies to the store's plugin API.

**Authentication:** Required (NextAuth session)

**Path Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| email_hash | string | SHA-256 hash of lowercase trimmed email (64 hex chars) |

**Returns:**
```json
{
  "email_hash": "abc123...",
  "identity": {
    "email_hash": "abc123...",
    "visitors": [
      {
        "visitor_id": "wab_xyz789...",
        "device_type": "desktop",
        "first_seen": "2026-01-01T10:00:00Z",
        "last_seen": "2026-01-14T15:30:00Z"
      },
      {
        "visitor_id": "wab_abc456...",
        "device_type": "mobile",
        "first_seen": "2026-01-05T08:00:00Z",
        "last_seen": "2026-01-10T12:00:00Z"
      }
    ],
    "device_count": 2,
    "visitor_count": 2
  },
  "journey": [
    {
      "id": "1",
      "visitor_id": "wab_xyz789...",
      "source": "facebook",
      "medium": "cpc",
      "campaign": "winter_sale",
      "click_id_type": "fbclid",
      "created_at": "2026-01-01T10:00:00Z",
      "identity_device": "desktop"
    },
    {
      "id": "2",
      "visitor_id": "wab_abc456...",
      "source": "google",
      "medium": "organic",
      "campaign": "",
      "click_id_type": null,
      "created_at": "2026-01-05T08:00:00Z",
      "identity_device": "mobile"
    }
  ],
  "attribution": {
    "first_touch": { "facebook / cpc": 1.0 },
    "last_touch": { "google / organic": 1.0 },
    "linear": { "facebook / cpc": 0.5, "google / organic": 0.5 },
    "position_based": { "facebook / cpc": 0.5, "google / organic": 0.5 }
  },
  "insights": {
    "first_touch_date": "2026-01-01T10:00:00Z",
    "last_touch_date": "2026-01-14T15:30:00Z",
    "total_touchpoints": 2,
    "devices_used": { "desktop": 1, "mobile": 1 },
    "channels_used": { "facebook / cpc": 1, "google / organic": 1 },
    "journey_duration_days": 13,
    "visitor_count": 2,
    "device_count": 2
  },
  "generated_at": "2026-01-14T16:00:00Z"
}
```

**Errors:**
- 400: Invalid email hash format
- 401: Unauthorized
- 404: No stores connected / No identity data found
- 500: Failed to fetch identity data

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| 400 | Invalid email hash format | Hash not 64 hex chars | Use SHA-256 of lowercase email |
| 401 | Unauthorized | Missing/invalid session | Log in |
| 404 | No stores connected | User has no stores | Connect a store |
| 404 | No identity data found | Customer not in database | Customer hasn't converted |
| 500 | Failed to fetch identity data | Plugin API error | Check plugin connection |

### 5.2 Client-Side Email Hashing

```typescript
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

### 5.3 Logging

- **Level:** Error for 5xx, Info for 404
- **Format:** `[Identity API] [Email Hash] [Error details]`
- **Privacy:** Only hash logged, never plaintext email

---

## 6. Security Considerations

- **Email Privacy:** Email hashed client-side before transmission
- **Hash Validation:** Server validates 64-char hex format
- **Authentication:** Requires valid NextAuth session
- **Authorization:** Only returns data from user's stores
- **API Key Auth:** Plugin requests include X-WAB-API-Key header
- **No PII Exposure:** Response uses hashed identifiers only

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_identity_unauthorized | Request without session | Returns 401 |
| test_identity_no_stores | User has no stores | Returns 404 |
| test_identity_invalid_hash | Hash not 64 hex chars | Returns 400 |
| test_identity_hash_uppercase | Hash with uppercase | Returns 400 |
| test_identity_customer_not_found | Customer not in plugin | Returns 404 |
| test_identity_success | Valid request | Returns identity data |
| test_identity_single_device | Customer on one device | Shows 1 visitor |
| test_identity_multi_device | Customer on multiple devices | Shows linked visitors |
| test_identity_journey_order | Journey touchpoints | Chronological order |
| test_identity_attribution_calc | Attribution models | Correct weights |
| test_identity_insights | Insights calculation | Correct aggregates |
| test_identity_api_key_sent | Request to plugin | Includes X-WAB-API-Key |

### 7.2 Integration Tests

- End-to-end identity lookup with real plugin data
- Cross-device stitching verification
- Attribution model accuracy

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `dashboard/src/app/api/dashboard/identity/[email_hash]/route.ts`
  - `dashboard/src/app/dashboard/identity/page.tsx`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `dashboard/src/app/api/dashboard/identity/[email_hash]/route.ts` | Identity API |
| `dashboard/src/app/dashboard/identity/page.tsx` | Identity UI page |
| `dashboard/src/db/schema.ts` | Stores table |

### 8.2 Plugin Endpoint

The dashboard proxies to the plugin's identity endpoint:
```
GET {store_url}/wp-json/wab/v1/identity/{email_hash}
Headers: X-WAB-API-Key: {api_key}
```

### 8.3 UI Components

| Component | Description |
|-----------|-------------|
| Customer Lookup | Email search form with client-side hashing |
| Summary Cards | Device count, touchpoints, journey duration, sessions |
| Customer Journey | Timeline visualization of touchpoints |
| Identity Graph | Linked visitor sessions with device types |
| Channel Distribution | Bar chart of channels by touchpoints |
| Device Usage | Pie chart of device type distribution |
| Cross-Device Attribution | Attribution model comparison cards |

### 8.4 Known Limitations

- Uses first store only (multi-store aggregation not implemented)
- No caching of identity lookups
- Dependent on plugin API availability
- Time decay attribution not displayed in UI
- No export functionality for customer data

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-14 | Initial spec |
