<?php
/**
 * Touchpoint Tracker - Captures and stores all marketing touchpoints
 *
 * @package WooAttributionBridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class WAB_Touchpoint_Tracker
 *
 * Handles multi-touch attribution by tracking all touchpoints in a user's journey.
 */
class WAB_Touchpoint_Tracker {

	/**
	 * Cookie name for touchpoints
	 */
	const COOKIE_NAME = 'wab_touchpoints';

	/**
	 * Maximum touchpoints to store
	 */
	const MAX_TOUCHPOINTS = 50;

	/**
	 * Touchpoint expiry in days
	 */
	const TOUCHPOINT_EXPIRY_DAYS = 90;

	/**
	 * Current touchpoints
	 *
	 * @var array
	 */
	private array $touchpoints = array();

	/**
	 * Constructor
	 */
	public function __construct() {
		$this->load_touchpoints();
	}

	/**
	 * Initialize hooks
	 */
	public function init(): void {
		add_action( 'init', array( $this, 'capture_touchpoint' ) );
		add_action( 'woocommerce_checkout_order_created', array( $this, 'attach_touchpoints_to_order' ) );
	}

	/**
	 * Load touchpoints from cookie
	 */
	private function load_touchpoints(): void {
		if ( isset( $_COOKIE[ self::COOKIE_NAME ] ) ) {
			$decoded = json_decode( base64_decode( sanitize_text_field( wp_unslash( $_COOKIE[ self::COOKIE_NAME ] ) ) ), true );
			if ( is_array( $decoded ) ) {
				$this->touchpoints = $decoded;
			}
		}
	}

