<?php
/**
 * Cookie handler tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use WAB_Cookie;

/**
 * Test class for WAB_Cookie.
 */
class CookieTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_cookie_name'   => 'wab_attribution',
			'wab_cookie_expiry' => 90,
			'wab_capture_fbclid' => true,
			'wab_capture_gclid'  => true,
			'wab_capture_ttclid' => true,
			'wab_capture_utm'    => true,
		];

		// Clear cookies between tests.
		$_COOKIE = [];
	}

	/**
	 * Test default cookie name.
	 */
	public function test_get_cookie_name_returns_default(): void {
		$cookie = new WAB_Cookie();
		$this->assertEquals( 'wab_attribution', $cookie->get_cookie_name() );
	}

	/**
	 * Test custom cookie name.
	 */
	public function test_get_cookie_name_returns_custom(): void {
		global $wab_test_options;
		$wab_test_options['wab_cookie_name'] = 'custom_cookie';

		$cookie = new WAB_Cookie();
		$this->assertEquals( 'custom_cookie', $cookie->get_cookie_name() );
	}

	/**
	 * Test visitor cookie name.
	 */
	public function test_get_visitor_cookie_name(): void {
		$cookie = new WAB_Cookie();
		$this->assertEquals( 'wab_visitor_id', $cookie->get_visitor_cookie_name() );
	}

	/**
	 * Test default cookie expiry.
	 */
	public function test_get_cookie_expiry_returns_default(): void {
		$cookie = new WAB_Cookie();
		$this->assertEquals( 90, $cookie->get_cookie_expiry() );
	}

	/**
	 * Test custom cookie expiry.
	 */
	public function test_get_cookie_expiry_returns_custom(): void {
		global $wab_test_options;
		$wab_test_options['wab_cookie_expiry'] = 30;

		$cookie = new WAB_Cookie();
		$this->assertEquals( 30, $cookie->get_cookie_expiry() );
	}

	/**
	 * Test get attribution data returns empty when no cookie.
	 */
	public function test_get_attribution_data_returns_empty_when_no_cookie(): void {
		$cookie = new WAB_Cookie();
		$this->assertEmpty( $cookie->get_attribution_data() );
	}

	/**
	 * Test get attribution data returns data from cookie.
	 */
	public function test_get_attribution_data_returns_data_from_cookie(): void {
		$test_data = [
			'fbclid' => 'test_fb_id',
			'gclid'  => 'test_google_id',
		];

		$_COOKIE['wab_attribution'] = json_encode( $test_data );

		$cookie = new WAB_Cookie();
		$data   = $cookie->get_attribution_data();

		$this->assertEquals( 'test_fb_id', $data['fbclid'] );
		$this->assertEquals( 'test_google_id', $data['gclid'] );
	}

	/**
	 * Test get attribution data returns empty for invalid JSON.
	 */
	public function test_get_attribution_data_returns_empty_for_invalid_json(): void {
		$_COOKIE['wab_attribution'] = 'not valid json';

		$cookie = new WAB_Cookie();
		$this->assertEmpty( $cookie->get_attribution_data() );
	}

	/**
	 * Test get visitor ID returns null when no cookie.
	 */
	public function test_get_visitor_id_returns_null_when_no_cookie(): void {
		$cookie = new WAB_Cookie();
		$this->assertNull( $cookie->get_visitor_id() );
	}

	/**
	 * Test get visitor ID returns value from cookie.
	 */
	public function test_get_visitor_id_returns_value_from_cookie(): void {
		$_COOKIE['wab_visitor_id'] = 'test-visitor-uuid';

		$cookie = new WAB_Cookie();
		$this->assertEquals( 'test-visitor-uuid', $cookie->get_visitor_id() );
	}

	/**
	 * Test set attribution data updates internal cookie array.
	 */
	public function test_set_attribution_data_updates_cookie(): void {
		$cookie = new WAB_Cookie();
		$data   = [ 'fbclid' => 'new_fb_id' ];

		$cookie->set_attribution_data( $data );

		// Check that the internal $_COOKIE was updated for immediate access.
		$this->assertArrayHasKey( 'wab_attribution', $_COOKIE );
		$stored = json_decode( $_COOKIE['wab_attribution'], true );
		$this->assertEquals( 'new_fb_id', $stored['fbclid'] );
	}

	/**
	 * Test clear removes cookie data.
	 */
	public function test_clear_removes_cookie_data(): void {
		$_COOKIE['wab_attribution'] = json_encode( [ 'fbclid' => 'test' ] );

		$cookie = new WAB_Cookie();
		$cookie->clear();

		$this->assertArrayNotHasKey( 'wab_attribution', $_COOKIE );
	}
}
