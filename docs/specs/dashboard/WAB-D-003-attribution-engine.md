# WAB-D-003 Attribution Engine

> **Status:** Implemented
> **Author:** Claude
> **Created:** 2026-01-14
> **Updated:** 2026-01-14

## 1. Overview

### 1.1 Purpose
The Attribution Engine analyzes order data to attribute revenue to marketing sources using multiple attribution models. It provides insights into which channels drive conversions and how credit should be distributed across touchpoints.

### 1.2 Scope
**Covers:**
- Multi-touch attribution model calculations
- Source-level revenue breakdown
- Touchpoint distribution analysis
- Time-based filtering

**Does NOT cover:**
- Ad spend correlation (see WAB-D-004)
- Real-time attribution (uses stored data)
- External API calls to ad platforms

### 1.3 Dependencies
- Drizzle ORM for database queries
- date-fns for date calculations
- Orders with attribution data from WAB-D-002

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Support First Touch attribution model | Must |
| FR-002 | Support Last Touch attribution model | Must |
| FR-003 | Support Linear attribution model | Must |
| FR-004 | Support Position-Based attribution model | Must |
| FR-005 | Support Time Decay attribution model | Should |
| FR-006 | Filter attribution data by date range | Must |
| FR-007 | Aggregate revenue by source across models | Must |
| FR-008 | Calculate touchpoint distribution | Must |
| FR-009 | Calculate average touchpoints per conversion | Must |
| FR-010 | Return data only for authenticated user's stores | Must |
| FR-011 | Handle orders with null attribution gracefully | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Query response time < 1s | P95 |
| NFR-002 | Support up to 100,000 orders | Per query |
| NFR-003 | Efficient aggregation in memory | O(n) |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dashboard UI   │────▶│  Attribution    │────▶│  PostgreSQL     │
│  (Charts)       │     │  API Route      │     │  (orders table) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  In-Memory      │
                        │  Aggregation    │
                        └─────────────────┘
```

### 3.2 Attribution Models

#### First Touch (100% to first interaction)
```
Touchpoints: [A] → [B] → [C] → Conversion
Credit:       100%   0%    0%
```

#### Last Touch (100% to last interaction)
```
Touchpoints: [A] → [B] → [C] → Conversion
Credit:        0%   0%  100%
```

#### Linear (Equal credit to all touchpoints)
```
Touchpoints: [A] → [B] → [C] → Conversion
Credit:      33.3% 33.3% 33.3%
```

#### Position-Based (40% first, 40% last, 20% middle)
```
Touchpoints: [A] → [B] → [C] → [D] → Conversion
Credit:       40%   10%   10%   40%
```

#### Time Decay (More credit to recent touchpoints)
```
Touchpoints: [A] → [B] → [C] → Conversion
Credit:       15%   25%   60%  (exponential decay)
```

### 3.3 Data Structures

```typescript
// Attribution data from orders.attribution JSONB
interface AttributionData {
  first_touch?: { source: string; weight: number };
  last_touch?: { source: string; weight: number };
  linear?: Array<{ source: string; weight: number }>;
  position_based?: Array<{ source: string; weight: number }>;
  time_decay?: Array<{ source: string; weight: number }>;
  touchpoint_count?: number;
  touchpoints?: Array<{
    timestamp: string;
    source: string;
    gclid?: string;
    fbclid?: string;
    ttclid?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  }>;
}

