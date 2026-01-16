<?php
/**
 * Cookie handler for attribution data storage.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Cookie
 *
 * Handles first-party cookie storage for click IDs and UTM parameters.
 */
class WAB_Cookie {

	/**
	 * Consent handler instance.
	 *
	 * @var WAB_Consent|null
	 */
	private ?WAB_Consent $consent = null;

	/**
	 * Click ID parameter mappings.
	 *
	 * @var array<string, string>
	 */
	private const CLICK_ID_PARAMS = [
		'fbclid'  => 'meta',
		'gclid'   => 'google',
		'ttclid'  => 'tiktok',
		'msclkid' => 'microsoft',
		'dclid'   => 'google_display',
		'li_fat_id' => 'linkedin',
	];

	/**
	 * UTM parameters to capture.
	 *
	 * @var array
	 */
	private const UTM_PARAMS = [
		'utm_source',
		'utm_medium',
		'utm_campaign',
		'utm_term',
		'utm_content',
	];

	/**
	 * Get the consent handler.
	 *
	 * @return WAB_Consent
	 */
	private function get_consent(): WAB_Consent {
		if ( $this->consent === null ) {
			$this->consent = new WAB_Consent();
		}
		return $this->consent;
	}

	/**
	 * Get the cookie name.
	 *
	 * @return string
	 */
	public function get_cookie_name(): string {
		return get_option( 'wab_cookie_name', 'wab_a' );
	}

	/**
	 * Get the visitor ID cookie name.
	 *
	 * @return string
	 */
	public function get_visitor_cookie_name(): string {
		return 'wab_visitor_id';
	}

	/**
	 * Get cookie expiry in days.
	 *
	 * @return int
	 */
	public function get_cookie_expiry(): int {
		return (int) get_option( 'wab_cookie_expiry', 90 );
	}

	/**
	 * Capture click IDs from URL and store in cookie.
	 *
	 * Called on template_redirect for frontend pages.
	 */
	public function capture_click_ids(): void {
		// Don't run in admin or during AJAX.
		if ( is_admin() || wp_doing_ajax() ) {
			return;
		}

		// Ensure visitor ID exists.
		$this->ensure_visitor_id();

		// Get current attribution data.
		$attribution = $this->get_attribution_data();

		// Capture click IDs from URL.
		$new_click_ids = $this->extract_click_ids_from_url();
		if ( ! empty( $new_click_ids ) ) {
			// Update first touch if not set.
			if ( empty( $attribution['first_touch'] ) ) {
				$attribution['first_touch'] = $new_click_ids;
				$attribution['first_touch']['timestamp'] = time();
			}

			// Always update last touch.
			$attribution['last_touch'] = $new_click_ids;
			$attribution['last_touch']['timestamp'] = time();

			// Store all click IDs for current session.
			foreach ( $new_click_ids as $key => $value ) {
				if ( $key !== 'timestamp' ) {
					$attribution[ $key ] = $value;
				}
			}
		}

		// Capture UTM parameters.
		$utm_params = $this->extract_utm_params_from_url();
		if ( ! empty( $utm_params ) ) {
			$attribution['utm'] = $utm_params;
		}

		// Capture landing page if first visit.
		if ( empty( $attribution['landing_page'] ) ) {
			$attribution['landing_page'] = $this->get_current_url();
		}

		// Capture referrer if present.
		if ( ! empty( $_SERVER['HTTP_REFERER'] ) && empty( $attribution['referrer'] ) ) {
			$referrer = esc_url_raw( wp_unslash( $_SERVER['HTTP_REFERER'] ) );
			// Only store external referrers.
			$site_host = wp_parse_url( home_url(), PHP_URL_HOST );
			$ref_host  = wp_parse_url( $referrer, PHP_URL_HOST );
			if ( $ref_host && $ref_host !== $site_host ) {
				$attribution['referrer'] = $referrer;
			}
		}

		// Save attribution data (to cookie if consent allows).
		$this->set_attribution_data( $attribution );

		// Always store server-side for cookie-less fallback.
		// This is attribution (linking click ID to conversion), not tracking.
		if ( ! empty( $new_click_ids ) || ! empty( $utm_params ) ) {
			$this->store_server_side_attribution( $new_click_ids, $utm_params );
		}

		// Record touchpoint if we captured any click IDs (requires consent).
		if ( ! empty( $new_click_ids ) ) {
			$this->record_touchpoint( $new_click_ids, $utm_params );
		}
	}

