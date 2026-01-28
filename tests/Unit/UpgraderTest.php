<?php
/**
 * Upgrader tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey\Functions;
use WAB_Upgrader;
use Mockery;

/**
 * Test case for WAB_Upgrader class.
 */
class UpgraderTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		// Reset the static cache before each test.
		WAB_Upgrader::clear_cache();

		// Set default options.
		global $wab_test_options;
		$wab_test_options = [];
	}

	/**
	 * Test maybe_upgrade skips when version is current.
	 */
	public function test_maybe_upgrade_skips_when_version_current(): void {
		global $wab_test_options, $wpdb;

		$wab_test_options['wab_version'] = WAB_VERSION;

		// Mock wpdb - should not be called for table verification.
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';
		// Allow get_var calls for table checking but not require them.
		$wpdb->shouldReceive( 'get_var' )->andReturn( 'wp_wab_queue' )->zeroOrMoreTimes();
		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			return $query;
		} )->zeroOrMoreTimes();

		WAB_Upgrader::maybe_upgrade();

		// Version should remain unchanged.
		$this->assertEquals( WAB_VERSION, $wab_test_options['wab_version'] );
	}

	/**
	 * Test maybe_upgrade runs when version is outdated.
	 */
	public function test_maybe_upgrade_runs_when_version_outdated(): void {
		global $wab_test_options, $wpdb;

		$wab_test_options['wab_version'] = '0.9.0';

		// Mock wpdb.
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		// Return all tables as existing.
		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			return $query;
		} );
		$wpdb->shouldReceive( 'get_charset_collate' )->andReturn( 'utf8mb4_unicode_ci' );
		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function( $query ) {
			// Return table name to indicate it exists.
			if ( strpos( $query, 'wab_queue' ) !== false ) {
				return 'wp_wab_queue';
			}
			if ( strpos( $query, 'wab_log' ) !== false ) {
				return 'wp_wab_log';
			}
			if ( strpos( $query, 'wab_touchpoints' ) !== false ) {
				return 'wp_wab_touchpoints';
			}
			if ( strpos( $query, 'wab_identities' ) !== false ) {
				return 'wp_wab_identities';
			}
			if ( strpos( $query, 'wab_surveys' ) !== false ) {
				return 'wp_wab_surveys';
			}
			return null;
		} );

		WAB_Upgrader::maybe_upgrade();

		// Version should be updated.
		$this->assertEquals( WAB_VERSION, $wab_test_options['wab_version'] );
	}

	/**
	 * Test maybe_upgrade runs on fresh install (no version).
	 */
	public function test_maybe_upgrade_runs_on_fresh_install(): void {
		global $wab_test_options, $wpdb;

		// No version option set (fresh install).
		unset( $wab_test_options['wab_version'] );

		// Mock wpdb.
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		// Return all tables as existing.
		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			return $query;
		} );
		$wpdb->shouldReceive( 'get_charset_collate' )->andReturn( 'utf8mb4_unicode_ci' );
		$wpdb->shouldReceive( 'get_var' )->andReturn( 'wp_wab_queue' );

		WAB_Upgrader::maybe_upgrade();

		// Version should be set.
		$this->assertEquals( WAB_VERSION, $wab_test_options['wab_version'] );
	}

	/**
	 * Test verify_tables returns all tables status.
	 */
	public function test_verify_tables_returns_all_tables_status(): void {
		global $wpdb;

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			return $query;
		} );

		$wpdb->shouldReceive( 'get_charset_collate' )->andReturn( 'utf8mb4_unicode_ci' );

		// Some tables exist, some don't. After dbDelta they'll still not exist in test.
		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function( $query ) {
			if ( strpos( $query, 'wab_queue' ) !== false ) {
				return 'wp_wab_queue';
			}
			if ( strpos( $query, 'wab_log' ) !== false ) {
				return 'wp_wab_log';
			}
			if ( strpos( $query, 'wab_touchpoints' ) !== false ) {
				return null; // Missing (dbDelta won't actually create in test).
			}
			if ( strpos( $query, 'wab_identities' ) !== false ) {
				return 'wp_wab_identities';
			}
			if ( strpos( $query, 'wab_surveys' ) !== false ) {
				return 'wp_wab_surveys';
			}
			return null;
		} );

		// Mock dbDelta for missing table.
		Functions\when( 'dbDelta' )->justReturn( [] );

		$result = WAB_Upgrader::verify_tables();

		$this->assertIsArray( $result );
		$this->assertArrayHasKey( 'wab_queue', $result );
		$this->assertArrayHasKey( 'wab_log', $result );
		$this->assertArrayHasKey( 'wab_touchpoints', $result );
		$this->assertArrayHasKey( 'wab_identities', $result );
		$this->assertArrayHasKey( 'wab_surveys', $result );
	}

	/**
	 * Test verify_tables calls dbDelta for missing tables.
	 */
	public function test_verify_tables_calls_dbdelta_for_missing(): void {
		global $wpdb;

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			return $query;
		} );

		$wpdb->shouldReceive( 'get_charset_collate' )->andReturn( 'utf8mb4_unicode_ci' );

		// wab_queue is the only missing table.
		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function( $query ) {
			if ( strpos( $query, 'wab_queue' ) !== false ) {
				return null; // Missing.
			}
			if ( strpos( $query, 'wab_log' ) !== false ) {
				return 'wp_wab_log';
			}
			if ( strpos( $query, 'wab_touchpoints' ) !== false ) {
				return 'wp_wab_touchpoints';
			}
			if ( strpos( $query, 'wab_identities' ) !== false ) {
				return 'wp_wab_identities';
			}
			if ( strpos( $query, 'wab_surveys' ) !== false ) {
				return 'wp_wab_surveys';
			}
			return null;
		} );

		$dbdelta_calls = [];

		Functions\when( 'dbDelta' )->alias( function( $sql ) use ( &$dbdelta_calls ) {
			$dbdelta_calls[] = $sql;
			return [];
		} );

		WAB_Upgrader::verify_tables();

		$this->assertNotEmpty( $dbdelta_calls, 'dbDelta should be called for missing table' );
		// Check that at least one call contains wab_queue.
		$found_queue = false;
		foreach ( $dbdelta_calls as $sql ) {
			if ( strpos( $sql, 'wab_queue' ) !== false ) {
				$found_queue = true;
				break;
			}
		}
		$this->assertTrue( $found_queue, 'dbDelta should be called with wab_queue SQL' );
	}

	/**
	 * Test table_exists returns true for existing table.
	 */
	public function test_table_exists_returns_true_for_existing(): void {
		global $wpdb;

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( "SHOW TABLES LIKE 'wp_wab_queue'" );
		$wpdb->shouldReceive( 'get_var' )->once()->andReturn( 'wp_wab_queue' );

		$result = WAB_Upgrader::table_exists( 'wab_queue' );

		$this->assertTrue( $result );
	}

	/**
	 * Test table_exists returns false for missing table.
	 */
	public function test_table_exists_returns_false_for_missing(): void {
		global $wpdb;

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( "SHOW TABLES LIKE 'wp_wab_missing'" );
		$wpdb->shouldReceive( 'get_var' )->once()->andReturn( null );

		$result = WAB_Upgrader::table_exists( 'wab_missing' );

		$this->assertFalse( $result );
	}

	/**
	 * Test table_exists uses cache on subsequent calls.
	 */
	public function test_table_exists_uses_cache(): void {
		global $wpdb;

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		// Should only be called once due to caching.
		$wpdb->shouldReceive( 'prepare' )->once()->andReturn( "SHOW TABLES LIKE 'wp_wab_queue'" );
		$wpdb->shouldReceive( 'get_var' )->once()->andReturn( 'wp_wab_queue' );

		// First call.
		$result1 = WAB_Upgrader::table_exists( 'wab_queue' );
		// Second call (should use cache).
		$result2 = WAB_Upgrader::table_exists( 'wab_queue' );

		$this->assertTrue( $result1 );
		$this->assertTrue( $result2 );
	}

	/**
	 * Test clear_cache resets the table cache.
	 */
	public function test_clear_cache_resets_table_cache(): void {
		global $wpdb;

		$call_count = 0;

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->andReturn( "SHOW TABLES LIKE 'wp_wab_queue'" );
		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function() use ( &$call_count ) {
			$call_count++;
			return 'wp_wab_queue';
		} );

		// First call.
		WAB_Upgrader::table_exists( 'wab_queue' );
		$this->assertEquals( 1, $call_count, 'Should have called get_var once' );

		// Second call (should use cache).
		WAB_Upgrader::table_exists( 'wab_queue' );
		$this->assertEquals( 1, $call_count, 'Should still be 1 (cached)' );

		// Clear cache.
		WAB_Upgrader::clear_cache();

		// After clear, should query again.
		WAB_Upgrader::table_exists( 'wab_queue' );
		$this->assertEquals( 2, $call_count, 'Should have called get_var again after cache clear' );
	}

	/**
	 * Test version option is updated after upgrade.
	 */
	public function test_version_option_updated_after_upgrade(): void {
		global $wab_test_options, $wpdb;

		$wab_test_options['wab_version'] = '0.5.0';

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			if ( ! empty( $args ) ) {
				return str_replace( '%s', $args[0], $query );
			}
			return $query;
		} );
		// All tables exist.
		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function( $query ) {
			foreach ( WAB_Upgrader::REQUIRED_TABLES as $table ) {
				if ( strpos( $query, 'wp_' . $table ) !== false ) {
					return 'wp_' . $table;
				}
			}
			return null;
		} );
		$wpdb->shouldReceive( 'get_charset_collate' )->andReturn( 'utf8mb4_unicode_ci' );

		// Mock dbDelta in case any table is considered missing.
		Functions\when( 'dbDelta' )->justReturn( [] );

		$this->assertNotEquals( WAB_VERSION, $wab_test_options['wab_version'] );

		WAB_Upgrader::maybe_upgrade();

		$this->assertEquals( WAB_VERSION, $wab_test_options['wab_version'] );
	}

	/**
	 * Test get_table_name returns prefixed name.
	 */
	public function test_get_table_name_returns_prefixed_name(): void {
		global $wpdb;

		$wpdb = new \stdClass();
		$wpdb->prefix = 'wp_';

		$result = WAB_Upgrader::get_table_name( 'wab_queue' );

		$this->assertEquals( 'wp_wab_queue', $result );
	}

	/**
	 * Test get_table_name with custom prefix.
	 */
	public function test_get_table_name_with_custom_prefix(): void {
		global $wpdb;

		$wpdb = new \stdClass();
		$wpdb->prefix = 'mysite_';

		$result = WAB_Upgrader::get_table_name( 'wab_log' );

		$this->assertEquals( 'mysite_wab_log', $result );
	}

	/**
	 * Test REQUIRED_TABLES constant contains expected tables.
	 */
	public function test_required_tables_constant(): void {
		$tables = WAB_Upgrader::REQUIRED_TABLES;

		$this->assertContains( 'wab_queue', $tables );
		$this->assertContains( 'wab_log', $tables );
		$this->assertContains( 'wab_touchpoints', $tables );
		$this->assertContains( 'wab_identities', $tables );
		$this->assertContains( 'wab_surveys', $tables );
		$this->assertCount( 5, $tables );
	}

	/**
	 * Test verify_tables populates cache.
	 */
	public function test_verify_tables_populates_cache(): void {
		global $wpdb;

		$call_count = 0;

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			if ( ! empty( $args ) ) {
				return str_replace( '%s', $args[0], $query );
			}
			return $query;
		} );
		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function( $query ) use ( &$call_count ) {
			$call_count++;
			// Return the table name if it's a table existence check.
			foreach ( WAB_Upgrader::REQUIRED_TABLES as $table ) {
				if ( strpos( $query, 'wp_' . $table ) !== false ) {
					return 'wp_' . $table;
				}
			}
			return null;
		} );
		$wpdb->shouldReceive( 'get_charset_collate' )->andReturn( 'utf8mb4_unicode_ci' );

		// Mock dbDelta just in case.
		Functions\when( 'dbDelta' )->justReturn( [] );

		// Clear cache first.
		WAB_Upgrader::clear_cache();

		// Verify tables - will check all 5 tables.
		WAB_Upgrader::verify_tables();

		$calls_after_verify = $call_count;

		// Now table_exists should use cache and not hit the database again.
		$result = WAB_Upgrader::table_exists( 'wab_queue' );

		$this->assertTrue( $result );
		$this->assertEquals( $calls_after_verify, $call_count, 'get_var should not be called again after verify_tables' );
	}

	/**
	 * Test get_missing_tables returns only missing tables.
	 */
	public function test_get_missing_tables(): void {
		global $wpdb;

		// Clear cache first to ensure fresh queries.
		WAB_Upgrader::clear_cache();

		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';

		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			// Substitute %s with the argument.
			if ( ! empty( $args ) ) {
				return str_replace( '%s', $args[0], $query );
			}
			return $query;
		} );

		// Some tables missing.
		$wpdb->shouldReceive( 'get_var' )->andReturnUsing( function( $query ) {
			if ( strpos( $query, 'wp_wab_queue' ) !== false ) {
				return 'wp_wab_queue';
			}
			if ( strpos( $query, 'wp_wab_log' ) !== false ) {
				return 'wp_wab_log';
			}
			if ( strpos( $query, 'wp_wab_touchpoints' ) !== false ) {
				return null; // Missing.
			}
			if ( strpos( $query, 'wp_wab_identities' ) !== false ) {
				return null; // Missing.
			}
			if ( strpos( $query, 'wp_wab_surveys' ) !== false ) {
				return 'wp_wab_surveys';
			}
			return null;
		} );

		$missing = WAB_Upgrader::get_missing_tables();

		$this->assertContains( 'wab_touchpoints', $missing );
		$this->assertContains( 'wab_identities', $missing );
		$this->assertNotContains( 'wab_queue', $missing );
		$this->assertNotContains( 'wab_log', $missing );
		$this->assertNotContains( 'wab_surveys', $missing );
	}
}
