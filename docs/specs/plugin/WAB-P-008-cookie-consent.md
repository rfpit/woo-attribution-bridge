# WAB-P-008 Cookie Consent Integration

> **Status:** Draft
> **Author:** Claude
> **Created:** 2026-01-16
> **Updated:** 2026-01-16

## 1. Overview

### 1.1 Purpose

Integrate cookie consent detection into the WooCommerce Attribution Bridge plugin to ensure GDPR/CCPA compliance. The module detects popular cookie consent managers, checks user consent status, and conditionally enables/disables tracking features based on consent level.

### 1.2 Scope

**In Scope:**
- Detection of CookieYes, CookieBot, Complianz, and GDPR Cookie Consent plugins
- Three consent modes: full, anonymous, none
- Do-Not-Track (DNT) header support
- Admin settings for consent configuration
- Integration with WAB_Cookie to conditionally set cookies
- Consent status logging in touchpoints table

**Out of Scope:**
- Providing a consent banner UI (relies on third-party consent managers)
- Consent for dashboard/Next.js application (separate concern)
- JavaScript-only consent checks (PHP server-side focus)

### 1.3 Dependencies

- `WAB_Cookie` (WAB-P-001) - Cookie handling integration
- WordPress Settings API - Admin configuration
- Third-party consent manager plugins (optional runtime dependency)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-001 | Detect CookieYes consent status from cookies | Must |
| FR-002 | Detect CookieBot consent status from cookies | Must |
| FR-003 | Detect Complianz consent status from cookies | Must |
| FR-004 | Detect GDPR Cookie Consent status from cookies | Should |
| FR-005 | Provide filter hook for custom consent detection | Must |
| FR-006 | Return consent level (full/anonymous/none) | Must |
| FR-007 | Block cookie setting when consent not granted | Must |
| FR-008 | Honor Do-Not-Track header when enabled | Should |
| FR-009 | Clear cookies when consent withdrawn | Could |
| FR-010 | Log consent status with each touchpoint | Must |
| FR-011 | Admin setting to require consent | Must |
| FR-012 | Admin setting to select consent manager | Must |
| FR-013 | Admin setting for custom consent cookie name | Should |
| FR-014 | Admin setting for strict mode (block conversions) | Could |

### 2.2 Non-Functional Requirements

| ID | Requirement | Metric |
|----|-------------|--------|
| NFR-001 | Consent check performance | < 1ms per check |
| NFR-002 | No external API calls for consent | Zero network requests |
| NFR-003 | Backward compatibility | Existing installs unaffected |
| NFR-004 | Cookie parsing reliability | Handle malformed cookies gracefully |

---

## 3. Technical Design

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        WAB_Consent Class                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │ CookieYes       │    │ CookieBot       │    │ Complianz       │ │
│  │ Detector        │    │ Detector        │    │ Detector        │ │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘ │
│           │                      │                      │          │
│           └──────────────────────┼──────────────────────┘          │
│                                  ▼                                  │
│                    ┌─────────────────────────┐                     │
│                    │   get_consent_level()   │                     │
│                    │   Returns: full|anon|none│                    │
│                    └─────────────────────────┘                     │
│                                  │                                  │
│                                  ▼                                  │
│                    ┌─────────────────────────┐                     │
│                    │  apply_filters(         │                     │
│                    │    'wab_consent_level', │                     │
│                    │    $level               │                     │
│                    │  )                      │                     │
│                    └─────────────────────────┘                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        WAB_Cookie Class                             │
├─────────────────────────────────────────────────────────────────────┤
│  capture_click_ids()                                                │
│       │                                                             │
│       ├─► if consent == 'none': return early                        │
│       ├─► if consent == 'anonymous': server-side only               │
│       └─► if consent == 'full': full tracking                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Data Structures

```php
/**
 * Consent levels enumeration.
 */
class WAB_Consent_Level {
    public const FULL      = 'full';      // All tracking enabled
    public const ANONYMOUS = 'anonymous'; // Server-side only, no cookies
    public const NONE      = 'none';      // No tracking at all
}

/**
 * Consent manager types.
 */
class WAB_Consent_Manager {
    public const AUTO       = 'auto';
    public const COOKIEYES  = 'cookieyes';
    public const COOKIEBOT  = 'cookiebot';
    public const COMPLIANZ  = 'complianz';
    public const GDPR       = 'gdpr';
    public const CUSTOM     = 'custom';
}

/**
 * Main consent class.
 */
class WAB_Consent {
    /**
     * Cached consent level for current request.
     */
    private ?string $cached_level = null;

    /**
     * Get the current consent level.
     *
     * @return string One of WAB_Consent_Level constants.
     */
    public function get_consent_level(): string;

    /**
     * Check if full tracking consent is granted.
     *
     * @return bool
     */
    public function has_full_consent(): bool;

    /**
     * Check if any tracking is allowed.
     *
     * @return bool
     */
    public function can_track(): bool;

    /**
     * Check if cookies can be set.
     *
     * @return bool
     */
    public function can_set_cookies(): bool;

    /**
     * Detect which consent manager is active.
     *
     * @return string|null Manager identifier or null.
     */
    public function detect_consent_manager(): ?string;

    /**
     * Check Do-Not-Track header.
     *
     * @return bool True if DNT is set and should be honored.
     */
    public function is_dnt_enabled(): bool;
}
```