	/**
	 * Save touchpoints to cookie
	 */
	private function save_touchpoints(): void {
		// Limit number of touchpoints.
		if ( count( $this->touchpoints ) > self::MAX_TOUCHPOINTS ) {
			$this->touchpoints = array_slice( $this->touchpoints, -self::MAX_TOUCHPOINTS );
		}

		$encoded = base64_encode( wp_json_encode( $this->touchpoints ) );
		$expiry  = time() + ( self::TOUCHPOINT_EXPIRY_DAYS * DAY_IN_SECONDS );

		setcookie(
			self::COOKIE_NAME,
			$encoded,
			array(
				'expires'  => $expiry,
				'path'     => '/',
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
	}

	/**
	 * Capture touchpoint from current visit
	 */
	public function capture_touchpoint(): void {
		// Only capture on GET requests (page views).
		if ( 'GET' !== $_SERVER['REQUEST_METHOD'] ) {
			return;
		}

		// Don't capture admin pages or AJAX.
		if ( is_admin() || wp_doing_ajax() ) {
			return;
		}

		$touchpoint = $this->build_touchpoint();

		// For visits with attribution data, add to touchpoints as before.
		// For "direct" visits (no attribution), we still want to capture entry page
		// and referrer if this is the first touchpoint.
		$has_attribution = $this->has_attribution_data( $touchpoint );

		if ( ! $has_attribution ) {
			// If no touchpoints yet, record entry point even without attribution.
			if ( empty( $this->touchpoints ) ) {
				// Mark this as a direct visit entry point.
				$touchpoint['is_direct_entry'] = true;
				$this->touchpoints[] = $touchpoint;
				$this->save_touchpoints();
			}
			// Don't record subsequent page views without attribution.
			return;
		}

		// Check for duplicate (same touchpoint within 5 minutes).
		if ( $this->is_duplicate_touchpoint( $touchpoint ) ) {
			return;
		}

		$this->touchpoints[] = $touchpoint;
		$this->save_touchpoints();
	}

	/**
	 * Build touchpoint data from current request
	 *
	 * @return array Touchpoint data.
	 */
	private function build_touchpoint(): array {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended
		$touchpoint = array(
			'timestamp' => gmdate( 'c' ),
			'page_url'  => $this->get_current_url(),
		);

		// Capture click IDs.
		$click_ids = array(
			'gclid'  => isset( $_GET['gclid'] ) ? sanitize_text_field( wp_unslash( $_GET['gclid'] ) ) : null,
			'fbclid' => isset( $_GET['fbclid'] ) ? sanitize_text_field( wp_unslash( $_GET['fbclid'] ) ) : null,
			'ttclid' => isset( $_GET['ttclid'] ) ? sanitize_text_field( wp_unslash( $_GET['ttclid'] ) ) : null,
			'msclkid' => isset( $_GET['msclkid'] ) ? sanitize_text_field( wp_unslash( $_GET['msclkid'] ) ) : null,
			'dclid'  => isset( $_GET['dclid'] ) ? sanitize_text_field( wp_unslash( $_GET['dclid'] ) ) : null,
			'li_fat_id' => isset( $_GET['li_fat_id'] ) ? sanitize_text_field( wp_unslash( $_GET['li_fat_id'] ) ) : null,
		);

		// Only add non-null click IDs.
		foreach ( $click_ids as $key => $value ) {
			if ( $value ) {
				$touchpoint[ $key ] = $value;
			}
		}

		// UTM parameters.
		$utm_params = array(
			'utm_source'   => isset( $_GET['utm_source'] ) ? sanitize_text_field( wp_unslash( $_GET['utm_source'] ) ) : null,
			'utm_medium'   => isset( $_GET['utm_medium'] ) ? sanitize_text_field( wp_unslash( $_GET['utm_medium'] ) ) : null,
			'utm_campaign' => isset( $_GET['utm_campaign'] ) ? sanitize_text_field( wp_unslash( $_GET['utm_campaign'] ) ) : null,
			'utm_term'     => isset( $_GET['utm_term'] ) ? sanitize_text_field( wp_unslash( $_GET['utm_term'] ) ) : null,
			'utm_content'  => isset( $_GET['utm_content'] ) ? sanitize_text_field( wp_unslash( $_GET['utm_content'] ) ) : null,
		);

		// Only add non-null UTM params.
		foreach ( $utm_params as $key => $value ) {
			if ( $value ) {
				$touchpoint[ $key ] = $value;
			}
		}

		// Referrer analysis.
		$referrer = isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( wp_unslash( $_SERVER['HTTP_REFERER'] ) ) : '';
		if ( $referrer && ! $this->is_internal_referrer( $referrer ) ) {
			$touchpoint['referrer'] = $referrer;
			$touchpoint['referrer_domain'] = wp_parse_url( $referrer, PHP_URL_HOST );

			// Detect source from referrer.
			$source = $this->detect_source_from_referrer( $referrer );
			if ( $source && ! isset( $touchpoint['utm_source'] ) ) {
				$touchpoint['detected_source'] = $source;
			}
		}

		// Landing page type.
		$touchpoint['page_type'] = $this->get_page_type();

		// phpcs:enable WordPress.Security.NonceVerification.Recommended
		return $touchpoint;
	}

	/**
	 * Check if touchpoint has meaningful attribution data
	 *
	 * @param array $touchpoint Touchpoint data.
	 * @return bool
	 */
	private function has_attribution_data( array $touchpoint ): bool {
		$attribution_keys = array(
			'gclid', 'fbclid', 'ttclid', 'msclkid', 'dclid', 'li_fat_id',
			'utm_source', 'utm_medium', 'utm_campaign',
			'referrer',
		);

		foreach ( $attribution_keys as $key ) {
			if ( ! empty( $touchpoint[ $key ] ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if touchpoint is duplicate of recent one
	 *
	 * @param array $touchpoint Touchpoint to check.
	 * @return bool
	 */
	private function is_duplicate_touchpoint( array $touchpoint ): bool {
		if ( empty( $this->touchpoints ) ) {
			return false;
		}

		$last = end( $this->touchpoints );

		// Consider duplicate if within 5 minutes and same source.
		$last_time = strtotime( $last['timestamp'] ?? '' );
		$now       = time();

		if ( ( $now - $last_time ) < 300 ) {
			// Check if same click IDs or UTM source.
			$same_gclid  = ( $last['gclid'] ?? null ) === ( $touchpoint['gclid'] ?? null );
			$same_fbclid = ( $last['fbclid'] ?? null ) === ( $touchpoint['fbclid'] ?? null );
			$same_source = ( $last['utm_source'] ?? null ) === ( $touchpoint['utm_source'] ?? null );

			if ( $same_gclid && $same_fbclid && $same_source ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get current URL
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
	 * Check if referrer is internal
	 *
	 * @param string $referrer Referrer URL.
	 * @return bool
	 */
	private function is_internal_referrer( string $referrer ): bool {
		$referrer_host = wp_parse_url( $referrer, PHP_URL_HOST );
		$site_host     = wp_parse_url( home_url(), PHP_URL_HOST );

		return $referrer_host === $site_host;
	}

	/**
	 * Detect source from referrer domain
	 *
	 * @param string $referrer Referrer URL.
	 * @return string|null
	 */
	private function detect_source_from_referrer( string $referrer ): ?string {
		$domain = wp_parse_url( $referrer, PHP_URL_HOST );
		if ( ! $domain ) {
			return null;
		}

		$domain = strtolower( $domain );

		$source_map = array(
			'google'    => array( 'google.com', 'google.co.uk', 'google.de', 'google.fr' ),
			'bing'      => array( 'bing.com' ),
			'yahoo'     => array( 'yahoo.com', 'search.yahoo.com' ),
			'duckduckgo' => array( 'duckduckgo.com' ),
			'facebook'  => array( 'facebook.com', 'fb.com', 'l.facebook.com', 'lm.facebook.com' ),
			'instagram' => array( 'instagram.com', 'l.instagram.com' ),
			'twitter'   => array( 'twitter.com', 't.co', 'x.com' ),
			'linkedin'  => array( 'linkedin.com', 'lnkd.in' ),
			'pinterest' => array( 'pinterest.com' ),
			'tiktok'    => array( 'tiktok.com' ),
			'reddit'    => array( 'reddit.com' ),
			'youtube'   => array( 'youtube.com', 'youtu.be' ),
		);

		foreach ( $source_map as $source => $domains ) {
			foreach ( $domains as $check_domain ) {
				if ( str_ends_with( $domain, $check_domain ) || $domain === $check_domain ) {
					return $source;
				}
			}
		}

		return null;
	}

	/**
	 * Get current page type
	 *
	 * @return string
	 */
	private function get_page_type(): string {
		if ( is_front_page() ) {
			return 'homepage';
		} elseif ( is_product() ) {
			return 'product';
		} elseif ( is_product_category() ) {
			return 'category';
		} elseif ( is_cart() ) {
			return 'cart';
		} elseif ( is_checkout() ) {
			return 'checkout';
		} elseif ( is_shop() ) {
			return 'shop';
		} elseif ( is_single() ) {
			return 'post';
		} elseif ( is_page() ) {
			return 'page';
		}

		return 'other';
	}

	/**
	 * Attach touchpoints to order
	 *
	 * @param \WC_Order $order Order object.
	 */
	public function attach_touchpoints_to_order( $order ): void {
		if ( empty( $this->touchpoints ) ) {
			return;
		}

		// Store all touchpoints.
		$order->update_meta_data( '_wab_touchpoints', $this->touchpoints );

		// Calculate attributions using different models.
		$attributions = $this->calculate_attributions();
		$order->update_meta_data( '_wab_attributions', $attributions );

		$order->save();

		// Clear touchpoints after purchase.
		$this->clear_touchpoints();
	}

	/**
	 * Calculate attributions using different models
	 *
	 * @return array Attribution data for each model.
	 */
	public function calculate_attributions(): array {
		if ( empty( $this->touchpoints ) ) {
			return array();
		}

		return array(
			'first_touch'     => $this->get_first_touch_attribution(),
			'last_touch'      => $this->get_last_touch_attribution(),
			'linear'          => $this->get_linear_attribution(),
			'position_based'  => $this->get_position_based_attribution(),
			'time_decay'      => $this->get_time_decay_attribution(),
			'touchpoint_count' => count( $this->touchpoints ),
		);
	}

	/**
	 * Get first touch attribution (100% to first touchpoint)
	 *
	 * @return array
	 */
	private function get_first_touch_attribution(): array {
		$first = reset( $this->touchpoints );
		return $this->normalize_touchpoint_for_attribution( $first, 1.0 );
	}

	/**
	 * Get last touch attribution (100% to last touchpoint)
	 *
	 * @return array
	 */
	private function get_last_touch_attribution(): array {
		$last = end( $this->touchpoints );
		return $this->normalize_touchpoint_for_attribution( $last, 1.0 );
	}

	/**
	 * Get linear attribution (equal credit to all touchpoints)
	 *
	 * @return array
	 */
	private function get_linear_attribution(): array {
		$count   = count( $this->touchpoints );
		$weight  = 1.0 / $count;
		$sources = array();

		foreach ( $this->touchpoints as $touchpoint ) {
			$source = $this->get_touchpoint_source( $touchpoint );
			if ( ! isset( $sources[ $source ] ) ) {
				$sources[ $source ] = array(
					'source' => $source,
					'weight' => 0,
					'touchpoints' => 0,
				);
			}
			$sources[ $source ]['weight'] += $weight;
			$sources[ $source ]['touchpoints'] += 1;
		}

		return array_values( $sources );
	}

	/**
	 * Get position-based attribution (40% first, 40% last, 20% middle)
	 *
	 * @return array
	 */
	private function get_position_based_attribution(): array {
		$count = count( $this->touchpoints );

		if ( 1 === $count ) {
			return $this->normalize_touchpoint_for_attribution( $this->touchpoints[0], 1.0 );
		}

		if ( 2 === $count ) {
			return array(
				$this->normalize_touchpoint_for_attribution( $this->touchpoints[0], 0.5 ),
				$this->normalize_touchpoint_for_attribution( $this->touchpoints[1], 0.5 ),
			);
		}

		$sources       = array();
		$middle_count  = $count - 2;
		$middle_weight = 0.2 / $middle_count;

		foreach ( $this->touchpoints as $index => $touchpoint ) {
			$source = $this->get_touchpoint_source( $touchpoint );

			if ( 0 === $index ) {
				$weight = 0.4; // First touch.
			} elseif ( $index === $count - 1 ) {
				$weight = 0.4; // Last touch.
			} else {
				$weight = $middle_weight; // Middle touches.
			}

			if ( ! isset( $sources[ $source ] ) ) {
				$sources[ $source ] = array(
					'source' => $source,
					'weight' => 0,
				);
			}
			$sources[ $source ]['weight'] += $weight;
		}

		return array_values( $sources );
	}

	/**
	 * Get time decay attribution (more credit to recent touchpoints)
	 *
	 * @return array
	 */
	private function get_time_decay_attribution(): array {
		$count = count( $this->touchpoints );

		if ( 1 === $count ) {
			return $this->normalize_touchpoint_for_attribution( $this->touchpoints[0], 1.0 );
		}

		$sources      = array();
		$total_weight = 0;
		$weights      = array();

		// Calculate raw weights (exponential decay, half-life of 7 days).
		$now = time();
		foreach ( $this->touchpoints as $index => $touchpoint ) {
			$timestamp = strtotime( $touchpoint['timestamp'] ?? 'now' );
			$days_ago  = ( $now - $timestamp ) / DAY_IN_SECONDS;
			$weight    = pow( 0.5, $days_ago / 7 ); // Half-life of 7 days.

			$weights[ $index ] = $weight;
			$total_weight     += $weight;
		}

		// Normalize weights and aggregate by source.
		foreach ( $this->touchpoints as $index => $touchpoint ) {
			$source           = $this->get_touchpoint_source( $touchpoint );
			$normalized_weight = $weights[ $index ] / $total_weight;

			if ( ! isset( $sources[ $source ] ) ) {
				$sources[ $source ] = array(
					'source' => $source,
					'weight' => 0,
				);
			}
			$sources[ $source ]['weight'] += $normalized_weight;
		}

		return array_values( $sources );
	}

	/**
	 * Normalize touchpoint data for attribution
	 *
	 * @param array $touchpoint Touchpoint data.
	 * @param float $weight     Attribution weight.
	 * @return array
	 */
	private function normalize_touchpoint_for_attribution( array $touchpoint, float $weight ): array {
		return array(
			'source'    => $this->get_touchpoint_source( $touchpoint ),
			'weight'    => $weight,
			'timestamp' => $touchpoint['timestamp'] ?? null,
			'gclid'     => $touchpoint['gclid'] ?? null,
			'fbclid'    => $touchpoint['fbclid'] ?? null,
			'ttclid'    => $touchpoint['ttclid'] ?? null,
		);
	}

	/**
	 * Get source identifier from touchpoint
	 *
	 * @param array $touchpoint Touchpoint data.
	 * @return string
	 */
	private function get_touchpoint_source( array $touchpoint ): string {
		// Priority: Click ID > UTM Source > Detected Source > Referrer Domain > Direct.
		if ( ! empty( $touchpoint['gclid'] ) ) {
			return 'google_ads';
		}
		if ( ! empty( $touchpoint['fbclid'] ) ) {
			return 'meta_ads';
		}
		if ( ! empty( $touchpoint['ttclid'] ) ) {
			return 'tiktok_ads';
		}
		if ( ! empty( $touchpoint['msclkid'] ) ) {
			return 'bing_ads';
		}
		if ( ! empty( $touchpoint['li_fat_id'] ) ) {
			return 'linkedin_ads';
		}
		if ( ! empty( $touchpoint['utm_source'] ) ) {
			return sanitize_key( $touchpoint['utm_source'] );
		}
		if ( ! empty( $touchpoint['detected_source'] ) ) {
			return $touchpoint['detected_source'];
		}
		if ( ! empty( $touchpoint['referrer_domain'] ) ) {
			return 'referral:' . $touchpoint['referrer_domain'];
		}

		return 'direct';
	}

	/**
	 * Get all touchpoints
	 *
	 * @return array
	 */
	public function get_touchpoints(): array {
		return $this->touchpoints;
	}

	/**
	 * Clear touchpoints
	 */
	public function clear_touchpoints(): void {
		$this->touchpoints = array();
		setcookie(
			self::COOKIE_NAME,
			'',
			array(
				'expires'  => time() - 3600,
				'path'     => '/',
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
	}

	/**
	 * Get touchpoints for order
	 *
	 * @param \WC_Order $order Order object.
	 * @return array
	 */
	public static function get_order_touchpoints( $order ): array {
		$touchpoints = $order->get_meta( '_wab_touchpoints' );
		return is_array( $touchpoints ) ? $touchpoints : array();
	}

	/**
	 * Get attributions for order
	 *
	 * @param \WC_Order $order Order object.
	 * @return array
	 */
	public static function get_order_attributions( $order ): array {
		$attributions = $order->get_meta( '_wab_attributions' );
		return is_array( $attributions ) ? $attributions : array();
	}

	/**
	 * Calculate attributions from an array of touchpoints.
	 *
	 * Used for cross-device attribution where touchpoints come from database.
	 *
	 * @param array $touchpoints Array of touchpoint data.
	 * @return array Attribution data for each model.
	 */
	public function calculate_attributions_from_array( array $touchpoints ): array {
		if ( empty( $touchpoints ) ) {
			return array();
		}

		// Temporarily set touchpoints for calculation.
		$original           = $this->touchpoints;
		$this->touchpoints  = $touchpoints;

		$attributions = $this->calculate_attributions();

		// Restore original touchpoints.
		$this->touchpoints = $original;

		return $attributions;
	}

	/**
	 * Set touchpoints directly (for testing or external data).
	 *
	 * @param array $touchpoints Touchpoints to set.
	 */
	public function set_touchpoints( array $touchpoints ): void {
		$this->touchpoints = $touchpoints;
	}
}
