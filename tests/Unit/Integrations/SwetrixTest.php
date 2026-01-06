<?php
/**
 * Swetrix integration tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit\Integrations;

use WAB\Tests\Unit\WabTestCase;
use WAB_Swetrix;

/**
 * Test class for WAB_Swetrix integration.
 */
class SwetrixTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_swetrix_enabled'    => true,
			'wab_swetrix_project_id' => 'test_project_id',
			'wab_swetrix_api_url'    => '',
			'wab_dedup_enabled'      => true,
			'wab_debug_mode'         => false,
			'active_plugins'         => [],
		];
	}

	/**
	 * Test integration ID is correct.
	 */
	public function test_integration_id(): void {
		$swetrix = new WAB_Swetrix();
		$this->assertEquals( 'swetrix', $swetrix->get_id() );
	}

	/**
	 * Test integration name is correct.
	 */
	public function test_integration_name(): void {
		$swetrix = new WAB_Swetrix();
		$this->assertEquals( 'Swetrix', $swetrix->get_name() );
	}

	/**
	 * Test is_enabled returns true when enabled.
	 */
	public function test_is_enabled_returns_true_when_enabled(): void {
		$swetrix = new WAB_Swetrix();
		$this->assertTrue( $swetrix->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when disabled.
	 */
	public function test_is_enabled_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_swetrix_enabled'] = false;

		$swetrix = new WAB_Swetrix();
		$this->assertFalse( $swetrix->is_enabled() );
	}

	/**
	 * Test is_configured returns true when project_id present.
	 */
	public function test_is_configured_returns_true_when_configured(): void {
		$swetrix = new WAB_Swetrix();
		$this->assertTrue( $swetrix->is_configured() );
	}

	/**
	 * Test is_configured returns false when project_id missing.
	 */
	public function test_is_configured_returns_false_when_project_id_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_swetrix_project_id'] = '';

		$swetrix = new WAB_Swetrix();
		$this->assertFalse( $swetrix->is_configured() );
	}

	/**
	 * Test get_required_settings returns correct settings.
	 */
	public function test_get_required_settings(): void {
		$swetrix  = new WAB_Swetrix();
		$required = $swetrix->get_required_settings();

		$this->assertContains( 'wab_swetrix_project_id', $required );
	}

	/**
	 * Test Swetrix has no click ID parameter.
	 */
	public function test_no_click_id_parameter(): void {
		$swetrix     = new WAB_Swetrix();
		$attribution = [
			'fbclid' => 'test_fb_click_id',
			'gclid'  => 'test_google_click_id',
		];

		$click_id = $swetrix->get_click_id( $attribution );

		$this->assertNull( $click_id );
	}

	/**
	 * Test Swetrix supports sending without click ID.
	 */
	public function test_supports_sending_without_click_id(): void {
		$swetrix = new WAB_Swetrix();

		$reflection = new \ReflectionClass( $swetrix );
		$method     = $reflection->getMethod( 'supports_sending_without_click_id' );
		$method->setAccessible( true );

		$this->assertTrue( $method->invoke( $swetrix ) );
	}

	/**
	 * Test auto_detect_project_id from common option.
	 */
	public function test_auto_detect_project_id(): void {
		global $wab_test_options;
		$wab_test_options['wab_swetrix_project_id'] = '';
		$wab_test_options['swetrix_project_id']     = 'auto_detected_id';

		$swetrix = new WAB_Swetrix();
		$result  = $swetrix->auto_detect_project_id();

		$this->assertEquals( 'auto_detected_id', $result );
	}

	/**
	 * Test auto_detect_project_id from alternative option.
	 */
	public function test_auto_detect_project_id_from_pid(): void {
		global $wab_test_options;
		$wab_test_options['wab_swetrix_project_id'] = '';
		$wab_test_options['swetrix_pid']            = 'pid_detected';

		$swetrix = new WAB_Swetrix();
		$result  = $swetrix->auto_detect_project_id();

		$this->assertEquals( 'pid_detected', $result );
	}

	/**
	 * Test auto_detect_project_id from settings array.
	 */
	public function test_auto_detect_project_id_from_settings_array(): void {
		global $wab_test_options;
		$wab_test_options['wab_swetrix_project_id'] = '';
		$wab_test_options['swetrix_settings']       = [ 'project_id' => 'settings_array_id' ];

		$swetrix = new WAB_Swetrix();
		$result  = $swetrix->auto_detect_project_id();

		$this->assertEquals( 'settings_array_id', $result );
	}

	/**
	 * Test auto_detect_project_id returns null when not found.
	 */
	public function test_auto_detect_project_id_returns_null_when_not_found(): void {
		global $wab_test_options;
		$wab_test_options['wab_swetrix_project_id'] = '';

		$swetrix = new WAB_Swetrix();
		$result  = $swetrix->auto_detect_project_id();

		$this->assertNull( $result );
	}

	/**
	 * Test is_plugin_active returns false when no Swetrix plugin active.
	 */
	public function test_is_plugin_active_returns_false_when_not_active(): void {
		global $wab_test_options;
		$wab_test_options['active_plugins'] = [];

		$result = WAB_Swetrix::is_plugin_active();

		$this->assertFalse( $result );
	}

	/**
	 * Test is_plugin_active returns true when Swetrix option exists.
	 */
	public function test_is_plugin_active_returns_true_when_option_exists(): void {
		global $wab_test_options;
		$wab_test_options['swetrix_project_id'] = 'some_id';

		$result = WAB_Swetrix::is_plugin_active();

		$this->assertTrue( $result );
	}

	/**
	 * Test is_plugin_active returns true when Swetrix in active plugins.
	 */
	public function test_is_plugin_active_returns_true_when_in_active_plugins(): void {
		global $wab_test_options;
		$wab_test_options['active_plugins'] = [ 'swetrix/swetrix.php' ];

		$result = WAB_Swetrix::is_plugin_active();

		$this->assertTrue( $result );
	}

	/**
	 * Test validate_settings with all settings present.
	 */
	public function test_validate_settings_with_all_present(): void {
		$swetrix    = new WAB_Swetrix();
		$validation = $swetrix->validate_settings();

		$this->assertTrue( $validation['valid'] );
		$this->assertEmpty( $validation['missing'] );
	}

	/**
	 * Test validate_settings with missing settings.
	 */
	public function test_validate_settings_with_missing_settings(): void {
		global $wab_test_options;
		$wab_test_options['wab_swetrix_project_id'] = '';

		$swetrix    = new WAB_Swetrix();
		$validation = $swetrix->validate_settings();

		$this->assertFalse( $validation['valid'] );
		$this->assertContains( 'wab_swetrix_project_id', $validation['missing'] );
	}
}
