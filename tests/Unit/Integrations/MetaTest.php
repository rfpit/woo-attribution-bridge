<?php
/**
 * Meta integration tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit\Integrations;

use WAB\Tests\Unit\WabTestCase;
use WAB_Meta;

/**
 * Test class for WAB_Meta integration.
 */
class MetaTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_meta_enabled'      => true,
			'wab_meta_pixel_id'     => '123456789',
			'wab_meta_access_token' => 'test_access_token',
			'wab_dedup_enabled'     => true,
			'wab_debug_mode'        => false,
		];
	}

	/**
	 * Test integration ID is correct.
	 */
	public function test_integration_id(): void {
		$meta = new WAB_Meta();
		$this->assertEquals( 'meta', $meta->get_id() );
	}

	/**
	 * Test integration name is correct.
	 */
	public function test_integration_name(): void {
		$meta = new WAB_Meta();
		$this->assertEquals( 'Meta (Facebook/Instagram)', $meta->get_name() );
	}

	/**
	 * Test is_enabled returns true when enabled.
	 */
	public function test_is_enabled_returns_true_when_enabled(): void {
		$meta = new WAB_Meta();
		$this->assertTrue( $meta->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when disabled.
	 */
	public function test_is_enabled_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_meta_enabled'] = false;

		$meta = new WAB_Meta();
		$this->assertFalse( $meta->is_enabled() );
	}

	/**
	 * Test is_configured returns true when all settings present.
	 */
	public function test_is_configured_returns_true_when_configured(): void {
		$meta = new WAB_Meta();
		$this->assertTrue( $meta->is_configured() );
	}

	/**
	 * Test is_configured returns false when pixel_id missing.
	 */
	public function test_is_configured_returns_false_when_pixel_id_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_meta_pixel_id'] = '';

		$meta = new WAB_Meta();
		$this->assertFalse( $meta->is_configured() );
	}

	/**
	 * Test is_configured returns false when access_token missing.
	 */
	public function test_is_configured_returns_false_when_access_token_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_meta_access_token'] = '';

		$meta = new WAB_Meta();
		$this->assertFalse( $meta->is_configured() );
	}

	/**
	 * Test get_required_settings returns correct settings.
	 */
	public function test_get_required_settings(): void {
		$meta     = new WAB_Meta();
		$required = $meta->get_required_settings();

		$this->assertContains( 'wab_meta_pixel_id', $required );
		$this->assertContains( 'wab_meta_access_token', $required );
	}

	/**
	 * Test get_click_id extracts fbclid.
	 */
	public function test_get_click_id_extracts_fbclid(): void {
		$meta        = new WAB_Meta();
		$attribution = [
			'fbclid' => 'test_fb_click_id_123',
			'gclid'  => 'test_google_click_id',
		];

		$click_id = $meta->get_click_id( $attribution );

		$this->assertEquals( 'test_fb_click_id_123', $click_id );
	}

	/**
	 * Test get_click_id returns null when fbclid missing.
	 */
	public function test_get_click_id_returns_null_when_missing(): void {
		$meta        = new WAB_Meta();
		$attribution = [
			'gclid' => 'test_google_click_id',
		];

		$click_id = $meta->get_click_id( $attribution );

		$this->assertNull( $click_id );
	}

	/**
	 * Test validate_settings with all settings present.
	 */
	public function test_validate_settings_with_all_present(): void {
		$meta       = new WAB_Meta();
		$validation = $meta->validate_settings();

		$this->assertTrue( $validation['valid'] );
		$this->assertEmpty( $validation['missing'] );
	}

	/**
	 * Test validate_settings with missing settings.
	 */
	public function test_validate_settings_with_missing_settings(): void {
		global $wab_test_options;
		$wab_test_options['wab_meta_pixel_id'] = '';

		$meta       = new WAB_Meta();
		$validation = $meta->validate_settings();

		$this->assertFalse( $validation['valid'] );
		$this->assertContains( 'wab_meta_pixel_id', $validation['missing'] );
	}

	/**
	 * Test Meta supports sending without click ID.
	 */
	public function test_supports_sending_without_click_id(): void {
		$meta = new WAB_Meta();

		// Use reflection to test protected method.
		$reflection = new \ReflectionClass( $meta );
		$method     = $reflection->getMethod( 'supports_sending_without_click_id' );
		$method->setAccessible( true );

		$this->assertTrue( $method->invoke( $meta ) );
	}
}
