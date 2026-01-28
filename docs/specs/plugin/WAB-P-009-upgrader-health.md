# WAB-P-009 Upgrader & Enhanced Health Check

> **Status:** Draft
> **Author:** Claude
> **Created:** 2026-01-28
> **Updated:** 2026-01-28

## 1. Overview

### 1.1 Purpose
Provides self-healing table verification and enhanced health checks to prevent the "missing tables" issue that occurs during plugin upgrades. WordPress activation hooks only run on fresh install, not on plugin updates—this module ensures database tables are verified and created on every plugin load.

### 1.2 Scope
**Covers:**
- Version mismatch detection and upgrade triggers
- Database table verification on every `plugins_loaded`
- Automatic recreation of missing tables via `dbDelta()`
- Enhanced `/wab/v1/health` endpoint with table and integration status
- Cached `table_exists()` helper for graceful degradation
- Version tracking via `wab_version` option

**Does NOT cover:**
- Table schema migrations (adding/modifying columns)
- Data migrations between versions
- Rollback functionality
- Multi-site network activation

### 1.3 Dependencies
- WordPress `$wpdb` for database operations
- WordPress `dbDelta()` for table creation
- `WAB_Activator::create_tables()` SQL definitions
- `WAB_Queue` for queue statistics (optional)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Detect version mismatch between stored `wab_version` and `WAB_VERSION` | Must |
| FR-002 | Verify all required tables exist on every `plugins_loaded` | Must |
| FR-003 | Recreate missing tables via `dbDelta()` without data loss | Must |
| FR-004 | Enhanced health check returns table existence status | Must |
| FR-005 | Health check returns integration configuration status | Must |
| FR-006 | Cached `table_exists()` helper for runtime checks | Must |
| FR-007 | Update `wab_version` option after successful upgrade | Must |
| FR-008 | Health check returns 503 when in degraded state | Should |
| FR-009 | Health check returns queue statistics when table exists | Should |
| FR-010 | Clear cache method for testing and forced re-verification | Should |
| FR-011 | Run on fresh install when no `wab_version` exists | Should |
| FR-012 | Log debug messages when tables are recreated | Could |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Table verification completes within 50ms | < 50ms for 6 tables |
| NFR-002 | Cache prevents repeated `SHOW TABLES` queries | Single query per request |
| NFR-003 | No performance impact when all tables exist | Skip `dbDelta()` entirely |
| NFR-004 | Health check response time | < 100ms |

---

## 3. Technical Design

### 3.1 Architecture

```
plugins_loaded (priority 19)
    │
    └─▶ WAB_Upgrader::maybe_upgrade()
            │
            ├── Compare get_option('wab_version') vs WAB_VERSION
            │
            ├── If different OR empty:
            │   ├── verify_tables() → returns status array
            │   │   └── For each missing: dbDelta(SQL)
            │   ├── run_migrations($from_version)
            │   └── update_option('wab_version', WAB_VERSION)
            │
            └── Populate table_cache[] for later use

plugins_loaded (priority 20)
    │
    └─▶ wab_init() → normal plugin load
            │
            └─▶ Uses WAB_Upgrader::table_exists() for graceful degradation
```

### 3.2 Required Tables

```php
public const REQUIRED_TABLES = [
    'wab_queue',       // Retry queue for failed API calls
    'wab_log',         // Conversion event log
    'wab_touchpoints', // Multi-touch attribution tracking
    'wab_identities',  // Cross-device identity graph
    'wab_surveys',     // Post-purchase survey responses
];
```

Note: `wab_attribution_cache` is intentionally excluded—it's created lazily by the cookie consent module.

### 3.3 Health Check Response

**Healthy (HTTP 200):**
```json
{
  "status": "healthy",
  "wab_version": "1.1.0",
  "db_version": "1.1.0",
  "tables": {
    "wab_queue": true,
    "wab_log": true,
    "wab_touchpoints": true,
    "wab_identities": true,
    "wab_surveys": true
  },
  "missing_tables": [],
  "integrations": {
    "meta": {"enabled": true, "configured": true},
    "google": {"enabled": false, "configured": false},
    "tiktok": {"enabled": false, "configured": false},
    "swetrix": {"enabled": false, "configured": false}
  },
  "queue": {
    "pending": 2,
    "failed": 0
  },
  "timestamp": "2026-01-28T10:30:00+00:00"
}
```

**Degraded (HTTP 503):**
```json
{
  "status": "degraded",
  "wab_version": "1.1.0",
  "db_version": "1.0.0",
  "tables": {
    "wab_queue": true,
    "wab_log": true,
    "wab_touchpoints": true,
    "wab_identities": false,
    "wab_surveys": true
  },
  "missing_tables": ["wab_identities"],
  "timestamp": "2026-01-28T10:30:00+00:00"
}
```

### 3.4 Integration Status Logic

| Integration | Enabled Check | Configured Check |
|-------------|---------------|------------------|
| Meta | `wab_meta_enabled` | `wab_meta_pixel_id` && `wab_meta_access_token` |
| Google | `wab_google_enabled` | `wab_google_customer_id` && `wab_google_conversion_action_id` |
| TikTok | `wab_tiktok_enabled` | `wab_tiktok_pixel_code` && `wab_tiktok_access_token` |
| Swetrix | `wab_swetrix_enabled` | `wab_swetrix_project_id` |

---

## 4. Public Interface

### 4.1 WAB_Upgrader Methods

