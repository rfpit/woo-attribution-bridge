<?php
/**
 * Browser fingerprint handler for cookieless attribution.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Fingerprint
 *
 * Handles client-side browser fingerprints for attribution without cookies.
 * Uses canvas, WebGL, audio, screen, and timezone characteristics to generate
 * a unique but privacy-preserving fingerprint.
 */
class WAB_Fingerprint {

	/**
	 * Database table name (without prefix).
	 */
	private const TABLE_NAME = 'wab_fingerprints';

	/**
	 * Initialize fingerprint hooks.
	 */
	public function __construct() {
		$this->init_hooks();
	}

	/**
	 * Register hooks.
	 */
	private function init_hooks(): void {
		// AJAX handlers.
		add_action( 'wp_ajax_wab_store_fingerprint', [ $this, 'ajax_store_fingerprint' ] );
		add_action( 'wp_ajax_nopriv_wab_store_fingerprint', [ $this, 'ajax_store_fingerprint' ] );

		// Enqueue fingerprint script.
		add_action( 'wp_enqueue_scripts', [ $this, 'enqueue_scripts' ] );

		// Cleanup cron.
		add_action( 'wab_cleanup_old_fingerprints', [ __CLASS__, 'cleanup_old_fingerprints' ] );
	}

	/**
	 * Check if fingerprinting is enabled.
	 *
	 * @return bool
	 */
	public function is_enabled(): bool {
		return (bool) get_option( 'wab_fingerprint_enabled', true );
	}

	/**
	 * Get fingerprinting components configuration.
	 *
	 * @return array
	 */
	public function get_components_config(): array {
		return get_option(
			'wab_fingerprint_components',
			[
				'canvas'   => true,
				'webgl'    => true,
				'audio'    => true,
				'screen'   => true,
				'timezone' => true,
				'fonts'    => false,
			]
		);
	}

	/**
	 * Get minimum confidence threshold.
	 *
	 * @return float
	 */
	public function get_min_confidence(): float {
		return (float) get_option( 'wab_fingerprint_min_confidence', 0.75 );
	}

	/**
	 * Get fingerprint TTL in days.
	 *
	 * @return int
	 */
	public function get_ttl_days(): int {
		return (int) get_option( 'wab_fingerprint_ttl', 90 );
	}

	/**
	 * Enqueue the fingerprint script.
	 */
	public function enqueue_scripts(): void {
		if ( ! $this->is_enabled() ) {
			return;
		}

		// Don't load in admin.
		if ( is_admin() ) {
			return;
		}

		wp_enqueue_script(
			'wab-fingerprint',
			plugins_url( 'assets/js/wab-fingerprint.js', dirname( __FILE__ ) ),
			[],
			WAB_VERSION,
			true
		);

		wp_localize_script(
			'wab-fingerprint',
			'wabFingerprintConfig',
			[
				'enabled'    => $this->is_enabled(),
				'ajaxUrl'    => admin_url( 'admin-ajax.php' ),
				'nonce'      => wp_create_nonce( 'wab_fingerprint' ),
				'debug'      => (bool) get_option( 'wab_debug_mode', false ),
				'components' => $this->get_components_config(),
			]
		);
	}

	/**
	 * Handle AJAX request to store fingerprint.
	 */
	public function ajax_store_fingerprint(): void {
		// Verify nonce.
		if ( ! check_ajax_referer( 'wab_fingerprint', 'nonce', false ) ) {
			wp_send_json_error( 'Invalid nonce' );
		}

		if ( ! $this->is_enabled() ) {
			wp_send_json_error( 'Fingerprinting disabled' );
		}

		// Sanitize inputs.
		$fingerprint_hash = isset( $_POST['fingerprint_hash'] )
			? sanitize_text_field( wp_unslash( $_POST['fingerprint_hash'] ) )
			: '';

		if ( empty( $fingerprint_hash ) || strlen( $fingerprint_hash ) !== 64 ) {
			wp_send_json_error( 'Invalid fingerprint hash' );
		}

		$components = isset( $_POST['components'] )
			? sanitize_text_field( wp_unslash( $_POST['components'] ) )
			: '';

		$visitor_id = isset( $_POST['visitor_id'] )
			? sanitize_text_field( wp_unslash( $_POST['visitor_id'] ) )
			: null;

		$click_ids = isset( $_POST['click_ids'] )
			? json_decode( wp_unslash( $_POST['click_ids'] ), true )
			: [];

		$utm_params = isset( $_POST['utm_params'] )
			? json_decode( wp_unslash( $_POST['utm_params'] ), true )
			: [];

		$landing_page = isset( $_POST['landing_page'] )
			? esc_url_raw( wp_unslash( $_POST['landing_page'] ) )
			: null;

		$referrer = isset( $_POST['referrer'] )
			? esc_url_raw( wp_unslash( $_POST['referrer'] ) )
			: null;

		// Store the fingerprint.
		$result = $this->store_fingerprint(
			$fingerprint_hash,
			[
				'components'   => $components,
				'visitor_id'   => $visitor_id,
				'click_ids'    => $click_ids,
				'utm_params'   => $utm_params,
				'landing_page' => $landing_page,
				'referrer'     => $referrer,
			]
		);

		if ( $result ) {
			$response = [ 'stored' => true ];

			// If we found existing attribution, return it.
			if ( isset( $result['attribution'] ) && ! empty( $result['attribution'] ) ) {
				$response['attribution'] = $result['attribution'];
			}

			wp_send_json_success( $response );
		} else {
			wp_send_json_error( 'Failed to store fingerprint' );
		}
	}

