<?php
/**
 * Conversion handler tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey\Functions;
use Mockery;

/**
 * Test class for WAB_Conversion.
 */
class ConversionTest extends WabTestCase {

	/**
	 * Mock cookie handler.
	 *
	 * @var \WAB_Cookie|Mockery\MockInterface
	 */
	private $cookie;

	/**
	 * Mock dispatcher.
	 *
	 * @var \WAB_Dispatcher|Mockery\MockInterface
	 */
	private $dispatcher;

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options, $wpdb;
		$wab_test_options = [
			'wab_debug_mode' => false,
		];

		// Mock $wpdb.
		$wpdb = Mockery::mock( 'wpdb' );
		$wpdb->prefix = 'wp_';
		$wpdb->shouldReceive( 'insert' )->andReturn( true );
		$wpdb->shouldReceive( 'prepare' )->andReturnUsing( function( $query, ...$args ) {
			return vsprintf( str_replace( '%s', "'%s'", $query ), $args );
		} );
		$wpdb->shouldReceive( 'get_var' )->andReturn( null );
		$wpdb->shouldReceive( 'get_results' )->andReturn( [] );
		$wpdb->shouldReceive( 'query' )->andReturn( true );

		// Create mock dependencies.
		$this->cookie = Mockery::mock( 'WAB_Cookie' );
		$this->dispatcher = Mockery::mock( 'WAB_Dispatcher' );

		// Mock wc_get_order.
		Functions\when( 'wc_get_order' )->alias( function( $order_id ) {
			global $wab_test_orders;
			return $wab_test_orders[ $order_id ] ?? false;
		} );

