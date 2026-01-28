<?php
/**
 * Plugin upgrader and self-healing handler.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Upgrader
 *
 * Handles version detection, table verification, and self-healing on plugin load.
 * Ensures database tables exist even after plugin updates.
 */
class WAB_Upgrader {

	/**
	 * Required database tables (without prefix).
	 *
	 * @var array
	 */
	public const REQUIRED_TABLES = [
		'wab_queue',
		'wab_log',
		'wab_touchpoints',
		'wab_identities',
		'wab_surveys',
	];

	/**
	 * Internal cache for table existence checks.
	 *
	 * @var array
	 */
	private static array $table_cache = [];

	/**
	 * Check version and run upgrades if needed.
	 *
	 * Called on plugins_loaded at priority 19 (before main plugin init at 20).
	 */
	public static function maybe_upgrade(): void {
		$stored_version = get_option( 'wab_version', '' );
		$current_version = defined( 'WAB_VERSION' ) ? WAB_VERSION : '1.0.0';

		// Skip if version matches.
		if ( $stored_version === $current_version ) {
			return;
		}

		// Run table verification and creation.
		self::verify_tables();

		// Run any version-specific migrations.
		if ( ! empty( $stored_version ) ) {
			self::run_migrations( $stored_version );
		}

		// Update stored version.
		update_option( 'wab_version', $current_version );

		// Log if debug mode is enabled.
		if ( get_option( 'wab_debug_mode' ) ) {
			if ( empty( $stored_version ) ) {
				error_log( '[WAB Upgrader] Fresh install detected, tables verified' );
			} else {
				error_log( sprintf( '[WAB Upgrader] Version mismatch: %s → %s', $stored_version, $current_version ) );
			}
		}
	}

	/**
	 * Verify all required tables exist and create missing ones.
	 *
	 * @return array Table status array (table_name => exists).
	 */
	public static function verify_tables(): array {
		global $wpdb;

		$status = [];

		foreach ( self::REQUIRED_TABLES as $table ) {
			$full_name = self::get_table_name( $table );
			$exists = self::check_table_exists_db( $table );

			if ( ! $exists ) {
				// Create missing table.
				self::create_table( $table );

				// Check again after creation.
				$exists = self::check_table_exists_db( $table );

				if ( get_option( 'wab_debug_mode' ) ) {
					error_log( sprintf( '[WAB Upgrader] Created missing table: %s', $full_name ) );
				}
			}

			// Update cache.
			self::$table_cache[ $table ] = $exists;
			$status[ $table ] = $exists;
		}

		return $status;
	}

	/**
	 * Check if a specific table exists.
	 *
	 * Uses cached result if available.
	 *
	 * @param string $table Table name without prefix.
	 * @return bool True if table exists.
	 */
	public static function table_exists( string $table ): bool {
		// Return cached result if available.
		if ( isset( self::$table_cache[ $table ] ) ) {
			return self::$table_cache[ $table ];
		}

		// Query database and cache result.
		$exists = self::check_table_exists_db( $table );
		self::$table_cache[ $table ] = $exists;

		return $exists;
	}

	/**
	 * Get the full table name with WordPress prefix.
	 *
	 * @param string $table Table name without prefix.
	 * @return string Full table name.
	 */
	public static function get_table_name( string $table ): string {
		global $wpdb;

		return $wpdb->prefix . $table;
	}

	/**
	 * Get list of missing tables.
	 *
	 * @return array Array of missing table names (without prefix).
	 */
	public static function get_missing_tables(): array {
		$missing = [];

		foreach ( self::REQUIRED_TABLES as $table ) {
			if ( ! self::table_exists( $table ) ) {
				$missing[] = $table;
			}
		}

		return $missing;
	}

	/**
	 * Clear the internal table cache.
	 *
	 * Useful for testing or forcing re-verification.
	 */
	public static function clear_cache(): void {
		self::$table_cache = [];
	}

	/**
	 * Check if table exists directly from database (no cache).
	 *
	 * @param string $table Table name without prefix.
	 * @return bool True if table exists.
	 */
	private static function check_table_exists_db( string $table ): bool {
		global $wpdb;

		$full_name = self::get_table_name( $table );
		$result = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $full_name ) );

		return $result === $full_name;
	}

	/**
	 * Create a single table using dbDelta.
	 *
	 * @param string $table Table name without prefix.
	 */
	private static function create_table( string $table ): void {
		global $wpdb;

		// Include upgrade.php only if file exists (not in test environment).
		$upgrade_file = ABSPATH . 'wp-admin/includes/upgrade.php';
		if ( file_exists( $upgrade_file ) ) {
			require_once $upgrade_file;
		}

		// Skip if dbDelta doesn't exist (testing environment).
		if ( ! function_exists( 'dbDelta' ) ) {
			return;
		}

		$charset_collate = $wpdb->get_charset_collate();
		$sql = self::get_table_sql( $table, $charset_collate );

		if ( ! empty( $sql ) ) {
			dbDelta( $sql );
		}
	}

	/**
	 * Get SQL statement for creating a table.
	 *
	 * @param string $table           Table name without prefix.
	 * @param string $charset_collate Charset and collation.
	 * @return string SQL statement.
	 */
	private static function get_table_sql( string $table, string $charset_collate ): string {
		global $wpdb;

		$full_name = self::get_table_name( $table );

		return match ( $table ) {
			'wab_queue' => "CREATE TABLE {$full_name} (
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
			) {$charset_collate};",

			'wab_log' => "CREATE TABLE {$full_name} (
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
			) {$charset_collate};",

			'wab_touchpoints' => "CREATE TABLE {$full_name} (
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
			) {$charset_collate};",

			'wab_identities' => "CREATE TABLE {$full_name} (
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
			) {$charset_collate};",

			'wab_surveys' => "CREATE TABLE {$full_name} (
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
			) {$charset_collate};",

			default => '',
		};
	}

	/**
	 * Run version-specific migrations.
	 *
	 * @param string $from_version Previous version.
	 */
	private static function run_migrations( string $from_version ): void {
		// Version-specific migrations can be added here.
		// Example:
		// if ( version_compare( $from_version, '1.1.0', '<' ) ) {
		//     self::migrate_to_1_1_0();
		// }

		// Currently no migrations needed.
		do_action( 'wab_after_upgrade', $from_version );
	}
}
