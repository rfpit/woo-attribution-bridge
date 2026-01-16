<?php
/**
 * Cookie consent handler for GDPR/CCPA compliance.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Consent
 *
 * Detects cookie consent status from popular consent managers
 * and provides a unified API for checking consent levels.
 *
 * Supports: CookieYes, CookieBot, Complianz, GDPR Cookie Consent, Custom.
 */
class WAB_Consent {

	/**
	 * Consent level constants.
	 */
	public const LEVEL_FULL      = 'full';
	public const LEVEL_ANONYMOUS = 'anonymous';
	public const LEVEL_NONE      = 'none';

	/**
	 * Consent manager constants.
	 */
	public const MANAGER_AUTO      = 'auto';
	public const MANAGER_COOKIEYES = 'cookieyes';
	public const MANAGER_COOKIEBOT = 'cookiebot';
	public const MANAGER_COMPLIANZ = 'complianz';
	public const MANAGER_GDPR      = 'gdpr';
	public const MANAGER_CUSTOM    = 'custom';

	/**
	 * Cached consent level for current request.
	 *
	 * @var string|null
	 */
	private ?string $cached_level = null;

	/**
	 * Cached detected manager for current request.
	 *
	 * @var string|null|false False means not yet detected, null means none found.
	 */
	private $cached_manager = false;

	/**
	 * Get the current consent level.
	 *
	 * @return string One of LEVEL_FULL, LEVEL_ANONYMOUS, or LEVEL_NONE.
	 */
	public function get_consent_level(): string {
		// Return cached level if available.
		if ( $this->cached_level !== null ) {
			return $this->cached_level;
		}

		// Check DNT header first (takes priority if enabled).
		if ( $this->should_honor_dnt() && $this->is_dnt_enabled() ) {
			$this->cached_level = self::LEVEL_NONE;
			return $this->apply_consent_filter( $this->cached_level );
		}

		// Detect consent manager and get level.
		$manager = $this->detect_consent_manager();
		$level   = $this->get_level_from_manager( $manager );

		// Cache the result.
		$this->cached_level = $level;

		return $this->apply_consent_filter( $level );
	}

	/**
	 * Apply the consent level filter.
	 *
	 * @param string $level The detected consent level.
	 * @return string Filtered consent level.
	 */
	private function apply_consent_filter( string $level ): string {
		$manager = $this->detect_consent_manager();

		/**
		 * Filter the consent level.
		 *
		 * @param string      $level   The detected consent level.
		 * @param string|null $manager The detected consent manager.
		 */
		return apply_filters( 'wab_consent_level', $level, $manager );
	}

	/**
	 * Check if full tracking consent is granted.
	 *
	 * @return bool
	 */
	public function has_full_consent(): bool {
		return $this->get_consent_level() === self::LEVEL_FULL;
	}

	/**
	 * Check if any tracking is allowed.
	 *
	 * @return bool True if tracking allowed (full or anonymous), false if none.
	 */
	public function can_track(): bool {
		return $this->get_consent_level() !== self::LEVEL_NONE;
	}

	/**
	 * Check if cookies can be set.
	 *
	 * Cookies require full consent (not anonymous or none).
	 *
	 * @return bool
	 */
	public function can_set_cookies(): bool {
		return $this->get_consent_level() === self::LEVEL_FULL;
	}

	/**
	 * Detect which consent manager is active.
	 *
	 * @return string|null Manager identifier or null if none detected.
	 */
	public function detect_consent_manager(): ?string {
		// Return cached result if available.
		if ( $this->cached_manager !== false ) {
			return $this->cached_manager;
		}

		$configured_manager = get_option( 'wab_consent_manager', self::MANAGER_AUTO );

		// If a specific manager is configured (not auto), use that.
		if ( $configured_manager !== self::MANAGER_AUTO ) {
			$this->cached_manager = $configured_manager;
			return $configured_manager;
		}

		// Auto-detect consent manager.
		$this->cached_manager = $this->auto_detect_manager();

		return $this->cached_manager;
	}

