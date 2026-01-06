<?php
/**
 * Plugin activation handler.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Activator
 *
 * Handles plugin activation tasks including database table creation.
 */
class WAB_Activator {

	/**
	 * Activate the plugin.
	 *
	 * Creates necessary database tables and sets default options.
	 */
	public static function activate(): void {
		self::create_tables();
		self::set_default_options();
		self::schedule_cron_events();

		// Store version for future upgrade checks.
		update_option( 'wab_version', WAB_VERSION );
		update_option( 'wab_installed_at', time() );

		// Flush rewrite rules for any custom endpoints.
		flush_rewrite_rules();
	}

	/**
	 * Create custom database tables.
	 */
	private static function create_tables(): void {
		global $wpdb;

		$charset_collate = $wpdb->get_charset_collate();

		// Queue table for retry mechanism.
		$queue_table = $wpdb->prefix . 'wab_queue';
		$queue_sql = "CREATE TABLE {$queue_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			order_id bigint(20) unsigned NOT NULL,
			integration varchar(50) NOT NULL,
			payload longtext NOT NULL,
			status varchar(20) NOT NULL DEFAULT 'pending',
			attempts tinyint(3) unsigned NOT NULL DEFAULT 0,
			max_attempts tinyint(3) unsigned NOT NULL DEFAULT 5,
			next_retry datetime DEFAULT NULL,
			last_error text DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY order_id (order_id),
			KEY integration (integration),
			KEY status_next_retry (status, next_retry),
			KEY status (status)
		) {$charset_collate};";

		// Log table for tracking sent conversions.
		$log_table = $wpdb->prefix . 'wab_log';
		$log_sql = "CREATE TABLE {$log_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			order_id bigint(20) unsigned NOT NULL,
			integration varchar(50) NOT NULL,
			event_type varchar(50) NOT NULL DEFAULT 'purchase',
			event_id varchar(100) DEFAULT NULL,
			status varchar(20) NOT NULL,
			response_code smallint(5) unsigned DEFAULT NULL,
			response_body text DEFAULT NULL,
			click_ids text DEFAULT NULL,
			attribution_data text DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY order_id (order_id),
			KEY integration (integration),
			KEY event_id (event_id),
			KEY status (status),
			KEY created_at (created_at)
		) {$charset_collate};";

		// Touchpoints table for multi-touch attribution.
		$touchpoints_table = $wpdb->prefix . 'wab_touchpoints';
		$touchpoints_sql = "CREATE TABLE {$touchpoints_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			visitor_id varchar(64) NOT NULL,
			session_id varchar(64) DEFAULT NULL,
			touchpoint_type varchar(30) NOT NULL,
			source varchar(100) DEFAULT NULL,
			medium varchar(100) DEFAULT NULL,
			campaign varchar(255) DEFAULT NULL,
			click_id_type varchar(20) DEFAULT NULL,
			click_id varchar(255) DEFAULT NULL,
			landing_page text DEFAULT NULL,
			referrer text DEFAULT NULL,
			user_agent text DEFAULT NULL,
			ip_hash varchar(64) DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			KEY visitor_id (visitor_id),
			KEY click_id_type (click_id_type),
			KEY created_at (created_at),
			KEY visitor_created (visitor_id, created_at)
		) {$charset_collate};";

		// Identity graph for cross-device tracking.
		$identities_table = $wpdb->prefix . 'wab_identities';
		$identities_sql = "CREATE TABLE {$identities_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			email_hash varchar(64) NOT NULL,
			visitor_id varchar(64) NOT NULL,
			device_type varchar(30) DEFAULT NULL,
			first_seen datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			last_seen datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			UNIQUE KEY email_visitor (email_hash, visitor_id),
			KEY email_hash (email_hash),
			KEY visitor_id (visitor_id)
		) {$charset_collate};";

		// Survey responses table.
		$surveys_table = $wpdb->prefix . 'wab_surveys';
		$surveys_sql = "CREATE TABLE {$surveys_table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			order_id bigint(20) unsigned NOT NULL,
			email_hash varchar(64) NOT NULL,
			response varchar(100) NOT NULL,
			response_other text DEFAULT NULL,
			source_mapped varchar(50) DEFAULT NULL,
			created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (id),
			UNIQUE KEY order_id (order_id),
			KEY email_hash (email_hash),
			KEY source_mapped (source_mapped),
			KEY created_at (created_at)
		) {$charset_collate};";

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		dbDelta( $queue_sql );
		dbDelta( $log_sql );
		dbDelta( $touchpoints_sql );
		dbDelta( $identities_sql );
		dbDelta( $surveys_sql );
	}

	/**
	 * Set default plugin options.
	 */
	private static function set_default_options(): void {
		$defaults = [
			// General settings.
			'wab_cookie_name'     => 'wab_attribution',
			'wab_cookie_expiry'   => 90, // days
			'wab_debug_mode'      => false,

			// Click IDs to capture.
			'wab_capture_fbclid'  => true,
			'wab_capture_gclid'   => true,
			'wab_capture_ttclid'  => true,
			'wab_capture_msclkid' => true,
			'wab_capture_utm'     => true,

			// Queue settings.
			'wab_queue_enabled'        => true,
			'wab_queue_max_attempts'   => 5,
			'wab_queue_retry_intervals' => [ 60, 300, 1800, 7200, 43200 ], // 1min, 5min, 30min, 2hr, 12hr

			// Integration enables (disabled by default until configured).
			'wab_meta_enabled'    => false,
			'wab_google_enabled'  => false,
			'wab_tiktok_enabled'  => false,
			'wab_swetrix_enabled' => false,

			// Deduplication.
			'wab_dedup_enabled'   => true,
			'wab_dedup_window'    => 3600, // 1 hour

			// Survey settings.
			'wab_survey_enabled'      => true,
			'wab_survey_new_only'     => true, // Only show to new customers
			'wab_survey_question'     => 'How did you hear about us?',
			'wab_survey_options'      => [
				'facebook'  => 'Facebook / Instagram',
				'google'    => 'Google Search',
				'tiktok'    => 'TikTok',
				'youtube'   => 'YouTube',
				'friend'    => 'Friend / Family',
				'podcast'   => 'Podcast',
				'influencer' => 'Influencer',
				'other'     => 'Other',
			],
		];

		foreach ( $defaults as $key => $value ) {
			if ( get_option( $key ) === false ) {
				update_option( $key, $value );
			}
		}
	}

	/**
	 * Schedule cron events for queue processing.
	 */
	private static function schedule_cron_events(): void {
		if ( ! wp_next_scheduled( 'wab_process_queue' ) ) {
			wp_schedule_event( time(), 'wab_every_minute', 'wab_process_queue' );
		}

		if ( ! wp_next_scheduled( 'wab_cleanup_old_logs' ) ) {
			wp_schedule_event( time(), 'daily', 'wab_cleanup_old_logs' );
		}
	}
}