### 3.3 Database Schema

Add `consent_status` column to existing `wp_wab_touchpoints` table:

```sql
-- Via dbDelta (safe for existing tables)
ALTER TABLE wp_wab_touchpoints
ADD COLUMN consent_status varchar(20) DEFAULT 'full';
```

The column uses VARCHAR instead of ENUM for dbDelta compatibility.

### 3.4 Consent Manager Detection

#### CookieYes

```php
private function check_cookieyes_consent(): ?string {
    if ( ! isset( $_COOKIE['cookieyes-consent'] ) ) {
        return null;
    }

    $consent = $_COOKIE['cookieyes-consent'];
    // Format: "consentid:xxx,consent:yes,action:yes,necessary:yes,functional:yes,analytics:yes,performance:yes,advertisement:yes"

    // Check for marketing/advertisement consent
    if ( strpos( $consent, 'advertisement:yes' ) !== false ) {
        return WAB_Consent_Level::FULL;
    }

    // Check for analytics consent (anonymous tracking)
    if ( strpos( $consent, 'analytics:yes' ) !== false ) {
        return WAB_Consent_Level::ANONYMOUS;
    }

    return WAB_Consent_Level::NONE;
}
```

#### CookieBot

```php
private function check_cookiebot_consent(): ?string {
    if ( ! isset( $_COOKIE['CookieConsent'] ) ) {
        return null;
    }

    $consent = $_COOKIE['CookieConsent'];
    // Format: {stamp:'...', necessary:true, preferences:true, statistics:true, marketing:true, ...}

    $decoded = json_decode( stripslashes( $consent ), true );
    if ( ! is_array( $decoded ) ) {
        // Try URL-decoded format
        parse_str( urldecode( $consent ), $decoded );
    }

    if ( ! empty( $decoded['marketing'] ) && $decoded['marketing'] === true ) {
        return WAB_Consent_Level::FULL;
    }

    if ( ! empty( $decoded['statistics'] ) && $decoded['statistics'] === true ) {
        return WAB_Consent_Level::ANONYMOUS;
    }

    return WAB_Consent_Level::NONE;
}
```

#### Complianz

```php
private function check_complianz_consent(): ?string {
    // Complianz uses category-specific cookies
    $marketing = $_COOKIE['cmplz_marketing'] ?? null;
    $statistics = $_COOKIE['cmplz_statistics'] ?? null;

    if ( $marketing === 'allow' ) {
        return WAB_Consent_Level::FULL;
    }

    if ( $statistics === 'allow' ) {
        return WAB_Consent_Level::ANONYMOUS;
    }

    // Check for denied state
    if ( $marketing === 'deny' || isset( $_COOKIE['cmplz_consent_status'] ) ) {
        return WAB_Consent_Level::NONE;
    }

    return null; // Manager not detected
}
```

---

## 4. Public Interface

### 4.1 Methods

#### `get_consent_level(): string`

**Description:** Returns the current user's consent level.

**Parameters:** None

**Returns:** `'full'` | `'anonymous'` | `'none'`

**Example:**
```php
$consent = new WAB_Consent();
$level = $consent->get_consent_level();

if ( $level === WAB_Consent_Level::FULL ) {
    // Set tracking cookies
}
```

#### `has_full_consent(): bool`

**Description:** Check if full marketing/tracking consent is granted.

**Returns:** `true` if full consent, `false` otherwise

#### `can_track(): bool`

**Description:** Check if any form of tracking is allowed (full or anonymous).

**Returns:** `true` if tracking allowed, `false` if consent is 'none'

#### `can_set_cookies(): bool`

**Description:** Check if cookies can be set. Returns false for anonymous/none consent.

**Returns:** `true` if cookies allowed, `false` otherwise

### 4.2 Hooks

| Hook Name | Type | Parameters | Description |
|-----------|------|------------|-------------|
| `wab_consent_level` | Filter | `$level, $manager` | Override detected consent level |
| `wab_consent_manager_detected` | Filter | `$manager` | Override detected manager |
| `wab_consent_check_dnt` | Filter | `$honor_dnt` | Override DNT behavior |
| `wab_before_consent_check` | Action | `$consent_instance` | Before consent is checked |

**Example - Custom consent logic:**
```php
add_filter( 'wab_consent_level', function( $level, $manager ) {
    // Custom consent detection
    if ( isset( $_COOKIE['my_consent'] ) && $_COOKIE['my_consent'] === 'granted' ) {
        return WAB_Consent_Level::FULL;
    }
    return $level;
}, 10, 2 );
```