	/**
	 * Auto-detect consent manager from cookies.
	 *
	 * @return string|null
	 */
	private function auto_detect_manager(): ?string {
		// Check CookieYes.
		if ( isset( $_COOKIE['cookieyes-consent'] ) ) {
			return self::MANAGER_COOKIEYES;
		}

		// Check CookieBot.
		if ( isset( $_COOKIE['CookieConsent'] ) ) {
			return self::MANAGER_COOKIEBOT;
		}

		// Check Complianz.
		if ( isset( $_COOKIE['cmplz_marketing'] ) || isset( $_COOKIE['cmplz_statistics'] ) ) {
			return self::MANAGER_COMPLIANZ;
		}

		// Check GDPR Cookie Consent.
		if ( isset( $_COOKIE['gdpr'] ) ) {
			return self::MANAGER_GDPR;
		}

		return null;
	}

	/**
	 * Get consent level from detected manager.
	 *
	 * @param string|null $manager The consent manager.
	 * @return string Consent level.
	 */
	private function get_level_from_manager( ?string $manager ): string {
		if ( $manager === null ) {
			// No manager detected - check if consent is required.
			return $this->is_consent_required() ? self::LEVEL_NONE : self::LEVEL_FULL;
		}

		switch ( $manager ) {
			case self::MANAGER_COOKIEYES:
				return $this->check_cookieyes_consent();

			case self::MANAGER_COOKIEBOT:
				return $this->check_cookiebot_consent();

			case self::MANAGER_COMPLIANZ:
				return $this->check_complianz_consent();

			case self::MANAGER_GDPR:
				return $this->check_gdpr_consent();

			case self::MANAGER_CUSTOM:
				return $this->check_custom_consent();

			default:
				return $this->is_consent_required() ? self::LEVEL_NONE : self::LEVEL_FULL;
		}
	}

	/**
	 * Check CookieYes consent status.
	 *
	 * @return string Consent level.
	 */
	private function check_cookieyes_consent(): string {
		if ( ! isset( $_COOKIE['cookieyes-consent'] ) || empty( $_COOKIE['cookieyes-consent'] ) ) {
			return $this->is_consent_required() ? self::LEVEL_NONE : self::LEVEL_FULL;
		}

		$consent = sanitize_text_field( wp_unslash( $_COOKIE['cookieyes-consent'] ) );

		// Format: "consentid:xxx,consent:yes,action:yes,necessary:yes,functional:yes,analytics:yes,performance:yes,advertisement:yes"

		// Check for marketing/advertisement consent.
		if ( strpos( $consent, 'advertisement:yes' ) !== false ) {
			return self::LEVEL_FULL;
		}

		// Check for analytics consent (anonymous tracking).
		if ( strpos( $consent, 'analytics:yes' ) !== false ) {
			return self::LEVEL_ANONYMOUS;
		}

		return self::LEVEL_NONE;
	}

	/**
	 * Check CookieBot consent status.
	 *
	 * @return string Consent level.
	 */
	private function check_cookiebot_consent(): string {
		if ( ! isset( $_COOKIE['CookieConsent'] ) ) {
			return $this->is_consent_required() ? self::LEVEL_NONE : self::LEVEL_FULL;
		}

		$consent = wp_unslash( $_COOKIE['CookieConsent'] );

		// Try JSON decode first.
		$decoded = json_decode( stripslashes( $consent ), true );

		if ( ! is_array( $decoded ) ) {
			// Try URL-decoded format.
			parse_str( urldecode( $consent ), $decoded );
		}

		if ( ! is_array( $decoded ) ) {
			// Invalid format, return safe default.
			return self::LEVEL_NONE;
		}

		// Check marketing consent.
		if ( ! empty( $decoded['marketing'] ) && $decoded['marketing'] === true ) {
			return self::LEVEL_FULL;
		}

		// Check statistics consent.
		if ( ! empty( $decoded['statistics'] ) && $decoded['statistics'] === true ) {
			return self::LEVEL_ANONYMOUS;
		}

		return self::LEVEL_NONE;
	}

