# WAB-P-009 Automatic Table Creation on Upgrade

> **Status:** Draft
> **Created:** 2026-01-28

## Problem

WordPress activation hooks only run on fresh install, not plugin updates. New database tables added in future versions aren't created for existing installations.

## Solution

On `admin_init`, compare stored version with current version. If different, run `WAB_Activator::create_tables()` (dbDelta is idempotent - safe to run repeatedly).

## Requirements

| ID | Requirement |
|----|-------------|
| FR-001 | Compare `wab_version` option with `WAB_VERSION` constant on admin_init |
| FR-002 | If versions differ, call `WAB_Activator::create_tables()` |
| FR-003 | Update `wab_version` option after successful upgrade |
| FR-004 | Skip check if versions match (no DB query overhead) |

## Implementation

~10 lines in `woo-attribution-bridge.php`:

```php
add_action('admin_init', function() {
    $stored = get_option('wab_version', '0');
    if ($stored !== WAB_VERSION) {
        require_once WAB_PLUGIN_DIR . 'includes/class-wab-activator.php';
        WAB_Activator::create_tables();
        update_option('wab_version', WAB_VERSION);
    }
});
```

## Tests

| Test | Expected |
|------|----------|
| Version matches | No action taken |
| Version outdated | create_tables() called, version updated |
| Fresh install (no version) | create_tables() called, version set |

## Out of Scope

- Public health check endpoints
- Integration status reporting
- Queue statistics
- HTTP status codes for monitoring
