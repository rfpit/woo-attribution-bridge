<?php
/**
 * Dashboard integration tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit\Integrations;

use Brain\Monkey\Functions;
use WAB\Tests\Unit\WabTestCase;
use WAB_Dashboard;

/**
 * Test class for WAB_Dashboard integration.
 */
class DashboardTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_dashboard_enabled' => true,
			'wab_api_key'           => 'test_api_key_123',
			'wab_dashboard_url'     => 'https://dashboard.example.com',
			'wab_dedup_enabled'     => true,
			'wab_debug_mode'        => false,
		];

		// Reset customer orders mock.
		$GLOBALS['wab_test_customer_orders'] = [];

		// Mock wc_get_orders to use the global test data.
		Functions\when( 'wc_get_orders' )->alias( function( $args = [] ) {
			return $GLOBALS['wab_test_customer_orders'] ?? [];
		} );
	}

	/**
	 * Tear down test environment.
	 */
	protected function tearDown(): void {
		unset( $GLOBALS['wab_test_customer_orders'] );
		parent::tearDown();
	}

	/**
	 * Test integration ID is correct.
	 */
	public function test_integration_id(): void {
		$dashboard = new WAB_Dashboard();
		$this->assertEquals( 'dashboard', $dashboard->get_id() );
	}

	/**
	 * Test integration name is correct.
	 */
	public function test_integration_name(): void {
		$dashboard = new WAB_Dashboard();
		$this->assertEquals( 'WAB Dashboard', $dashboard->get_name() );
	}

	/**
	 * Test is_configured returns true when all settings present.
	 */
	public function test_is_configured_true(): void {
		$dashboard = new WAB_Dashboard();
		$this->assertTrue( $dashboard->is_configured() );
	}

	/**
	 * Test is_configured returns false when API key missing.
	 */
	public function test_is_configured_missing_key(): void {
		global $wab_test_options;
		$wab_test_options['wab_api_key'] = '';

		$dashboard = new WAB_Dashboard();
		$this->assertFalse( $dashboard->is_configured() );
	}

	/**
	 * Test is_configured returns false when dashboard URL missing.
	 */
	public function test_is_configured_missing_url(): void {
		global $wab_test_options;
		$wab_test_options['wab_dashboard_url'] = '';

		$dashboard = new WAB_Dashboard();
		$this->assertFalse( $dashboard->is_configured() );
	}

	/**
	 * Test get_required_settings returns correct settings.
	 */
	public function test_get_required_settings(): void {
		$dashboard = new WAB_Dashboard();
		$required  = $dashboard->get_required_settings();

		$this->assertContains( 'wab_api_key', $required );
		$this->assertContains( 'wab_dashboard_url', $required );
	}

	/**
	 * Test supports_sending_without_click_id returns true.
	 */
	public function test_supports_sending_without_click_id(): void {
		$dashboard = new WAB_Dashboard();

		$reflection = new \ReflectionClass( $dashboard );
		$method     = $reflection->getMethod( 'supports_sending_without_click_id' );
		$method->setAccessible( true );

		$this->assertTrue( $method->invoke( $dashboard ) );
	}

	/**
	 * Test prepare_payload event is order.created for new orders.
	 */
	public function test_prepare_payload_event_created(): void {
		$order = $this->create_mock_order( 123, [ 'status' => 'pending' ] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertEquals( 'order.created', $payload['event'] );
	}

	/**
	 * Test prepare_payload event is order.updated for processing orders.
	 */
	public function test_prepare_payload_event_updated(): void {
		$order = $this->create_mock_order( 123, [ 'status' => 'processing' ] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertEquals( 'order.updated', $payload['event'] );
	}

	/**
	 * Test prepare_payload event is order.completed for completed orders.
	 */
	public function test_prepare_payload_event_completed(): void {
		$order = $this->create_mock_order( 123, [ 'status' => 'completed' ] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertEquals( 'order.completed', $payload['event'] );
	}

	/**
	 * Test prepare_payload contains all required order data fields.
	 */
	public function test_prepare_payload_order_data(): void {
		$order = $this->create_mock_order( 456, [
			'total'          => 99.99,
			'subtotal'       => 85.00,
			'total_tax'      => 8.50,
			'shipping_total' => 6.49,
			'discount_total' => 0.00,
			'currency'       => 'GBP',
			'status'         => 'completed',
			'payment_method' => 'stripe',
		] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );
		$order_data = $payload['order'];

		$this->assertEquals( '456', $order_data['external_id'] );
		$this->assertStringContainsString( '456', $order_data['order_number'] );
		$this->assertEquals( 99.99, $order_data['total'] );
		$this->assertEquals( 85.00, $order_data['subtotal'] );
		$this->assertEquals( 8.50, $order_data['tax'] );
		$this->assertEquals( 6.49, $order_data['shipping'] );
		$this->assertEquals( 0.00, $order_data['discount'] );
		$this->assertEquals( 'GBP', $order_data['currency'] );
		$this->assertEquals( 'completed', $order_data['status'] );
		$this->assertEquals( 'stripe', $order_data['payment_method'] );
		$this->assertArrayHasKey( 'date_created', $order_data );
	}

	/**
	 * Test prepare_payload includes attribution when provided.
	 */
	public function test_prepare_payload_with_attribution(): void {
		$order = $this->create_mock_order( 123 );
		$dashboard = new WAB_Dashboard();

		$attribution = [
			'fbclid'     => 'test_fb_click',
			'utm_source' => 'facebook',
			'utm_medium' => 'cpc',
		];

		$payload = $dashboard->prepare_payload( $order, $attribution );

		$this->assertArrayHasKey( 'attribution', $payload['order'] );
		$this->assertEquals( $attribution, $payload['order']['attribution'] );
	}

	/**
	 * Test prepare_payload attribution is null for direct orders.
	 */
	public function test_prepare_payload_without_attribution(): void {
		$order = $this->create_mock_order( 123 );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertNull( $payload['order']['attribution'] );
	}

	/**
	 * Test prepare_payload customer email is hashed.
	 */
	public function test_prepare_payload_customer_email_hashed(): void {
		$order = $this->create_mock_order( 123, [
			'billing_email' => 'Test@Example.com',
		] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$expected_hash = hash( 'sha256', 'test@example.com' );
		$this->assertEquals( $expected_hash, $payload['order']['customer_email_hash'] );
	}

	/**
	 * Test prepare_payload is_new_customer is true for first-time customer.
	 */
	public function test_prepare_payload_new_customer(): void {
		// No previous orders.
		$GLOBALS['wab_test_customer_orders'] = [];

		$order = $this->create_mock_order( 123, [
			'billing_email' => 'new@example.com',
		] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertTrue( $payload['order']['is_new_customer'] );
	}

	/**
	 * Test prepare_payload is_new_customer is false for returning customer.
	 */
	public function test_prepare_payload_returning_customer(): void {
		// Has previous orders.
		$GLOBALS['wab_test_customer_orders'] = [
			new \WC_Order( 100 ),
		];

		$order = $this->create_mock_order( 123, [
			'billing_email' => 'returning@example.com',
		] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertFalse( $payload['order']['is_new_customer'] );
	}

	/**
	 * Test prepare_payload includes survey response when available.
	 */
	public function test_prepare_payload_survey_response(): void {
		$order = $this->create_mock_order( 123 );
		$order->update_meta_data( '_wab_survey_response', 'facebook' );
		$order->update_meta_data( '_wab_survey_source', 'Facebook/Instagram' );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertEquals( 'facebook', $payload['order']['survey_response'] );
		$this->assertEquals( 'Facebook/Instagram', $payload['order']['survey_source'] );
	}

	/**
	 * Test prepare_payload survey_response is null when not answered.
	 */
	public function test_prepare_payload_no_survey(): void {
		$order = $this->create_mock_order( 123 );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertNull( $payload['order']['survey_response'] );
		$this->assertNull( $payload['order']['survey_source'] );
	}

	/**
	 * Test should_send always returns true when enabled.
	 */
	public function test_should_send_always(): void {
		$order = $this->create_mock_order( 123 );
		$dashboard = new WAB_Dashboard();

		// No attribution at all.
		$result = $dashboard->should_send( $order, [] );

		$this->assertTrue( $result, 'Dashboard should send all orders regardless of attribution' );
	}

	/**
	 * Test should_send returns false when disabled.
	 */
	public function test_should_send_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_dashboard_enabled'] = false;

		$order = $this->create_mock_order( 123 );
		$dashboard = new WAB_Dashboard();

		$result = $dashboard->should_send( $order, [] );

		$this->assertFalse( $result );
	}

	/**
	 * Test validate_settings with all settings present.
	 */
	public function test_validate_settings_all_present(): void {
		$dashboard  = new WAB_Dashboard();
		$validation = $dashboard->validate_settings();

		$this->assertTrue( $validation['valid'] );
		$this->assertEmpty( $validation['missing'] );
	}

	/**
	 * Test validate_settings with missing settings.
	 */
	public function test_validate_settings_missing(): void {
		global $wab_test_options;
		$wab_test_options['wab_api_key'] = '';

		$dashboard  = new WAB_Dashboard();
		$validation = $dashboard->validate_settings();

		$this->assertFalse( $validation['valid'] );
		$this->assertContains( 'wab_api_key', $validation['missing'] );
	}

	/**
	 * Test event type for on-hold orders.
	 */
	public function test_prepare_payload_event_onhold(): void {
		$order = $this->create_mock_order( 123, [ 'status' => 'on-hold' ] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertEquals( 'order.updated', $payload['event'] );
	}

	/**
	 * Test date_completed is included when order is completed.
	 */
	public function test_prepare_payload_date_completed(): void {
		$order = $this->create_mock_order( 123, [ 'status' => 'completed' ] );
		$order->set_date_completed( new \WC_DateTime() );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertNotNull( $payload['order']['date_completed'] );
	}

	/**
	 * Test date_completed is null when order not completed.
	 */
	public function test_prepare_payload_date_completed_null(): void {
		$order = $this->create_mock_order( 123, [ 'status' => 'pending' ] );
		$dashboard = new WAB_Dashboard();

		$payload = $dashboard->prepare_payload( $order, [] );

		$this->assertNull( $payload['order']['date_completed'] );
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
			'subtotal'           => '85.00',
			'total_tax'          => '8.50',
			'shipping_total'     => '6.49',
			'discount_total'     => '0.00',
			'payment_method'     => 'stripe',
			'status'             => 'pending',
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
			$order->set_total( (float) $props['total'] );
		}
		if ( isset( $props['subtotal'] ) ) {
			$order->set_subtotal( (float) $props['subtotal'] );
		}
		if ( isset( $props['total_tax'] ) ) {
			$order->set_total_tax( (float) $props['total_tax'] );
		}
		if ( isset( $props['shipping_total'] ) ) {
			$order->set_shipping_total( (float) $props['shipping_total'] );
		}
		if ( isset( $props['discount_total'] ) ) {
			$order->set_discount_total( (float) $props['discount_total'] );
		}
		if ( isset( $props['payment_method'] ) ) {
			$order->set_payment_method( $props['payment_method'] );
		}
		if ( isset( $props['status'] ) ) {
			$order->set_status( $props['status'] );
		}

		return $order;
	}
}