	/**
	 * Check Complianz consent status.
	 *
	 * @return string Consent level.
	 */
	private function check_complianz_consent(): string {
		// Complianz uses category-specific cookies.
		$marketing  = isset( $_COOKIE['cmplz_marketing'] ) ? sanitize_text_field( wp_unslash( $_COOKIE['cmplz_marketing'] ) ) : null;
		$statistics = isset( $_COOKIE['cmplz_statistics'] ) ? sanitize_text_field( wp_unslash( $_COOKIE['cmplz_statistics'] ) ) : null;

		if ( $marketing === 'allow' ) {
			return self::LEVEL_FULL;
		}

		if ( $statistics === 'allow' ) {
			return self::LEVEL_ANONYMOUS;
		}

		// Check for denied state.
		if ( $marketing === 'deny' || $statistics === 'deny' ) {
			return self::LEVEL_NONE;
		}

		return $this->is_consent_required() ? self::LEVEL_NONE : self::LEVEL_FULL;
	}

	/**
	 * Check GDPR Cookie Consent plugin status.
	 *
	 * @return string Consent level.
	 */
	private function check_gdpr_consent(): string {
		if ( ! isset( $_COOKIE['gdpr'] ) ) {
			return $this->is_consent_required() ? self::LEVEL_NONE : self::LEVEL_FULL;
		}

		$consent = wp_unslash( $_COOKIE['gdpr'] );
		$decoded = json_decode( $consent, true );

		if ( ! is_array( $decoded ) || empty( $decoded['allowed_cookies'] ) ) {
			return self::LEVEL_NONE;
		}

		$allowed = $decoded['allowed_cookies'];

		if ( in_array( 'marketing', $allowed, true ) || in_array( 'all', $allowed, true ) ) {
			return self::LEVEL_FULL;
		}

		if ( in_array( 'analytics', $allowed, true ) || in_array( 'statistics', $allowed, true ) ) {
			return self::LEVEL_ANONYMOUS;
		}

		return self::LEVEL_NONE;
	}

	/**
	 * Check custom consent cookie.
	 *
	 * @return string Consent level.
	 */
	private function check_custom_consent(): string {
		$cookie_name = get_option( 'wab_consent_custom_cookie', '' );

		if ( empty( $cookie_name ) || ! isset( $_COOKIE[ $cookie_name ] ) ) {
			return $this->is_consent_required() ? self::LEVEL_NONE : self::LEVEL_FULL;
		}

		$value = sanitize_text_field( wp_unslash( $_COOKIE[ $cookie_name ] ) );

		// Check for common "granted" values.
		$granted_values = [ 'granted', 'allow', 'allowed', 'yes', 'true', '1', 'accepted', 'accept' ];
		if ( in_array( strtolower( $value ), $granted_values, true ) ) {
			return self::LEVEL_FULL;
		}

		// Check for common "denied" values.
		$denied_values = [ 'denied', 'deny', 'no', 'false', '0', 'rejected', 'reject' ];
		if ( in_array( strtolower( $value ), $denied_values, true ) ) {
			return self::LEVEL_NONE;
		}

		// Unknown value, use safe default.
		return self::LEVEL_NONE;
	}

	/**
	 * Check if Do-Not-Track header is enabled.
	 *
	 * @return bool True if DNT header is set to '1'.
	 */
	public function is_dnt_enabled(): bool {
		return isset( $_SERVER['HTTP_DNT'] ) && $_SERVER['HTTP_DNT'] === '1';
	}

	/**
	 * Check if DNT header should be honored.
	 *
	 * @return bool
	 */
	private function should_honor_dnt(): bool {
		return (bool) get_option( 'wab_respect_dnt', true );
	}

	/**
	 * Check if consent is required (when no manager detected).
	 *
	 * @return bool
	 */
	private function is_consent_required(): bool {
		return (bool) get_option( 'wab_consent_required', false );
	}

	/**
	 * Clear cached consent level.
	 *
	 * Useful when consent changes mid-request (e.g., via JavaScript callback).
	 */
	public function clear_cache(): void {
		$this->cached_level   = null;
		$this->cached_manager = false;
	}
}