// Source breakdown response
interface SourceBreakdown {
  source: string;
  orders: number;
  revenue: number;
  firstTouch: number;
  lastTouch: number;
  linear: number;
  positionBased: number;
}
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/attribution` | Get attribution analysis |

---

## 4. Public Interface

### 4.1 Methods

#### `GET /api/dashboard/attribution`

**Description:** Returns attribution analysis across multiple models for the specified time period.

**Authentication:** Required (NextAuth session)

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| days | number | 30 | Lookback period in days |
| model | string | "all" | Attribution model filter (unused, returns all) |

**Returns:**
```json
{
  "sources": [
    {
      "source": "facebook",
      "orders": 150,
      "revenue": 15000.00,
      "firstTouch": 12000.00,
      "lastTouch": 8000.00,
      "linear": 10000.00,
      "positionBased": 9500.00
    },
    {
      "source": "google",
      "orders": 100,
      "revenue": 10000.00,
      "firstTouch": 8000.00,
      "lastTouch": 7000.00,
      "linear": 7500.00,
      "positionBased": 7800.00
    }
  ],
  "models": {
    "first_touch": {
      "facebook": 12000.00,
      "google": 8000.00
    },
    "last_touch": {
      "facebook": 8000.00,
      "google": 7000.00
    },
    "linear": {
      "facebook": 10000.00,
      "google": 7500.00
    },
    "position_based": {
      "facebook": 9500.00,
      "google": 7800.00
    }
  },
  "touchpointDistribution": [
    { "touchpoints": 1, "orders": 80 },
    { "touchpoints": 2, "orders": 45 },
    { "touchpoints": 3, "orders": 25 }
  ],
  "averageTouchpoints": 1.8,
  "totalOrdersWithAttribution": 250
}
```

**Empty Response (no stores):**
```json
{
  "sources": [],
  "models": {
    "first_touch": {},
    "last_touch": {},
    "linear": {},
    "position_based": {},
    "time_decay": {}
  },
  "touchpointDistribution": [],
  "averageTouchpoints": 0,
  "totalOrdersWithAttribution": 0
}
```

**Errors:**
- 401: Unauthorized
- 500: Failed to fetch attribution data

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| 401 | Unauthorized | Missing/invalid session | Log in |
| 500 | Failed to fetch attribution data | Database error | Check server logs |

### 5.2 Logging

- **Level:** Error for 5xx
- **Format:** `[Attribution] [User ID] [Error details]`
- **Destination:** Console (development), CloudWatch (production)

---

## 6. Security Considerations

- **Authentication:** Requires valid NextAuth session
- **Authorization:** Only returns data from user's stores
- **Data Isolation:** Store IDs filtered by user ownership
- **PII:** No raw emails - only hashed customer identifiers

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_attribution_unauthorized | Request without session | Returns 401 |
| test_attribution_no_stores | User has no stores | Returns empty response |
| test_attribution_no_orders | Stores but no orders | Returns empty sources |
| test_attribution_first_touch | First touch model calculation | Correct revenue attribution |
| test_attribution_last_touch | Last touch model calculation | Correct revenue attribution |
| test_attribution_linear | Linear model calculation | Equal split across touchpoints |
| test_attribution_position_based | Position-based calculation | 40/20/40 distribution |
| test_attribution_date_filter | Filter by days parameter | Only returns recent orders |
| test_attribution_touchpoint_count | Touchpoint distribution | Correct count per bucket |
| test_attribution_average | Average touchpoints | Correct calculation |
| test_attribution_null_attribution | Orders with null attribution | Skipped gracefully |
| test_attribution_partial_models | Orders with some models | Partial data aggregated |
| test_attribution_multiple_stores | Multiple stores aggregated | Combined results |
| test_attribution_sorted_by_revenue | Sources sorted by revenue | Descending order |

### 7.2 Integration Tests

- End-to-end attribution calculation with real order data
- Performance test with 10,000+ orders

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `dashboard/src/app/api/dashboard/attribution/route.ts`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `dashboard/src/app/api/dashboard/attribution/route.ts` | Attribution API |
| `dashboard/src/db/schema.ts` | Orders table with attribution JSONB |

### 8.2 Source Detection Logic

Sources are determined from the attribution data stored in orders. The source name comes from:
1. `utm_source` parameter if present
2. Click ID type (gclid → "google", fbclid → "facebook", ttclid → "tiktok")
3. Referrer domain
4. "direct" if no attribution data

### 8.3 Known Limitations

- Attribution calculated from pre-computed models stored in orders
- No real-time recalculation if models change
- Time decay model not fully implemented in aggregation
- Performance may degrade with very large order volumes (100k+)
- No caching layer

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-14 | Initial spec |
