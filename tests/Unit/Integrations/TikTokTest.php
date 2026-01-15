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

	/**
	 * Test prepare_payload returns correct structure.
	 */
	public function test_prepare_payload_structure(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [] );

		$this->assertArrayHasKey( 'pixel_code', $payload );
		$this->assertArrayHasKey( 'event', $payload );
		$this->assertArrayHasKey( 'event_id', $payload );
		$this->assertArrayHasKey( 'timestamp', $payload );
		$this->assertArrayHasKey( 'context', $payload );
		$this->assertArrayHasKey( 'properties', $payload );
		$this->assertEquals( 'CompletePayment', $payload['event'] );
		$this->assertEquals( 'test_pixel_code', $payload['pixel_code'] );
	}

	/**
	 * Test prepare_payload user data is hashed.
	 */
	public function test_prepare_payload_user_hashed(): void {
		$order  = $this->create_mock_order( 123, [
			'billing_email' => 'Test@Example.com',
			'billing_phone' => '+44 123 456 7890',
		] );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [] );
		$user    = $payload['context']['user'];

		// Email should be hashed (lowercase).
		$expected_email_hash = hash( 'sha256', 'test@example.com' );
		$this->assertEquals( $expected_email_hash, $user['email'] );

		// Phone should be hashed (digits only).
		$expected_phone_hash = hash( 'sha256', '441234567890' );
		$this->assertEquals( $expected_phone_hash, $user['phone'] );
	}

	/**
	 * Test prepare_payload includes ttclid when present.
	 */
	public function test_prepare_payload_ttclid_included(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [ 'ttclid' => 'test_tiktok_click_123' ] );
		$user    = $payload['context']['user'];

		$this->assertArrayHasKey( 'ttclid', $user );
		$this->assertEquals( 'test_tiktok_click_123', $user['ttclid'] );
	}

	/**
	 * Test prepare_payload has no ttclid when not provided.
	 */
	public function test_prepare_payload_no_ttclid(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [] );
		$user    = $payload['context']['user'];

		$this->assertArrayNotHasKey( 'ttclid', $user );
	}

	/**
	 * Test prepare_payload includes _ttp (browser pixel ID) when present.
	 */
	public function test_prepare_payload_ttp_included(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [ '_ttp' => 'browser_pixel_id_123' ] );
		$user    = $payload['context']['user'];

		$this->assertArrayHasKey( 'ttp', $user );
		$this->assertEquals( 'browser_pixel_id_123', $user['ttp'] );
	}

	/**
	 * Test prepare_payload external_id is hashed.
	 */
	public function test_prepare_payload_external_id_hashed(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [] );
		$user    = $payload['context']['user'];

		$this->assertArrayHasKey( 'external_id', $user );
		// Should be a SHA256 hash (64 hex chars).
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', $user['external_id'] );
		// Should NOT be the plain order ID.
		$this->assertNotEquals( '123', $user['external_id'] );
	}

	/**
	 * Test prepare_payload contents are populated.
	 */
	public function test_prepare_payload_contents(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload    = $tiktok->prepare_payload( $order, [] );
		$properties = $payload['properties'];

		$this->assertArrayHasKey( 'contents', $properties );
		$this->assertIsArray( $properties['contents'] );
		$this->assertArrayHasKey( 'currency', $properties );
		$this->assertArrayHasKey( 'value', $properties );
		$this->assertEquals( 'GBP', $properties['currency'] );
		$this->assertEquals( 99.99, $properties['value'] );
	}

	/**
	 * Test prepare_payload event_id is stable.
	 */
	public function test_prepare_payload_event_id_stable(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload1 = $tiktok->prepare_payload( $order, [] );
		$payload2 = $tiktok->prepare_payload( $order, [] );

		$this->assertEquals(
			$payload1['event_id'],
			$payload2['event_id'],
			'Event ID should be stable for same order'
		);
	}

	/**
	 * Test prepare_payload page URL is set.
	 */
	public function test_prepare_payload_page_url(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [] );

		$this->assertArrayHasKey( 'page', $payload['context'] );
		$this->assertArrayHasKey( 'url', $payload['context']['page'] );
	}

	/**
	 * Test should_send returns true when enabled and configured.
	 */
	public function test_should_send_enabled_configured(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$result = $tiktok->should_send( $order, [ 'ttclid' => 'test_click' ] );

		$this->assertTrue( $result );
	}

	/**
	 * Test should_send returns false when disabled.
	 */
	public function test_should_send_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_tiktok_enabled'] = false;

		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$result = $tiktok->should_send( $order, [ 'ttclid' => 'test_click' ] );

		$this->assertFalse( $result );
	}

	/**
	 * Test should_send returns true without ttclid.
	 */
	public function test_should_send_no_ttclid(): void {
		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$result = $tiktok->should_send( $order, [] );

		$this->assertTrue( $result, 'TikTok should support sending without ttclid' );
	}

	/**
	 * Test context includes IP when available.
	 */
	public function test_context_includes_ip(): void {
		// Set IP in $_SERVER.
		$_SERVER['REMOTE_ADDR'] = '192.168.1.100';

		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [] );

		$this->assertArrayHasKey( 'ip', $payload['context'] );
		$this->assertEquals( '192.168.1.100', $payload['context']['ip'] );

		// Clean up.
		unset( $_SERVER['REMOTE_ADDR'] );
	}

	/**
	 * Test context includes user agent when available.
	 */
	public function test_context_includes_user_agent(): void {
		// Set user agent in $_SERVER.
		$_SERVER['HTTP_USER_AGENT'] = 'Mozilla/5.0 Test Browser';

		$order  = $this->create_mock_order( 123 );
		$tiktok = new WAB_TikTok();

		$payload = $tiktok->prepare_payload( $order, [] );

		$this->assertArrayHasKey( 'user_agent', $payload['context'] );
		$this->assertEquals( 'Mozilla/5.0 Test Browser', $payload['context']['user_agent'] );

		// Clean up.
		unset( $_SERVER['HTTP_USER_AGENT'] );
	}

	/**
	 * Test properties includes order_id.
	 */
	public function test_properties_includes_order_id(): void {
		$order  = $this->create_mock_order( 456 );
		$tiktok = new WAB_TikTok();

		$payload    = $tiktok->prepare_payload( $order, [] );
		$properties = $payload['properties'];

		$this->assertArrayHasKey( 'order_id', $properties );
		$this->assertEquals( '456', $properties['order_id'] );
	}

	/**
	 * Create a mock WC_Order for testing.
	 *
	 * @param int   $id    Order ID.
	 * @param array $props Order properties.
	 * @return \WC_Order
	 */
	private function create_mock_order( int $id, array $props = [] ): \WC_Order {
		$order = new \WC_Order( $id );

		$defaults = [
			'billing_email'      => 'test@example.com',
			'billing_phone'      => '1234567890',
			'billing_first_name' => 'John',
			'billing_last_name'  => 'Doe',
			'billing_city'       => 'London',
			'billing_state'      => 'Greater London',
			'billing_postcode'   => 'SW1A 1AA',
			'billing_country'    => 'GB',
			'currency'           => 'GBP',
			'total'              => '99.99',
		];

		$props = array_merge( $defaults, $props );

		if ( isset( $props['billing_email'] ) ) {
			$order->set_billing_email( $props['billing_email'] );
		}
		if ( isset( $props['billing_phone'] ) ) {
			$order->set_billing_phone( $props['billing_phone'] );
		}
		if ( isset( $props['billing_first_name'] ) ) {
			$order->set_billing_first_name( $props['billing_first_name'] );
		}
		if ( isset( $props['billing_last_name'] ) ) {
			$order->set_billing_last_name( $props['billing_last_name'] );
		}
		if ( isset( $props['billing_city'] ) ) {
			$order->set_billing_city( $props['billing_city'] );
		}
		if ( isset( $props['billing_state'] ) ) {
			$order->set_billing_state( $props['billing_state'] );
		}
		if ( isset( $props['billing_postcode'] ) ) {
			$order->set_billing_postcode( $props['billing_postcode'] );
		}
		if ( isset( $props['billing_country'] ) ) {
			$order->set_billing_country( $props['billing_country'] );
		}
		if ( isset( $props['currency'] ) ) {
			$order->set_currency( $props['currency'] );
		}
		if ( isset( $props['total'] ) ) {
			$order->set_total( $props['total'] );
		}

		return $order;
	}
}
