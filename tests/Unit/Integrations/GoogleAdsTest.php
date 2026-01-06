<?php
/**
 * Google Ads integration tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit\Integrations;

use WAB\Tests\Unit\WabTestCase;
use WAB_Google_Ads;

/**
 * Test class for WAB_Google_Ads integration.
 */
class GoogleAdsTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_google_enabled'             => true,
			'wab_google_customer_id'         => '123-456-7890',
			'wab_google_conversion_action_id' => '12345',
			'wab_google_access_token'        => 'test_access_token',
			'wab_google_developer_token'     => 'test_developer_token',
			'wab_google_enhanced_conversions' => false,
			'wab_dedup_enabled'              => true,
			'wab_debug_mode'                 => false,
		];
	}

	/**
	 * Test integration ID is correct.
	 */
	public function test_integration_id(): void {
		$google = new WAB_Google_Ads();
		$this->assertEquals( 'google', $google->get_id() );
	}

	/**
	 * Test integration name is correct.
	 */
	public function test_integration_name(): void {
		$google = new WAB_Google_Ads();
		$this->assertEquals( 'Google Ads', $google->get_name() );
	}

	/**
	 * Test is_enabled returns true when enabled.
	 */
	public function test_is_enabled_returns_true_when_enabled(): void {
		$google = new WAB_Google_Ads();
		$this->assertTrue( $google->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when disabled.
	 */
	public function test_is_enabled_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_enabled'] = false;

		$google = new WAB_Google_Ads();
		$this->assertFalse( $google->is_enabled() );
	}

	/**
	 * Test is_configured returns true when all settings present.
	 */
	public function test_is_configured_returns_true_when_configured(): void {
		$google = new WAB_Google_Ads();
		$this->assertTrue( $google->is_configured() );
	}

	/**
	 * Test is_configured returns false when customer_id missing.
	 */
	public function test_is_configured_returns_false_when_customer_id_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_customer_id'] = '';

		$google = new WAB_Google_Ads();
		$this->assertFalse( $google->is_configured() );
	}

	/**
	 * Test is_configured returns false when conversion_action_id missing.
	 */
	public function test_is_configured_returns_false_when_conversion_action_id_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_conversion_action_id'] = '';

		$google = new WAB_Google_Ads();
		$this->assertFalse( $google->is_configured() );
	}

	/**
	 * Test get_required_settings returns correct settings.
	 */
	public function test_get_required_settings(): void {
		$google   = new WAB_Google_Ads();
		$required = $google->get_required_settings();

		$this->assertContains( 'wab_google_customer_id', $required );
		$this->assertContains( 'wab_google_conversion_action_id', $required );
		$this->assertContains( 'wab_google_access_token', $required );
	}

	/**
	 * Test get_click_id extracts gclid.
	 */
	public function test_get_click_id_extracts_gclid(): void {
		$google      = new WAB_Google_Ads();
		$attribution = [
			'gclid'  => 'test_google_click_id_123',
			'fbclid' => 'test_fb_click_id',
		];

		$click_id = $google->get_click_id( $attribution );

		$this->assertEquals( 'test_google_click_id_123', $click_id );
	}

	/**
	 * Test get_click_id returns null when gclid missing.
	 */
	public function test_get_click_id_returns_null_when_missing(): void {
		$google      = new WAB_Google_Ads();
		$attribution = [
			'fbclid' => 'test_fb_click_id',
		];

		$click_id = $google->get_click_id( $attribution );

		$this->assertNull( $click_id );
	}

	/**
	 * Test Google Ads does not support sending without click ID by default.
	 */
	public function test_does_not_support_sending_without_click_id_by_default(): void {
		$google = new WAB_Google_Ads();

		// Use reflection to test protected method.
		$reflection = new \ReflectionClass( $google );
		$method     = $reflection->getMethod( 'supports_sending_without_click_id' );
		$method->setAccessible( true );

		$this->assertFalse( $method->invoke( $google ) );
	}

	/**
	 * Test Google Ads supports sending without click ID when enhanced conversions enabled.
	 */
	public function test_supports_sending_without_click_id_when_enhanced_enabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_enhanced_conversions'] = true;

		$google = new WAB_Google_Ads();

		$reflection = new \ReflectionClass( $google );
		$method     = $reflection->getMethod( 'supports_sending_without_click_id' );
		$method->setAccessible( true );

		$this->assertTrue( $method->invoke( $google ) );
	}

	/**
	 * Test validate_settings with all settings present.
	 */
	public function test_validate_settings_with_all_present(): void {
		$google     = new WAB_Google_Ads();
		$validation = $google->validate_settings();

		$this->assertTrue( $validation['valid'] );
		$this->assertEmpty( $validation['missing'] );
	}

	/**
	 * Test validate_settings with missing settings.
	 */
	public function test_validate_settings_with_missing_settings(): void {
		global $wab_test_options;
		$wab_test_options['wab_google_customer_id'] = '';
		$wab_test_options['wab_google_access_token'] = '';

		$google     = new WAB_Google_Ads();
		$validation = $google->validate_settings();

		$this->assertFalse( $validation['valid'] );
		$this->assertContains( 'wab_google_customer_id', $validation['missing'] );
		$this->assertContains( 'wab_google_access_token', $validation['missing'] );
	}
}
