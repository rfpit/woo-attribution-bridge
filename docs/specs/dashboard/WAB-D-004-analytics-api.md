# WAB-D-004 Analytics API

> **Status:** Implemented
> **Author:** Claude
> **Created:** 2026-01-14
> **Updated:** 2026-01-14

## 1. Overview

### 1.1 Purpose
The Analytics API provides dashboard metrics including revenue, orders, customers, attribution rates, ad spend, and ROAS calculations. It supports period-over-period comparisons and top source identification.

### 1.2 Scope
**Covers:**
- Revenue and order aggregations
- Customer metrics (total, new customers)
- Attribution tracking rate
- Ad spend and ROAS calculation
- Top sources by revenue
- Period-over-period comparison (30 days vs prior 30)

**Does NOT cover:**
- Detailed attribution model breakdowns (see WAB-D-003)
- Real-time data streaming
- Custom date range selection

### 1.3 Dependencies
- Drizzle ORM for database queries
- Ad platform connections for spend data
- Orders table with attribution data

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Calculate total revenue for period | Must |
| FR-002 | Count total orders for period | Must |
| FR-003 | Count unique customers (by email hash) | Must |
| FR-004 | Count new customers | Must |
| FR-005 | Calculate attribution tracking rate | Must |
| FR-006 | Aggregate ad spend from connected platforms | Must |
| FR-007 | Calculate ROAS (revenue / ad spend) | Must |
| FR-008 | Identify top 5 sources by revenue | Must |
| FR-009 | Calculate period-over-period change (%) | Must |
| FR-010 | Handle multiple stores per user | Must |
| FR-011 | Handle users with no ad platform connections | Must |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Query response time < 2s | P95 |
| NFR-002 | Support 100k+ orders | Per user |
| NFR-003 | Accurate decimal calculations | 2 decimal places |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dashboard UI   │────▶│  Metrics API    │────▶│  PostgreSQL     │
│  (KPIs)         │     │  (Next.js)      │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                        │
                               │                        ▼
                               │               ┌─────────────────┐
                               │               │  orders         │
                               │               │  ad_spend       │
                               │               │  stores         │
                               │               └─────────────────┘
                               ▼
                        ┌─────────────────┐
                        │  Aggregation    │
                        │  (SQL + Memory) │
                        └─────────────────┘
```

### 3.2 Data Structures

```typescript
// Metrics response structure
interface MetricsResponse {
  revenue: {
    total: number;
    change: number;  // Percentage change vs previous period
  };
  orders: {
    total: number;
    change: number;
  };
  customers: {
    total: number;
    newCustomers: number;
    change: number;
  };
  attribution: {
    tracked: number;  // Orders with attribution data
    rate: number;     // Percentage of orders tracked
    change: number;
  };
  adSpend: {
    total: number;
    roas: number;
    change: number;
  };
  topSources: Array<{
    source: string;
    revenue: number;
    orders: number;
    roas: number;
  }>;
}
```

### 3.3 Source Detection Logic

```typescript
// Source detection from attribution data
let source = "Direct";
if (attr?.gclid) source = "Google Ads";
else if (attr?.fbclid) source = "Meta Ads";
else if (attr?.ttclid) source = "TikTok Ads";
else if (attr?.source) source = attr.source;
```

### 3.4 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/metrics` | Get dashboard metrics |

---

## 4. Public Interface

### 4.1 Methods

#### `GET /api/dashboard/metrics`

**Description:** Returns aggregated metrics for the authenticated user's stores.

**Authentication:** Required (NextAuth session)

**Query Parameters:** None (uses fixed 30-day periods)

**Returns:**
```json
{
  "revenue": {
    "total": 25000.00,
    "change": 15.5
  },
  "orders": {
    "total": 450,
    "change": 12.3
  },
  "customers": {
    "total": 380,
    "newCustomers": 120,
    "change": 8.7
  },
  "attribution": {
    "tracked": 400,
    "rate": 88.9,
    "change": 5.2
  },
  "adSpend": {
    "total": 5000.00,
    "roas": 5.0,
    "change": -3.1
  },
  "topSources": [
    {
      "source": "Google Ads",
      "revenue": 12000.00,
      "orders": 200,
      "roas": 4.5
    },
    {
      "source": "Meta Ads",
      "revenue": 8000.00,
      "orders": 150,
      "roas": 6.0
    },
    {
      "source": "Direct",
      "revenue": 5000.00,
      "orders": 100,
      "roas": 99
    }
  ]
}
```

**Errors:**
- 401: Unauthorized
- 404: No stores connected
- 500: Failed to fetch metrics

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| 401 | Unauthorized | No session | Log in |
| 404 | No stores connected | User has no stores | Connect a store |
| 500 | Failed to fetch metrics | Database error | Check server logs |

### 5.2 Change Calculation

```typescript
const calcChange = (current: number, previous: number) => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};
```

---

## 6. Security Considerations

- **Authentication:** Requires valid NextAuth session
- **Authorization:** Only returns data from user's stores
- **Multi-tenancy:** Store IDs and connection IDs filtered by user

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_metrics_unauthorized | Request without session | Returns 401 |
| test_metrics_no_stores | User has no stores | Returns 404 |
| test_metrics_revenue_calc | Revenue aggregation | Correct sum |
| test_metrics_order_count | Order counting | Correct count |
| test_metrics_customer_count | Unique customers | Correct distinct count |
| test_metrics_new_customers | New customer count | Correct flag sum |
| test_metrics_attribution_rate | Attribution rate calculation | Tracked/total * 100 |
| test_metrics_ad_spend_sum | Ad spend aggregation | Correct sum |
| test_metrics_roas_calc | ROAS calculation | Revenue/spend |
| test_metrics_roas_zero_spend | ROAS with zero spend | Returns 0 |
| test_metrics_period_change | Change calculation | Correct percentage |
| test_metrics_change_from_zero | Change from zero | Returns 100 or 0 |
| test_metrics_top_sources | Top sources sorted | By revenue descending |
| test_metrics_top_sources_limit | Top sources limit | Max 5 sources |
| test_metrics_multiple_stores | Multiple stores | Combined results |
| test_metrics_source_detection | Source detection logic | Correct source names |

### 7.2 Integration Tests

- Full metrics calculation with real order and ad spend data
- Performance test with large datasets

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `dashboard/src/app/api/dashboard/metrics/route.ts`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `dashboard/src/app/api/dashboard/metrics/route.ts` | Metrics API |
| `dashboard/src/db/schema.ts` | Database schema |

### 8.2 SQL Aggregations

```sql
-- Current period orders aggregation
SELECT
  COALESCE(SUM(CAST(total AS DECIMAL)), 0) as total,
  COUNT(*) as count,
  SUM(CASE WHEN is_new_customer THEN 1 ELSE 0 END) as new_customers,
  COUNT(DISTINCT customer_email_hash) as unique_customers,
  SUM(CASE WHEN attribution::text != 'null' AND attribution::text != '{}'
      THEN 1 ELSE 0 END) as tracked
FROM orders
WHERE store_id IN (user_store_ids)
  AND date_created >= now() - interval '30 days'
  AND date_created <= now();
```

### 8.3 Known Limitations

- Fixed 30-day comparison periods (not configurable)
- No currency conversion (all values assumed same currency)
- Ad spend from connected platforms only (no manual entry)
- ROAS returns 99 for sources with revenue but no spend data

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-14 | Initial spec |