	/**
	 * Store or update a fingerprint record.
	 *
	 * @param string $fingerprint_hash The client-generated fingerprint hash.
	 * @param array  $data Attribution and metadata.
	 * @return array|false Result data or false on failure.
	 */
	public function store_fingerprint( string $fingerprint_hash, array $data ) {
		global $wpdb;

		$table = $wpdb->prefix . self::TABLE_NAME;

		// Check if fingerprint already exists.
		$existing = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE fingerprint_hash = %s",
				$fingerprint_hash
			),
			ARRAY_A
		);

		if ( $existing ) {
			// Update existing record.
			return $this->update_fingerprint( $existing, $data );
		}

		// Insert new record.
		return $this->insert_fingerprint( $fingerprint_hash, $data );
	}

	/**
	 * Insert a new fingerprint record.
	 *
	 * @param string $fingerprint_hash The fingerprint hash.
	 * @param array  $data Attribution data.
	 * @return array|false Result or false on failure.
	 */
	private function insert_fingerprint( string $fingerprint_hash, array $data ) {
		global $wpdb;

		$table = $wpdb->prefix . self::TABLE_NAME;

		$result = $wpdb->insert(
			$table,
			[
				'fingerprint_hash' => $fingerprint_hash,
				'visitor_id'       => $data['visitor_id'] ?? null,
				'components'       => $data['components'] ?? null,
				'click_ids'        => ! empty( $data['click_ids'] ) ? wp_json_encode( $data['click_ids'] ) : null,
				'utm_params'       => ! empty( $data['utm_params'] ) ? wp_json_encode( $data['utm_params'] ) : null,
				'landing_page'     => $data['landing_page'] ?? null,
				'referrer'         => $data['referrer'] ?? null,
				'confidence'       => 0.85, // Default confidence for new fingerprints.
			],
			[ '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%f' ]
		);

		if ( false === $result ) {
			return false;
		}

		return [ 'inserted' => true ];
	}

	/**
	 * Update an existing fingerprint record.
	 *
	 * @param array $existing Existing record.
	 * @param array $data New data.
	 * @return array Result with any recovered attribution.
	 */
	private function update_fingerprint( array $existing, array $data ): array {
		global $wpdb;

		$table  = $wpdb->prefix . self::TABLE_NAME;
		$result = [ 'updated' => true ];

		// Merge click IDs (new ones take precedence).
		$existing_click_ids = ! empty( $existing['click_ids'] )
			? json_decode( $existing['click_ids'], true )
			: [];
		$new_click_ids = $data['click_ids'] ?? [];
		$merged_click_ids = array_merge( $existing_click_ids, $new_click_ids );

		// Merge UTM params.
		$existing_utm = ! empty( $existing['utm_params'] )
			? json_decode( $existing['utm_params'], true )
			: [];
		$new_utm = $data['utm_params'] ?? [];
		$merged_utm = ! empty( $new_utm ) ? $new_utm : $existing_utm;

		// Update record.
		$update_data = [
			'hit_count' => (int) $existing['hit_count'] + 1,
		];

		// Only update if we have new data.
		if ( ! empty( $merged_click_ids ) ) {
			$update_data['click_ids'] = wp_json_encode( $merged_click_ids );
		}

		if ( ! empty( $merged_utm ) ) {
			$update_data['utm_params'] = wp_json_encode( $merged_utm );
		}

		// Update visitor ID if provided and not already set.
		if ( ! empty( $data['visitor_id'] ) && empty( $existing['visitor_id'] ) ) {
			$update_data['visitor_id'] = $data['visitor_id'];
		}

		// Update components if provided.
		if ( ! empty( $data['components'] ) ) {
			$update_data['components'] = $data['components'];
		}

		// Increase confidence with each hit (max 0.95).
		$current_confidence = (float) $existing['confidence'];
		$new_confidence = min( 0.95, $current_confidence + 0.02 );
		$update_data['confidence'] = $new_confidence;

		$wpdb->update(
			$table,
			$update_data,
			[ 'id' => $existing['id'] ],
			null,
			[ '%d' ]
		);

		// If the fingerprint had existing attribution data, return it.
		if ( ! empty( $existing_click_ids ) || ! empty( $existing_utm ) ) {
			$result['attribution'] = $this->build_attribution_array( $existing );
		}

		return $result;
	}

	/**
	 * Build an attribution array from a fingerprint record.
	 *
	 * @param array $record Fingerprint record.
	 * @return array Attribution data.
	 */
	private function build_attribution_array( array $record ): array {
		$attribution = [];

		// Click IDs.
		$click_ids = ! empty( $record['click_ids'] )
			? json_decode( $record['click_ids'], true )
			: [];

		foreach ( $click_ids as $key => $value ) {
			$attribution[ $key ] = $value;
		}

		// Add first/last touch.
		if ( ! empty( $click_ids ) ) {
			$attribution['first_touch'] = $click_ids;
			$attribution['last_touch']  = $click_ids;
		}

		// UTM params.
		$utm_params = ! empty( $record['utm_params'] )
			? json_decode( $record['utm_params'], true )
			: [];

		if ( ! empty( $utm_params ) ) {
			$attribution['utm'] = $utm_params;
		}

		// Landing page and referrer.
		if ( ! empty( $record['landing_page'] ) ) {
			$attribution['landing_page'] = $record['landing_page'];
		}

		if ( ! empty( $record['referrer'] ) ) {
			$attribution['referrer'] = $record['referrer'];
		}

		// Mark source.
		$attribution['_source'] = 'fingerprint';
		$attribution['_confidence'] = (float) $record['confidence'];

		return $attribution;
	}

	/**
	 * Get attribution data by fingerprint hash.
	 *
	 * @param string $fingerprint_hash The fingerprint hash.
	 * @param float  $min_confidence Minimum confidence threshold.
	 * @return array|null Attribution data or null if not found.
	 */
	public function get_attribution( string $fingerprint_hash, ?float $min_confidence = null ): ?array {
		global $wpdb;

		$table = $wpdb->prefix . self::TABLE_NAME;
		$min_confidence = $min_confidence ?? $this->get_min_confidence();

		$record = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table}
				 WHERE fingerprint_hash = %s
				 AND confidence >= %f",
				$fingerprint_hash,
				$min_confidence
			),
			ARRAY_A
		);

		if ( ! $record ) {
			return null;
		}

		return $this->build_attribution_array( $record );
	}

	/**
	 * Find attribution by visitor ID.
	 *
	 * @param string $visitor_id The visitor ID.
	 * @return array|null Attribution data or null if not found.
	 */
	public function get_attribution_by_visitor( string $visitor_id ): ?array {
		global $wpdb;

		$table = $wpdb->prefix . self::TABLE_NAME;

		// Get the most recent fingerprint for this visitor.
		$record = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table}
				 WHERE visitor_id = %s
				 ORDER BY last_seen DESC
				 LIMIT 1",
				$visitor_id
			),
			ARRAY_A
		);

		if ( ! $record ) {
			return null;
		}

		return $this->build_attribution_array( $record );
	}

	/**
	 * Merge fingerprint data when linking visitor IDs.
	 *
	 * Called when a visitor converts and we can link fingerprints.
	 *
	 * @param string $fingerprint_hash Client fingerprint hash.
	 * @param string $visitor_id Visitor ID from cookie.
	 * @return bool Success.
	 */
	public function link_visitor( string $fingerprint_hash, string $visitor_id ): bool {
		global $wpdb;

		$table = $wpdb->prefix . self::TABLE_NAME;

		$result = $wpdb->update(
			$table,
			[
				'visitor_id'  => $visitor_id,
				'confidence'  => 0.90, // Increase confidence when linked to visitor.
			],
			[ 'fingerprint_hash' => $fingerprint_hash ],
			[ '%s', '%f' ],
			[ '%s' ]
		);

		return false !== $result;
	}

	/**
	 * Cleanup old fingerprint records.
	 *
	 * Called by cron job.
	 */
	public static function cleanup_old_fingerprints(): void {
		global $wpdb;

		$table    = $wpdb->prefix . self::TABLE_NAME;
		$ttl_days = (int) get_option( 'wab_fingerprint_ttl', 90 );
		$cutoff   = gmdate( 'Y-m-d H:i:s', time() - ( $ttl_days * DAY_IN_SECONDS ) );

		// Delete fingerprints not seen since before cutoff.
		$wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$table} WHERE last_seen < %s",
				$cutoff
			)
		);
	}

	/**
	 * Get fingerprint statistics for admin display.
	 *
	 * @return array Statistics.
	 */
	public function get_stats(): array {
		global $wpdb;

		$table = $wpdb->prefix . self::TABLE_NAME;

		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );

		$with_click_ids = (int) $wpdb->get_var(
			"SELECT COUNT(*) FROM {$table} WHERE click_ids IS NOT NULL AND click_ids != '{}'"
		);

		$avg_confidence = (float) $wpdb->get_var(
			"SELECT AVG(confidence) FROM {$table}"
		);

		$avg_hits = (float) $wpdb->get_var(
			"SELECT AVG(hit_count) FROM {$table}"
		);

		return [
			'total_fingerprints' => $total,
			'with_click_ids'     => $with_click_ids,
			'attribution_rate'   => $total > 0 ? round( $with_click_ids / $total * 100, 1 ) : 0,
			'avg_confidence'     => round( $avg_confidence, 2 ),
			'avg_hits'           => round( $avg_hits, 1 ),
		];
	}
}
