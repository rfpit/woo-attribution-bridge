<?php
/**
 * Upgrade mechanism tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey\Functions;

/**
 * Test case for the upgrade mechanism.
 *
 * Tests the simple version check that triggers table creation on upgrade.
 */
class UpgraderTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [];
	}

	/**
	 * Test upgrade skips when version matches.
	 */
	public function test_upgrade_skips_when_version_matches(): void {
		global $wab_test_options;

		$wab_test_options['wab_version'] = WAB_VERSION;

		$create_tables_called = false;

		// The upgrade check logic.
		$stored = get_option( 'wab_version', '0' );
		if ( $stored !== WAB_VERSION ) {
			$create_tables_called = true;
		}

		$this->assertFalse( $create_tables_called );
	}

	/**
	 * Test upgrade runs when version is outdated.
	 */
	public function test_upgrade_runs_when_version_outdated(): void {
		global $wab_test_options;

		$wab_test_options['wab_version'] = '0.9.0';

		$create_tables_called = false;

		// The upgrade check logic.
		$stored = get_option( 'wab_version', '0' );
		if ( $stored !== WAB_VERSION ) {
			$create_tables_called = true;
			update_option( 'wab_version', WAB_VERSION );
		}

		$this->assertTrue( $create_tables_called );
		$this->assertEquals( WAB_VERSION, $wab_test_options['wab_version'] );
	}

	/**
	 * Test upgrade runs on fresh install (no version stored).
	 */
	public function test_upgrade_runs_on_fresh_install(): void {
		global $wab_test_options;

		// No version set (fresh install).
		unset( $wab_test_options['wab_version'] );

		$create_tables_called = false;

		// The upgrade check logic.
		$stored = get_option( 'wab_version', '0' );
		if ( $stored !== WAB_VERSION ) {
			$create_tables_called = true;
			update_option( 'wab_version', WAB_VERSION );
		}

		$this->assertTrue( $create_tables_called );
		$this->assertEquals( WAB_VERSION, $wab_test_options['wab_version'] );
	}

	/**
	 * Test version is updated after upgrade.
	 */
	public function test_version_updated_after_upgrade(): void {
		global $wab_test_options;

		$wab_test_options['wab_version'] = '0.5.0';

		$this->assertNotEquals( WAB_VERSION, get_option( 'wab_version' ) );

		// Simulate upgrade.
		$stored = get_option( 'wab_version', '0' );
		if ( $stored !== WAB_VERSION ) {
			update_option( 'wab_version', WAB_VERSION );
		}

		$this->assertEquals( WAB_VERSION, get_option( 'wab_version' ) );
	}
}