### 4.3 Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wab_consent_required` | bool | `false` | Require consent before any tracking |
| `wab_consent_manager` | string | `'auto'` | Consent manager: auto/cookieyes/cookiebot/complianz/custom |
| `wab_consent_custom_cookie` | string | `''` | Custom cookie name for consent (when manager=custom) |
| `wab_respect_dnt` | bool | `true` | Honor Do-Not-Track browser header |
| `wab_strict_mode` | bool | `false` | Don't send conversions to ad platforms without consent |

---

## 5. Error Handling

### 5.1 Error Codes

| Code | Message | Cause | Resolution |
|------|---------|-------|------------|
| E001 | Invalid consent cookie format | Malformed cookie data | Return NONE as safe default |
| E002 | Unknown consent manager | Manager not recognized | Fall back to auto-detection |
| E003 | Consent check failed | Exception during check | Log error, return NONE |

### 5.2 Logging

- **Level:** Debug (when `wab_debug_mode` enabled)
- **Format:** `[WAB Consent] {message} - Manager: {manager}, Level: {level}`
- **Destination:** WordPress debug.log

```php
if ( get_option( 'wab_debug_mode' ) ) {
    error_log( sprintf(
        '[WAB Consent] Consent check: Manager=%s, Level=%s, DNT=%s',
        $manager ?? 'none',
        $level,
        $this->is_dnt_enabled() ? 'yes' : 'no'
    ) );
}
```

---

## 6. Security Considerations

- **Cookie tampering:** Treat all cookie values as untrusted input; validate format before parsing
- **XSS prevention:** Never output cookie values without escaping
- **Privacy by default:** When consent is unclear, default to `NONE` (most restrictive)
- **No PII storage:** Consent status is stored per-touchpoint, not linked to user identity
- **Audit trail:** Consent level recorded with each touchpoint for compliance auditing

---

## 7. Testing Requirements

### 7.1 Unit Tests

| Test Case | Description | Expected Result |
|-----------|-------------|-----------------|
| `test_cookieyes_full_consent` | CookieYes with advertisement:yes | Returns FULL |
| `test_cookieyes_analytics_only` | CookieYes with analytics:yes only | Returns ANONYMOUS |
| `test_cookieyes_no_consent` | CookieYes with all denied | Returns NONE |
| `test_cookiebot_marketing_consent` | CookieBot with marketing:true | Returns FULL |
| `test_cookiebot_statistics_only` | CookieBot with statistics:true | Returns ANONYMOUS |
| `test_complianz_marketing_allow` | Complianz cmplz_marketing=allow | Returns FULL |
| `test_complianz_statistics_allow` | Complianz cmplz_statistics=allow | Returns ANONYMOUS |
| `test_no_manager_consent_required` | No manager, consent required ON | Returns NONE |
| `test_no_manager_consent_not_required` | No manager, consent required OFF | Returns FULL |
| `test_dnt_enabled_honored` | DNT header set, respect_dnt ON | Returns NONE |
| `test_dnt_enabled_not_honored` | DNT header set, respect_dnt OFF | Returns detected level |
| `test_custom_filter_override` | Filter returns custom level | Filter value used |
| `test_malformed_cookie_handling` | Invalid JSON in consent cookie | Returns NONE safely |
| `test_consent_caching` | Multiple calls same request | Only checks once |

### 7.2 Integration Tests

- Test WAB_Cookie respects consent level
- Test touchpoint records consent_status
- Test settings page saves/loads correctly
- Test admin UI shows correct consent manager status

### 7.3 Coverage Target

- **Minimum:** 80%
- **Target files:**
  - `src/includes/class-wab-consent.php`
  - `tests/Unit/ConsentTest.php`

---

## 8. Implementation Notes

### 8.1 File Locations

| File | Purpose |
|------|---------|
| `src/includes/class-wab-consent.php` | Main consent detection class |
| `src/includes/class-wab-cookie.php` | Modified to check consent |
| `src/includes/class-wab-activator.php` | DB schema update |
| `src/includes/class-wab-loader.php` | Register consent hooks |
| `src/admin/views/settings-page.php` | Privacy & Consent tab UI |
| `src/admin/class-wab-admin.php` | Register settings |
| `tests/Unit/ConsentTest.php` | Unit tests |

### 8.2 Migration Steps

1. Add `consent_status` column via dbDelta (backward compatible)
2. Existing touchpoints will have `NULL` consent_status (treated as unknown/legacy)
3. New touchpoints will have explicit consent level recorded

### 8.3 Known Limitations

- Cannot detect consent before PHP runs (first page load may miss consent changes)
- Consent manager detection relies on specific cookie names (may break if managers change format)
- JavaScript consent changes mid-session won't affect server-side until next request
- Some consent managers use localStorage instead of cookies (not detectable server-side)

---

## 9. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-16 | Initial spec |
