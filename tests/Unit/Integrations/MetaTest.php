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

	/**
	 * Test prepare_payload returns correct structure.
	 */
	public function test_prepare_payload_structure(): void {
		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$payload = $meta->prepare_payload( $order, [ 'fbclid' => 'test_click' ] );

		$this->assertArrayHasKey( 'data', $payload );
		$this->assertCount( 1, $payload['data'] );
		$this->assertEquals( 'Purchase', $payload['data'][0]['event_name'] );
		$this->assertArrayHasKey( 'event_time', $payload['data'][0] );
		$this->assertArrayHasKey( 'event_id', $payload['data'][0] );
		$this->assertArrayHasKey( 'user_data', $payload['data'][0] );
		$this->assertArrayHasKey( 'custom_data', $payload['data'][0] );
	}

	/**
	 * Test prepare_payload has hashed user data.
	 */
	public function test_prepare_payload_user_data_hashed(): void {
		$order = $this->create_mock_order( 123, [
			'billing_email' => 'Test@Example.com',
		] );
		$meta  = new WAB_Meta();

		$payload   = $meta->prepare_payload( $order, [] );
		$user_data = $payload['data'][0]['user_data'];

		// Email should be hashed.
		$this->assertArrayHasKey( 'em', $user_data );
		$expected_hash = hash( 'sha256', 'test@example.com' );
		$this->assertEquals( [ $expected_hash ], $user_data['em'] );
	}

	/**
	 * Test prepare_payload converts fbclid to fbc format.
	 */
	public function test_prepare_payload_fbc_formatted(): void {
		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$payload   = $meta->prepare_payload( $order, [ 'fbclid' => 'AbCdEf123' ] );
		$user_data = $payload['data'][0]['user_data'];

		$this->assertArrayHasKey( 'fbc', $user_data );
		$this->assertStringStartsWith( 'fb.1.', $user_data['fbc'] );
		$this->assertStringEndsWith( '.AbCdEf123', $user_data['fbc'] );
	}

	/**
	 * Test prepare_payload passes through already-formatted fbc.
	 */
	public function test_prepare_payload_fbc_passthrough(): void {
		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$fbc       = 'fb.1.1704067200000.AbCdEf123';
		$payload   = $meta->prepare_payload( $order, [ 'fbclid' => $fbc ] );
		$user_data = $payload['data'][0]['user_data'];

		$this->assertEquals( $fbc, $user_data['fbc'] );
	}

	/**
	 * Test prepare_payload without fbclid.
	 */
	public function test_prepare_payload_no_fbclid(): void {
		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$payload   = $meta->prepare_payload( $order, [] );
		$user_data = $payload['data'][0]['user_data'];

		$this->assertArrayNotHasKey( 'fbc', $user_data );
	}

	/**
	 * Test prepare_payload includes fbp when present.
	 */
	public function test_prepare_payload_fbp_included(): void {
		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$fbp       = 'fb.1.1704067200000.987654321';
		$payload   = $meta->prepare_payload( $order, [ 'fbp' => $fbp ] );
		$user_data = $payload['data'][0]['user_data'];

		$this->assertEquals( $fbp, $user_data['fbp'] );
	}

	/**
	 * Test prepare_payload custom_data structure.
	 */
	public function test_prepare_payload_custom_data(): void {
		$order = $this->create_mock_order( 123, [
			'currency' => 'GBP',
			'total'    => 99.99,
		] );
		$meta  = new WAB_Meta();

		$payload     = $meta->prepare_payload( $order, [] );
		$custom_data = $payload['data'][0]['custom_data'];

		$this->assertEquals( 'GBP', $custom_data['currency'] );
		$this->assertEquals( 99.99, $custom_data['value'] );
		$this->assertEquals( '123', $custom_data['order_id'] );
		$this->assertEquals( 'product', $custom_data['content_type'] );
	}

	/**
	 * Test prepare_payload event_id is stable.
	 */
	public function test_prepare_payload_event_id_stable(): void {
		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$payload1 = $meta->prepare_payload( $order, [] );
		$payload2 = $meta->prepare_payload( $order, [] );

		$this->assertEquals(
			$payload1['data'][0]['event_id'],
			$payload2['data'][0]['event_id'],
			'Event ID should be stable for same order'
		);
	}

	/**
	 * Test should_send returns true when enabled and configured.
	 */
	public function test_should_send_enabled_configured(): void {
		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$result = $meta->should_send( $order, [ 'fbclid' => 'test_click' ] );

		$this->assertTrue( $result );
	}

	/**
	 * Test should_send returns false when disabled.
	 */
	public function test_should_send_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_meta_enabled'] = false;

		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$result = $meta->should_send( $order, [ 'fbclid' => 'test_click' ] );

		$this->assertFalse( $result );
	}

	/**
	 * Test should_send returns true without click ID.
	 */
	public function test_should_send_without_click_id(): void {
		$order = $this->create_mock_order( 123 );
		$meta  = new WAB_Meta();

		$result = $meta->should_send( $order, [] );

		$this->assertTrue( $result, 'Meta should support sending without fbclid' );
	}

	/**
	 * Test user data email is lowercased before hashing.
	 */
	public function test_user_data_email_lowercase(): void {
		$order = $this->create_mock_order( 123, [
			'billing_email' => 'TEST@EXAMPLE.COM',
		] );
		$meta  = new WAB_Meta();

		$payload = $meta->prepare_payload( $order, [] );

		$expected_hash = hash( 'sha256', 'test@example.com' );
		$this->assertEquals( [ $expected_hash ], $payload['data'][0]['user_data']['em'] );
	}

	/**
	 * Test user data phone is digits only.
	 */
	public function test_user_data_phone_digits_only(): void {
		$order = $this->create_mock_order( 123, [
			'billing_phone' => '+1 (555) 123-4567',
		] );
		$meta  = new WAB_Meta();

		$payload = $meta->prepare_payload( $order, [] );

		// Phone should be hashed with only digits.
		$expected_hash = hash( 'sha256', '15551234567' );
		$this->assertEquals( [ $expected_hash ], $payload['data'][0]['user_data']['ph'] );
	}

	/**
	 * Test optional user data fields are omitted when empty.
	 */
	public function test_user_data_optional_fields(): void {
		$order = $this->create_mock_order( 123, [
			'billing_phone' => '', // Empty phone
		] );
		$meta  = new WAB_Meta();

		$payload   = $meta->prepare_payload( $order, [] );
		$user_data = $payload['data'][0]['user_data'];

		$this->assertArrayNotHasKey( 'ph', $user_data, 'Empty phone should not be in payload' );
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