	/**
	 * Extract click IDs from current URL.
	 *
	 * @return array<string, string>
	 */
	private function extract_click_ids_from_url(): array {
		$click_ids = [];

		foreach ( self::CLICK_ID_PARAMS as $param => $platform ) {
			$option_key = 'wab_capture_' . $param;
			if ( ! get_option( $option_key, true ) ) {
				continue;
			}

			if ( isset( $_GET[ $param ] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
				$value = sanitize_text_field( wp_unslash( $_GET[ $param ] ) );
				if ( ! empty( $value ) ) {
					$click_ids[ $param ] = $value;
				}
			}
		}

		return $click_ids;
	}

	/**
	 * Extract UTM parameters from current URL.
	 *
	 * @return array<string, string>
	 */
	private function extract_utm_params_from_url(): array {
		if ( ! get_option( 'wab_capture_utm', true ) ) {
			return [];
		}

		$utm = [];

		foreach ( self::UTM_PARAMS as $param ) {
			if ( isset( $_GET[ $param ] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
				$value = sanitize_text_field( wp_unslash( $_GET[ $param ] ) );
				if ( ! empty( $value ) ) {
					$utm[ $param ] = $value;
				}
			}
		}

		return $utm;
	}

	/**
	 * Get current URL.
	 *
	 * @return string
	 */
	private function get_current_url(): string {
		$protocol = is_ssl() ? 'https://' : 'http://';
		$host     = isset( $_SERVER['HTTP_HOST'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_HOST'] ) ) : '';
		$uri      = isset( $_SERVER['REQUEST_URI'] ) ? esc_url_raw( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';

		return $protocol . $host . $uri;
	}

	/**
	 * Get attribution data from cookie (with server-side fallback).
	 *
	 * @return array
	 */
	public function get_attribution_data(): array {
		$cookie_name = $this->get_cookie_name();

		// Try cookie first.
		if ( isset( $_COOKIE[ $cookie_name ] ) ) {
			$data = json_decode( wp_unslash( $_COOKIE[ $cookie_name ] ), true );
			if ( is_array( $data ) && ! empty( $data ) ) {
				return $data;
			}
		}

		// Fall back to server-side attribution cache.
		return $this->get_server_side_attribution();
	}

	/**
	 * Set attribution data in cookie.
	 *
	 * @param array $data Attribution data.
	 */
	public function set_attribution_data( array $data ): void {
		// Check consent before setting cookies.
		if ( ! $this->get_consent()->can_set_cookies() ) {
			return;
		}

		$cookie_name = $this->get_cookie_name();
		$expiry      = time() + ( $this->get_cookie_expiry() * DAY_IN_SECONDS );
		$secure      = is_ssl();
		$path        = COOKIEPATH ?: '/';
		$domain      = COOKIE_DOMAIN ?: '';

		$json = wp_json_encode( $data );

		setcookie( $cookie_name, $json, $expiry, $path, $domain, $secure, true );

		// Also set in $_COOKIE for immediate access.
		$_COOKIE[ $cookie_name ] = $json;
	}

	/**
	 * Ensure visitor ID cookie exists.
	 */
	private function ensure_visitor_id(): void {
		// Check consent before setting cookies.
		if ( ! $this->get_consent()->can_set_cookies() ) {
			return;
		}

		$cookie_name = $this->get_visitor_cookie_name();

		if ( isset( $_COOKIE[ $cookie_name ] ) ) {
			return;
		}

		$visitor_id = $this->generate_visitor_id();
		$expiry     = time() + ( $this->get_cookie_expiry() * DAY_IN_SECONDS );
		$secure     = is_ssl();
		$path       = COOKIEPATH ?: '/';
		$domain     = COOKIE_DOMAIN ?: '';

		setcookie( $cookie_name, $visitor_id, $expiry, $path, $domain, $secure, true );
		$_COOKIE[ $cookie_name ] = $visitor_id;
	}

	/**
	 * Generate a unique visitor ID.
	 *
	 * @return string
	 */
	private function generate_visitor_id(): string {
		return wp_generate_uuid4();
	}

	/**
	 * Get the current visitor ID.
	 *
	 * @return string|null
	 */
	public function get_visitor_id(): ?string {
		$cookie_name = $this->get_visitor_cookie_name();

		return isset( $_COOKIE[ $cookie_name ] ) ? sanitize_text_field( $_COOKIE[ $cookie_name ] ) : null;
	}

	/**
	 * Record a touchpoint in the database.
	 *
	 * @param array $click_ids Click IDs captured.
	 * @param array $utm_params UTM parameters captured.
	 */
	private function record_touchpoint( array $click_ids, array $utm_params ): void {
		// Check if tracking is allowed (full or anonymous consent).
		if ( ! $this->get_consent()->can_track() ) {
			return;
		}

		global $wpdb;

		$visitor_id = $this->get_visitor_id();
		if ( ! $visitor_id ) {
			return;
		}

		// Determine touchpoint type from click IDs.
		$touchpoint_type = 'direct';
		$click_id_type   = null;
		$click_id_value  = null;

		foreach ( self::CLICK_ID_PARAMS as $param => $platform ) {
			if ( isset( $click_ids[ $param ] ) ) {
				$touchpoint_type = $platform;
				$click_id_type   = $param;
				$click_id_value  = $click_ids[ $param ];
				break;
			}
		}

		// If no click ID but has UTM, classify by UTM source.
		if ( $touchpoint_type === 'direct' && ! empty( $utm_params['utm_source'] ) ) {
			$touchpoint_type = 'utm';
		}

		$table = $wpdb->prefix . 'wab_touchpoints';

		$wpdb->insert(
			$table,
			[
				'visitor_id'      => $visitor_id,
				'session_id'      => $this->get_session_id(),
				'touchpoint_type' => $touchpoint_type,
				'source'          => $utm_params['utm_source'] ?? null,
				'medium'          => $utm_params['utm_medium'] ?? null,
				'campaign'        => $utm_params['utm_campaign'] ?? null,
				'click_id_type'   => $click_id_type,
				'click_id'        => $click_id_value,
				'landing_page'    => $this->get_current_url(),
				'referrer'        => isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( wp_unslash( $_SERVER['HTTP_REFERER'] ) ) : null,
				'user_agent'      => isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) : null,
				'ip_hash'         => $this->get_hashed_ip(),
			],
			[ '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' ]
		);
	}

	/**
	 * Get or create a session ID.
	 *
	 * @return string
	 */
	private function get_session_id(): string {
		if ( ! session_id() && ! headers_sent() ) {
			session_start();
		}

		return session_id() ?: wp_generate_uuid4();
	}

	/**
	 * Get hashed IP address for privacy.
	 *
	 * @return string
	 */
	private function get_hashed_ip(): string {
		$ip = '';

		if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
			$ip = sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) );
			$ip = explode( ',', $ip )[0];
		} elseif ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
			$ip = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );
		}