		// Mock wc_get_orders.
		Functions\when( 'wc_get_orders' )->alias( function( $args ) {
			global $wab_test_customer_orders;
			return $wab_test_customer_orders ?? [];
		} );
	}

	/**
	 * Create a mock WC_Order.
	 *
	 * @param int   $id    Order ID.
	 * @param array $props Order properties.
	 * @return \WC_Order
	 */
	private function create_mock_order( int $id, array $props = [] ): \WC_Order {
		$order = new \WC_Order( $id );

		if ( isset( $props['billing_email'] ) ) {
			$order->set_billing_email( $props['billing_email'] );
		}

		if ( isset( $props['meta'] ) ) {
			foreach ( $props['meta'] as $key => $value ) {
				$order->update_meta_data( $key, $value );
			}
		}

		return $order;
	}

	/**
	 * Test on_order_created saves attribution to order meta.
	 */
	public function test_on_order_created_saves_attribution(): void {
		$order = $this->create_mock_order( 123, [
			'billing_email' => 'test@example.com',
		] );

		$this->cookie->shouldReceive( 'save_to_order' )
			->once()
			->with( $order );

		$this->cookie->shouldReceive( 'get_attribution_data' )
			->andReturn( [ 'visitor_id' => 'test_visitor' ] );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$conversion->on_order_created( 123, [], $order );

		$this->assertNotEmpty( $order->get_meta( '_wab_captured_at' ) );
	}

	/**
	 * Test on_order_created sets capture timestamp.
	 */
	public function test_on_order_created_sets_capture_timestamp(): void {
		$order = $this->create_mock_order( 124, [
			'billing_email' => 'test@example.com',
		] );

		$this->cookie->shouldReceive( 'save_to_order' )->once();
		$this->cookie->shouldReceive( 'get_attribution_data' )
			->andReturn( [ 'visitor_id' => 'test_visitor' ] );

		$before = time();
		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$conversion->on_order_created( 124, [], $order );
		$after = time();

		$captured_at = $order->get_meta( '_wab_captured_at' );
		$this->assertGreaterThanOrEqual( $before, $captured_at );
		$this->assertLessThanOrEqual( $after, $captured_at );
	}

	/**
	 * Test on_order_processing sends conversion.
	 */
	public function test_on_order_processing_sends_conversion(): void {
		global $wab_test_orders;

		$order = $this->create_mock_order( 125, [
			'billing_email' => 'test@example.com',
		] );
		$wab_test_orders[125] = $order;

		$this->cookie->shouldReceive( 'get_order_attribution' )
			->andReturn( [ 'fbclid' => 'test_fb_click' ] );

		$this->dispatcher->shouldReceive( 'dispatch' )
			->once()
			->andReturn( [ 'meta' => [ 'sent' => true ] ] );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$conversion->on_order_processing( 125 );

		$this->assertNotEmpty( $order->get_meta( '_wab_conversions_sent' ) );
	}

	/**
	 * Test on_order_processing respects filter.
	 */
	public function test_on_order_processing_respects_filter(): void {
		// Override apply_filters to return false for wab_send_on_processing.
		Functions\when( 'apply_filters' )->alias( function( $hook, $value ) {
			if ( $hook === 'wab_send_on_processing' ) {
				return false;
			}
			return $value;
		} );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );

		// Dispatcher should NOT be called.
		$this->dispatcher->shouldNotReceive( 'dispatch' );

		$conversion->on_order_processing( 126 );

		// Verify dispatcher was not called (Mockery handles this, but add assertion for PHPUnit).
		$this->assertTrue( true );
	}

	/**
	 * Test on_order_completed sends conversion.
	 */
	public function test_on_order_completed_sends_conversion(): void {
		global $wab_test_orders;

		$order = $this->create_mock_order( 127 );
		$wab_test_orders[127] = $order;

		$this->cookie->shouldReceive( 'get_order_attribution' )
			->andReturn( [ 'gclid' => 'test_google_click' ] );

		$this->dispatcher->shouldReceive( 'dispatch' )
			->once()
			->andReturn( [ 'google' => [ 'sent' => true ] ] );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$conversion->on_order_completed( 127 );

		$this->assertNotEmpty( $order->get_meta( '_wab_conversions_sent' ) );
	}

	/**
	 * Test prevents duplicate sends.
	 */
	public function test_prevents_duplicate_sends(): void {
		global $wab_test_orders;

		$order = $this->create_mock_order( 128 );
		$order->update_meta_data( '_wab_conversions_sent', time() );
		$wab_test_orders[128] = $order;

		// Dispatcher should NOT be called because already sent.
		$this->dispatcher->shouldNotReceive( 'dispatch' );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$result = $conversion->on_order_completed( 128 );

		// Verify dispatcher was not called (Mockery handles this, but add assertion for PHPUnit).
		$this->assertTrue( true );
	}

	/**
	 * Test manual_send without force skips already sent.
	 */
	public function test_manual_send_without_force(): void {
		global $wab_test_orders;

		$order = $this->create_mock_order( 129 );
		$order->update_meta_data( '_wab_conversions_sent', time() );
		$wab_test_orders[129] = $order;

		$this->dispatcher->shouldNotReceive( 'dispatch' );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$result = $conversion->manual_send( 129 );

		$this->assertEmpty( $result );
	}

	/**
	 * Test manual_send with force resends conversion.
	 */
	public function test_manual_send_with_force(): void {
		global $wab_test_orders;

		$order = $this->create_mock_order( 130 );
		$order->update_meta_data( '_wab_conversions_sent', time() - 3600 );
		$wab_test_orders[130] = $order;

		$this->cookie->shouldReceive( 'get_order_attribution' )
			->andReturn( [ 'fbclid' => 'test_click' ] );

		$this->dispatcher->shouldReceive( 'dispatch' )
			->once()
			->andReturn( [ 'meta' => [ 'sent' => true ] ] );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$result = $conversion->manual_send( 130, true );

		$this->assertNotEmpty( $result );
	}

	/**
	 * Test manual_send returns error for invalid order.
	 */
	public function test_manual_send_invalid_order(): void {
		global $wab_test_orders;
		$wab_test_orders = [];

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$result = $conversion->manual_send( 99999 );

		$this->assertArrayHasKey( 'error', $result );
		$this->assertEquals( 'Order not found', $result['error'] );
	}

	/**
	 * Test is_new_customer returns true for first order.
	 */
	public function test_is_new_customer_first_order(): void {
		global $wab_test_customer_orders;
		$wab_test_customer_orders = [];

		$order = $this->create_mock_order( 131, [
			'billing_email' => 'newcustomer@example.com',
		] );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$this->assertTrue( $conversion->is_new_customer( $order ) );
	}

	/**
	 * Test is_new_customer returns false for returning customer.
	 */
	public function test_is_new_customer_returning(): void {
		global $wab_test_customer_orders;

		$previous_order = $this->create_mock_order( 100 );
		$wab_test_customer_orders = [ $previous_order ];

		$order = $this->create_mock_order( 132, [
			'billing_email' => 'returning@example.com',
		] );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$this->assertFalse( $conversion->is_new_customer( $order ) );
	}

	/**
	 * Test is_new_customer returns true when no email.
	 */
	public function test_is_new_customer_empty_email(): void {
		$order = $this->create_mock_order( 133 );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$this->assertTrue( $conversion->is_new_customer( $order ) );
	}

	/**
	 * Test get_attribution_summary with fbclid.
	 */
	public function test_get_attribution_summary_with_fbclid(): void {
		global $wab_test_orders, $wab_test_customer_orders;
		$wab_test_customer_orders = [];

		$order = $this->create_mock_order( 134, [
			'billing_email' => 'test@example.com',
			'meta' => [
				'_wab_attribution' => [
					'fbclid' => 'test_fb_click',
					'visitor_id' => 'test_visitor',
				],
			],
		] );
		$wab_test_orders[134] = $order;

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$summary = $conversion->get_attribution_summary( 134 );

		$this->assertNotNull( $summary );
		$this->assertEquals( 'meta', $summary['source'] );
		$this->assertEquals( 'test_fb_click', $summary['click_id'] );
	}

	/**
	 * Test get_attribution_summary with gclid.
	 */
	public function test_get_attribution_summary_with_gclid(): void {
		global $wab_test_orders, $wab_test_customer_orders;
		$wab_test_customer_orders = [];

		$order = $this->create_mock_order( 135, [
			'billing_email' => 'test@example.com',
			'meta' => [
				'_wab_attribution' => [
					'gclid' => 'test_google_click',
				],
			],
		] );
		$wab_test_orders[135] = $order;

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$summary = $conversion->get_attribution_summary( 135 );

		$this->assertEquals( 'google', $summary['source'] );
	}

	/**
	 * Test get_attribution_summary with UTM source.
	 */
	public function test_get_attribution_summary_with_utm(): void {
		global $wab_test_orders, $wab_test_customer_orders;
		$wab_test_customer_orders = [];

		$order = $this->create_mock_order( 136, [
			'billing_email' => 'test@example.com',
			'meta' => [
				'_wab_attribution' => [
					'utm' => [
						'utm_source' => 'newsletter',
					],
				],
			],
		] );
		$wab_test_orders[136] = $order;

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$summary = $conversion->get_attribution_summary( 136 );

		$this->assertEquals( 'utm:newsletter', $summary['source'] );
	}

	/**
	 * Test get_attribution_summary direct (no attribution).
	 */
	public function test_get_attribution_summary_direct(): void {
		global $wab_test_orders, $wab_test_customer_orders;
		$wab_test_customer_orders = [];

		$order = $this->create_mock_order( 137, [
			'billing_email' => 'test@example.com',
			'meta' => [
				'_wab_attribution' => [],
			],
		] );
		$wab_test_orders[137] = $order;

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$summary = $conversion->get_attribution_summary( 137 );

		// Returns null when attribution is empty.
		$this->assertNull( $summary );
	}

	/**
	 * Test get_attribution_summary invalid order.
	 */
	public function test_get_attribution_summary_invalid_order(): void {
		global $wab_test_orders;
		$wab_test_orders = [];

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$summary = $conversion->get_attribution_summary( 99999 );

		$this->assertNull( $summary );
	}

	/**
	 * Test orders without attribution still dispatched.
	 */
	public function test_orders_without_attribution_still_dispatched(): void {
		global $wab_test_orders;

		$order = $this->create_mock_order( 138 );
		$wab_test_orders[138] = $order;

		$this->cookie->shouldReceive( 'get_order_attribution' )
			->andReturn( [] );

		$this->dispatcher->shouldReceive( 'dispatch' )
			->once()
			->with( $order, [] )
			->andReturn( [ 'dashboard' => [ 'sent' => true ] ] );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$conversion->on_order_completed( 138 );

		$this->assertTrue( $order->get_meta( '_wab_no_attribution' ) );
	}

	/**
	 * Test debug logging when enabled.
	 */
	public function test_debug_logging_when_enabled(): void {
		global $wab_test_options, $wab_test_orders;

		$wab_test_options['wab_debug_mode'] = true;

		$order = $this->create_mock_order( 139 );
		$wab_test_orders[139] = $order;

		$this->cookie->shouldReceive( 'get_order_attribution' )
			->andReturn( [ 'fbclid' => 'test' ] );

		$this->dispatcher->shouldReceive( 'dispatch' )
			->andReturn( [ 'meta' => [ 'sent' => true ] ] );

		// error_log is already mocked in setUp.
		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$conversion->on_order_completed( 139 );

		// If we get here without error, the test passes.
		$this->assertTrue( true );
	}

	/**
	 * Test stores dispatch results in order meta.
	 */
	public function test_stores_dispatch_results(): void {
		global $wab_test_orders;

		$order = $this->create_mock_order( 140 );
		$wab_test_orders[140] = $order;

		$expected_results = [
			'meta' => [ 'sent' => true, 'response_code' => 200 ],
			'google' => [ 'sent' => false, 'queued' => true ],
		];

		$this->cookie->shouldReceive( 'get_order_attribution' )
			->andReturn( [ 'fbclid' => 'test', 'gclid' => 'test2' ] );

		$this->dispatcher->shouldReceive( 'dispatch' )
			->andReturn( $expected_results );

		$conversion = new \WAB_Conversion( $this->cookie, $this->dispatcher );
		$conversion->on_order_completed( 140 );

		$stored_results = $order->get_meta( '_wab_dispatch_results' );
		$this->assertEquals( $expected_results, $stored_results );
	}
}
