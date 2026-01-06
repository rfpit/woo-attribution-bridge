<?php
/**
 * TikTok integration tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit\Integrations;

use WAB\Tests\Unit\WabTestCase;
use WAB_TikTok;

/**
 * Test class for WAB_TikTok integration.
 */
class TikTokTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_tiktok_enabled'      => true,
			'wab_tiktok_pixel_code'   => 'test_pixel_code',
			'wab_tiktok_access_token' => 'test_access_token',
			'wab_dedup_enabled'       => true,
			'wab_debug_mode'          => false,
		];
	}

	/**
	 * Test integration ID is correct.
	 */
	public function test_integration_id(): void {
		$tiktok = new WAB_TikTok();
		$this->assertEquals( 'tiktok', $tiktok->get_id() );
	}

	/**
	 * Test integration name is correct.
	 */
	public function test_integration_name(): void {
		$tiktok = new WAB_TikTok();
		$this->assertEquals( 'TikTok', $tiktok->get_name() );
	}

	/**
	 * Test is_enabled returns true when enabled.
	 */
	public function test_is_enabled_returns_true_when_enabled(): void {
		$tiktok = new WAB_TikTok();
		$this->assertTrue( $tiktok->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when disabled.
	 */
	public function test_is_enabled_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_tiktok_enabled'] = false;

		$tiktok = new WAB_TikTok();
		$this->assertFalse( $tiktok->is_enabled() );
	}

	/**
	 * Test is_configured returns true when all settings present.
	 */
	public function test_is_configured_returns_true_when_configured(): void {
		$tiktok = new WAB_TikTok();
		$this->assertTrue( $tiktok->is_configured() );
	}

	/**
	 * Test is_configured returns false when pixel_code missing.
	 */
	public function test_is_configured_returns_false_when_pixel_code_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_tiktok_pixel_code'] = '';

		$tiktok = new WAB_TikTok();
		$this->assertFalse( $tiktok->is_configured() );
	}

	/**
	 * Test is_configured returns false when access_token missing.
	 */
	public function test_is_configured_returns_false_when_access_token_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_tiktok_access_token'] = '';

		$tiktok = new WAB_TikTok();
		$this->assertFalse( $tiktok->is_configured() );
	}

	/**
	 * Test get_required_settings returns correct settings.
	 */
	public function test_get_required_settings(): void {
		$tiktok   = new WAB_TikTok();
		$required = $tiktok->get_required_settings();

		$this->assertContains( 'wab_tiktok_pixel_code', $required );
		$this->assertContains( 'wab_tiktok_access_token', $required );
	}

	/**
	 * Test get_click_id extracts ttclid.
	 */
	public function test_get_click_id_extracts_ttclid(): void {
		$tiktok      = new WAB_TikTok();
		$attribution = [
			'ttclid' => 'test_tiktok_click_id_123',
			'fbclid' => 'test_fb_click_id',
		];

		$click_id = $tiktok->get_click_id( $attribution );

		$this->assertEquals( 'test_tiktok_click_id_123', $click_id );
	}

	/**
	 * Test get_click_id returns null when ttclid missing.
	 */
	public function test_get_click_id_returns_null_when_missing(): void {
		$tiktok      = new WAB_TikTok();
		$attribution = [
			'fbclid' => 'test_fb_click_id',
		];

		$click_id = $tiktok->get_click_id( $attribution );

		$this->assertNull( $click_id );
	}

	/**
	 * Test TikTok supports sending without click ID.
	 */
	public function test_supports_sending_without_click_id(): void {
		$tiktok = new WAB_TikTok();

		$reflection = new \ReflectionClass( $tiktok );
		$method     = $reflection->getMethod( 'supports_sending_without_click_id' );
		$method->setAccessible( true );

		$this->assertTrue( $method->invoke( $tiktok ) );
	}

	/**
	 * Test validate_settings with all settings present.
	 */
	public function test_validate_settings_with_all_present(): void {
		$tiktok     = new WAB_TikTok();
		$validation = $tiktok->validate_settings();

		$this->assertTrue( $validation['valid'] );
		$this->assertEmpty( $validation['missing'] );
	}

	/**
	 * Test validate_settings with missing settings.
	 */
	public function test_validate_settings_with_missing_settings(): void {
		global $wab_test_options;
		$wab_test_options['wab_tiktok_pixel_code'] = '';

		$tiktok     = new WAB_TikTok();
		$validation = $tiktok->validate_settings();

		$this->assertFalse( $validation['valid'] );
		$this->assertContains( 'wab_tiktok_pixel_code', $validation['missing'] );
	}
}