		// Hash for privacy.
		return hash( 'sha256', $ip . wp_salt() );
	}

	/**
	 * Get fingerprint hash for server-side attribution.
	 *
	 * Combines IP + User Agent for a session-like identifier.
	 * This is NOT for tracking users - only for linking click IDs to conversions.
	 *
	 * @return string
	 */
	public function get_fingerprint_hash(): string {
		$ip = '';

		if ( ! empty( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) {
			$ip = sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) );
			$ip = explode( ',', $ip )[0];
		} elseif ( ! empty( $_SERVER['REMOTE_ADDR'] ) ) {
			$ip = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) );
		}

		$ua = isset( $_SERVER['HTTP_USER_AGENT'] )
			? sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) )
			: '';

		// Combine IP + UA for a session-like fingerprint.
		return hash( 'sha256', $ip . '|' . $ua . '|' . wp_salt() );
	}

	/**
	 * Store attribution data server-side (cookie-less fallback).
	 *
	 * Always called regardless of consent - this is attribution, not tracking.
	 *
	 * @param array $click_ids Click IDs captured from URL.
	 * @param array $utm_params UTM parameters captured from URL.
	 */
	public function store_server_side_attribution( array $click_ids, array $utm_params = [] ): void {
		global $wpdb;

		$fingerprint = $this->get_fingerprint_hash();
		$table       = $wpdb->prefix . 'wab_attribution_cache';
		$ttl_hours   = (int) get_option( 'wab_cache_ttl', 48 );
		$expires_at  = gmdate( 'Y-m-d H:i:s', time() + ( $ttl_hours * HOUR_IN_SECONDS ) );

		// Prepare data.
		$landing_page = $this->get_current_url();
		$referrer     = isset( $_SERVER['HTTP_REFERER'] )
			? esc_url_raw( wp_unslash( $_SERVER['HTTP_REFERER'] ) )
			: null;

		// Use INSERT ... ON DUPLICATE KEY UPDATE to merge click IDs.
		$existing = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT click_ids, utm_params FROM {$table} WHERE fingerprint_hash = %s",
				$fingerprint
			),
			ARRAY_A
		);

		if ( $existing ) {
			// Merge with existing data.
			$existing_clicks = json_decode( $existing['click_ids'], true ) ?: [];
			$existing_utm    = json_decode( $existing['utm_params'], true ) ?: [];

			// New click IDs take precedence (last touch).
			$merged_clicks = array_merge( $existing_clicks, $click_ids );
			$merged_utm    = ! empty( $utm_params ) ? $utm_params : $existing_utm;

			$wpdb->update(
				$table,
				[
					'click_ids'  => wp_json_encode( $merged_clicks ),
					'utm_params' => wp_json_encode( $merged_utm ),
					'expires_at' => $expires_at,
				],
				[ 'fingerprint_hash' => $fingerprint ],
				[ '%s', '%s', '%s' ],
				[ '%s' ]
			);
		} else {
			// Insert new record.
			$wpdb->insert(
				$table,
				[
					'fingerprint_hash' => $fingerprint,
					'click_ids'        => wp_json_encode( $click_ids ),
					'utm_params'       => wp_json_encode( $utm_params ),
					'landing_page'     => $landing_page,
					'referrer'         => $referrer,
					'expires_at'       => $expires_at,
				],
				[ '%s', '%s', '%s', '%s', '%s', '%s' ]
			);
		}
	}

	/**
	 * Get attribution data from server-side cache.
	 *
	 * Used as fallback when cookies are blocked/declined.
	 *
	 * @return array Attribution data or empty array.
	 */
	public function get_server_side_attribution(): array {
		global $wpdb;

		$fingerprint = $this->get_fingerprint_hash();
		$table       = $wpdb->prefix . 'wab_attribution_cache';

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT click_ids, utm_params, landing_page, referrer
				 FROM {$table}
				 WHERE fingerprint_hash = %s AND expires_at > NOW()",
				$fingerprint
			),
			ARRAY_A
		);

		if ( ! $row ) {
			return [];
		}

		$attribution = [];

		// Decode click IDs.
		$click_ids = json_decode( $row['click_ids'], true ) ?: [];
		foreach ( $click_ids as $key => $value ) {
			$attribution[ $key ] = $value;
		}

		// Add first/last touch from click IDs.
		if ( ! empty( $click_ids ) ) {
			$attribution['first_touch'] = $click_ids;
			$attribution['last_touch']  = $click_ids;
		}

		// Decode UTM params.
		$utm_params = json_decode( $row['utm_params'], true ) ?: [];
		if ( ! empty( $utm_params ) ) {
			$attribution['utm'] = $utm_params;
		}

		// Add landing page and referrer.
		if ( ! empty( $row['landing_page'] ) ) {
			$attribution['landing_page'] = $row['landing_page'];
		}
		if ( ! empty( $row['referrer'] ) ) {
			$attribution['referrer'] = $row['referrer'];
		}

		// Mark as server-side attribution.
		$attribution['_source'] = 'server_side';

		return $attribution;
	}

	/**
	 * Cleanup expired attribution cache entries.
	 *
	 * Called by cron job.
	 */
	public static function cleanup_attribution_cache(): void {
		global $wpdb;

		$table = $wpdb->prefix . 'wab_attribution_cache';

		$wpdb->query( "DELETE FROM {$table} WHERE expires_at < NOW()" );
	}

	/**
	 * Get attribution data for an order (from cookie or order meta).
	 *
	 * @param WC_Order $order WooCommerce order.
	 * @return array
	 */
	public function get_order_attribution( WC_Order $order ): array {
		// First try order meta (already stored at checkout).
		$stored = $order->get_meta( '_wab_attribution' );
		if ( ! empty( $stored ) && is_array( $stored ) ) {
			return $stored;
		}

		// Fall back to current cookie data.
		return $this->get_attribution_data();
	}

	/**
	 * Save attribution data to order meta.
	 *
	 * @param WC_Order $order WooCommerce order.
	 */
	public function save_to_order( WC_Order $order ): void {
		$attribution = $this->get_attribution_data();

		if ( empty( $attribution ) ) {
			return;
		}

		// Calculate multi-touch attribution if touchpoint tracker exists.
		$multi_touch = $this->calculate_multi_touch_attribution();
		if ( ! empty( $multi_touch ) ) {
			$attribution['multi_touch'] = $multi_touch;
		}

		$order->update_meta_data( '_wab_attribution', $attribution );
		$order->update_meta_data( '_wab_visitor_id', $this->get_visitor_id() );

		// Store individual click IDs for easy querying.
		foreach ( self::CLICK_ID_PARAMS as $param => $platform ) {
			if ( isset( $attribution[ $param ] ) ) {
				$order->update_meta_data( '_wab_' . $param, $attribution[ $param ] );
			}
		}

		$order->save();

		// Link visitor to email in identity graph.
		$this->link_visitor_to_email( $order->get_billing_email() );
	}

	/**
	 * Calculate multi-touch attribution using the touchpoint tracker.
	 *
	 * @return array Multi-touch attribution data.
	 */
	private function calculate_multi_touch_attribution(): array {
		if ( ! class_exists( 'WAB_Touchpoint_Tracker' ) ) {
			return [];
		}

		$tracker = new \WAB_Touchpoint_Tracker();
		return $tracker->calculate_attributions();
	}

	/**
	 * Link visitor ID to email address in identity graph.
	 *
	 * @param string $email Customer email.
	 */
	private function link_visitor_to_email( string $email ): void {
		global $wpdb;

		$visitor_id = $this->get_visitor_id();
		if ( ! $visitor_id || empty( $email ) ) {
			return;
		}

		$email_hash = hash( 'sha256', strtolower( trim( $email ) ) );
		$table      = $wpdb->prefix . 'wab_identities';

		// Use INSERT IGNORE to avoid duplicates.
		$wpdb->query(
			$wpdb->prepare(
				"INSERT IGNORE INTO {$table} (email_hash, visitor_id, device_type) VALUES (%s, %s, %s)",
				$email_hash,
				$visitor_id,
				$this->detect_device_type()
			)
		);
	}

	/**
	 * Detect device type from user agent.
	 *
	 * @return string
	 */
	private function detect_device_type(): string {
		if ( ! isset( $_SERVER['HTTP_USER_AGENT'] ) ) {
			return 'unknown';
		}

		$ua = strtolower( sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ) ) );

		if ( preg_match( '/(tablet|ipad|playbook)|(android(?!.*(mobi|opera mini)))/i', $ua ) ) {
			return 'tablet';
		}

		if ( preg_match( '/(mobile|iphone|ipod|android.*mobile|windows phone|blackberry|bb10)/i', $ua ) ) {
			return 'mobile';
		}

		return 'desktop';
	}

	/**
	 * Clear attribution cookie.
	 */
	public function clear(): void {
		$cookie_name = $this->get_cookie_name();
		$path        = COOKIEPATH ?: '/';
		$domain      = COOKIE_DOMAIN ?: '';

		setcookie( $cookie_name, '', time() - 3600, $path, $domain );
		unset( $_COOKIE[ $cookie_name ] );
	}
}