#### `maybe_upgrade(): void`

**Description:** Check version and run upgrades if needed. Called on `plugins_loaded` priority 19.

**Side Effects:**
- Updates `wab_version` option if version changed
- Populates internal `$table_cache`
- Calls `dbDelta()` for missing tables

---

#### `verify_tables(): array`

**Description:** Check all required tables exist and create missing ones.

**Returns:**
```php
[
    'wab_queue' => true,      // Table exists
    'wab_log' => true,
    'wab_touchpoints' => false, // Table was missing, now created
    // ...
]
```

---

#### `table_exists(string $table): bool`

**Description:** Check if a specific table exists. Uses cached result if available.

**Parameters:**
- `$table` (string): Table name without prefix (e.g., 'wab_queue')

**Returns:** `true` if table exists, `false` otherwise

**Usage Example:**
```php
if (WAB_Upgrader::table_exists('wab_queue')) {
    // Safe to query the queue table
}
```

---

#### `get_table_name(string $table): string`

**Description:** Get the full table name with WordPress prefix.

**Parameters:**
- `$table` (string): Table name without prefix

**Returns:** Full table name (e.g., `wp_wab_queue`)

---

#### `clear_cache(): void`

**Description:** Clear the internal table cache. Useful for testing or forcing re-verification.

---

### 4.2 Filters

| Filter | Parameters | Description |
|--------|------------|-------------|
| `wab_required_tables` | `array $tables` | Modify list of required tables |
| `wab_health_check_data` | `array $data` | Modify health check response |

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| E001 | Table creation failed | `dbDelta()` failed | Check MySQL permissions |
| E002 | Version option update failed | WordPress option error | Check options table |

### 5.2 Logging

- **Level:** Debug (only when `wab_debug_mode` is true)
- **Format:** `[WAB Upgrader] Message`
- **Examples:**
  - `[WAB Upgrader] Version mismatch: 1.0.0 → 1.1.0`
  - `[WAB Upgrader] Creating missing table: wp_wab_identities`
  - `[WAB Upgrader] All tables verified`

---

## 6. Security Considerations

- **SQL Injection:** Table names are from hardcoded constant, not user input
- **Privilege Escalation:** Only runs table creation, not arbitrary SQL
- **Timing Attack:** `table_exists()` uses direct query, not exposed to timing attacks
- **Information Disclosure:** Health check doesn't expose sensitive data (no credentials, tokens)

---

## 7. Testing Requirements

### 7.1 Unit Tests - WAB_Upgrader

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_maybe_upgrade_skips_when_version_current | Version matches | No dbDelta calls |
| test_maybe_upgrade_runs_when_version_outdated | Version differs | dbDelta called |
| test_maybe_upgrade_runs_on_fresh_install | No version option | dbDelta called |
| test_verify_tables_returns_all_tables_status | Check all tables | Returns status array |
| test_verify_tables_calls_dbdelta_for_missing | Missing table | dbDelta called |
| test_table_exists_returns_true_for_existing | Table exists | Returns true |
| test_table_exists_returns_false_for_missing | Table missing | Returns false |
| test_table_exists_uses_cache | Called twice | Single DB query |
| test_clear_cache_resets_table_cache | Clear then check | Fresh DB query |
| test_version_option_updated_after_upgrade | After upgrade | Option updated |
| test_get_table_name_returns_prefixed_name | Get table name | Returns prefixed name |

### 7.2 Unit Tests - Health Check

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| test_health_check_returns_healthy_when_all_tables_exist | All tables exist | status: healthy, HTTP 200 |
| test_health_check_returns_degraded_when_tables_missing | Tables missing | status: degraded, HTTP 503 |
| test_health_check_includes_integration_status | Check integrations | Returns enabled/configured |
| test_health_check_includes_queue_stats | Queue table exists | Returns pending/failed counts |
| test_health_check_omits_queue_stats_when_table_missing | Queue table missing | No queue key |

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `woo-attribution-bridge/includes/class-wab-upgrader.php`
  - `woo-attribution-bridge/includes/class-wab-rest-api.php` (health_check method)

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `woo-attribution-bridge/includes/class-wab-upgrader.php` | Upgrader class |
| `woo-attribution-bridge/woo-attribution-bridge.php` | Hook registration |
| `woo-attribution-bridge/includes/class-wab-rest-api.php` | Enhanced health check |
| `tests/Unit/UpgraderTest.php` | Unit tests |

### 8.2 Hook Registration

In `woo-attribution-bridge.php`:

```php
// Load upgrader before main plugin init.
require_once WAB_PLUGIN_DIR . 'includes/class-wab-upgrader.php';

// Run upgrade check before plugin init (priority 19 < 20).
add_action('plugins_loaded', ['WAB_Upgrader', 'maybe_upgrade'], 19);
```

### 8.3 SQL Reuse

The `WAB_Upgrader::verify_tables()` method should reuse SQL from `WAB_Activator::create_tables()` to avoid duplication. Consider extracting table SQL to a shared method:

```php
// In WAB_Activator:
public static function get_table_schemas(): array;

// In WAB_Upgrader:
WAB_Activator::get_table_schemas()['wab_queue']
```

### 8.4 Known Limitations

- Does not handle column additions/modifications (schema migrations)
- Does not support rollback to previous version
- Cache is per-request only (not persistent across requests)
- `dbDelta()` can be slow on large databases

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-28 | Initial spec |
