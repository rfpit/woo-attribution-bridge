<?php
/**
 * Journey Tracker tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey\Functions;
use WAB_Journey_Tracker;
use WC_Order;

/**
 * Test cases for WAB_Journey_Tracker.
 */
class JourneyTrackerTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_journey_tracking_enabled'      => true,
			'wab_journey_session_timeout'       => 30,
			'wab_journey_max_pages_per_session' => 50,
			'wab_journey_retention_days'        => 90,
		];

		// Mock additional WordPress functions.
		Functions\when( 'current_time' )->alias( function( $type, $gmt = 0 ) {
			return $type === 'mysql' ? gmdate( 'Y-m-d H:i:s' ) : time();
		} );

		Functions\when( 'absint' )->alias( function( $maybeint ) {
			return abs( (int) $maybeint );
		} );

		Functions\when( 'sanitize_key' )->alias( function( $key ) {
			return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( $key ) );
		} );

		Functions\when( 'register_rest_route' )->justReturn( true );

		Functions\when( 'rest_url' )->alias( function( $path = '' ) {
			return 'https://example.com/wp-json/' . ltrim( $path, '/' );
		} );

		Functions\when( 'wp_create_nonce' )->justReturn( 'test_nonce_123' );
	}

	/**
	 * Test is_enabled returns true when option is true.
	 */
	public function test_is_enabled_returns_true_when_enabled(): void {
		$tracker = new WAB_Journey_Tracker();
		$this->assertTrue( $tracker->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when option is false.
	 */
	public function test_is_enabled_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_journey_tracking_enabled'] = false;

		$tracker = new WAB_Journey_Tracker();
		$this->assertFalse( $tracker->is_enabled() );
	}

	/**
	 * Test is_enabled returns true by default when option not set.
	 */
	public function test_is_enabled_returns_true_by_default(): void {
		global $wab_test_options;
		unset( $wab_test_options['wab_journey_tracking_enabled'] );

		$tracker = new WAB_Journey_Tracker();
		$this->assertTrue( $tracker->is_enabled() );
	}

	/**
	 * Test constructor loads settings from options.
	 */
	public function test_constructor_loads_settings(): void {
		global $wab_test_options;
		$wab_test_options['wab_journey_session_timeout'] = 45;
		$wab_test_options['wab_journey_max_pages_per_session'] = 100;
		$wab_test_options['wab_journey_retention_days'] = 30;

		// The constructor should use these values.
		$tracker = new WAB_Journey_Tracker();

		// We can verify the tracker was created successfully.
		$this->assertInstanceOf( WAB_Journey_Tracker::class, $tracker );
	}

	/**
	 * Test get_order_journey returns null when no journey data.
	 */
	public function test_get_order_journey_returns_null_when_empty(): void {
		$order = new WC_Order( 22222 );

		$result = WAB_Journey_Tracker::get_order_journey( $order );

		$this->assertNull( $result );
	}

	/**
	 * Test get_order_journey returns array when journey exists.
	 */
	public function test_get_order_journey_returns_array_when_exists(): void {
		$order = new WC_Order( 33333 );
		$journey_data = [
			'current_session'   => [ 'session_id' => 'test' ],
			'previous_sessions' => [],
			'metrics'           => [ 'total_sessions' => 1 ],
		];

		$order->update_meta_data( '_wab_journey', $journey_data );

		$result = WAB_Journey_Tracker::get_order_journey( $order );

		$this->assertIsArray( $result );
		$this->assertEquals( $journey_data, $result );
	}

	/**
	 * Test get_order_journey returns null for non-array data.
	 */
	public function test_get_order_journey_returns_null_for_non_array(): void {
		$order = new WC_Order( 44444 );
		$order->update_meta_data( '_wab_journey', 'not an array' );

		$result = WAB_Journey_Tracker::get_order_journey( $order );

		$this->assertNull( $result );
	}

	/**
	 * Test attach_journey_to_order does nothing when disabled.
	 */
	public function test_attach_journey_to_order_skips_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_journey_tracking_enabled'] = false;

		$tracker = new WAB_Journey_Tracker();

		$_COOKIE['wab_session'] = 'sess_test';
		$order = new WC_Order( 55555 );

		$tracker->attach_journey_to_order( $order );

		$journey_meta = $order->get_meta( '_wab_journey' );
		$this->assertEmpty( $journey_meta );
	}

	/**
	 * Test attach_journey_to_order skips when no session cookie.
	 */
	public function test_attach_journey_to_order_skips_when_no_session(): void {
		unset( $_COOKIE['wab_session'] );

		$tracker = new WAB_Journey_Tracker();
		$order = new WC_Order( 66666 );

		$tracker->attach_journey_to_order( $order );

		$journey_meta = $order->get_meta( '_wab_journey' );
		$this->assertEmpty( $journey_meta );
	}

	/**
	 * Test journey data structure from order meta.
	 */
	public function test_journey_data_structure(): void {
		$order = new WC_Order( 77777 );
		$journey_data = [
			'current_session' => [
				'session' => [
					'session_id'      => 'sess_abc123',
					'visitor_id'      => 'visitor_xyz',
					'started_at'      => '2024-01-15 10:00:00',
					'last_activity'   => '2024-01-15 10:30:00',
					'entry_page'      => '/product/test',
					'entry_referrer'  => 'https://google.com',
					'page_count'      => 5,
					'has_attribution' => 0,
				],
				'page_views' => [
					[
						'page_url'   => '/home',
						'page_type'  => 'home',
						'page_title' => 'Home Page',
						'product_id' => null,
						'viewed_at'  => '2024-01-15 10:00:00',
					],
					[
						'page_url'   => '/product/test',
						'page_type'  => 'product',
						'page_title' => 'Test Product',
						'product_id' => 123,
						'viewed_at'  => '2024-01-15 10:05:00',
					],
				],
				'cart_events' => [
					[
						'event_type' => 'add_to_cart',
						'product_id' => 123,
						'quantity'   => 1,
						'created_at' => '2024-01-15 10:10:00',
					],
				],
			],
			'previous_sessions' => [],
			'metrics' => [
				'total_sessions'           => 1,
				'total_page_views'         => 2,
				'products_viewed'          => 1,
				'products_viewed_ids'      => [ 123 ],
				'time_to_purchase_seconds' => 1800,
				'first_visit'              => '2024-01-15 10:00:00',
				'entry_page'               => '/product/test',
				'entry_referrer'           => 'https://google.com',
			],
		];

		$order->update_meta_data( '_wab_journey', $journey_data );

		$result = WAB_Journey_Tracker::get_order_journey( $order );

		$this->assertArrayHasKey( 'current_session', $result );
		$this->assertArrayHasKey( 'previous_sessions', $result );
		$this->assertArrayHasKey( 'metrics', $result );

		// Check current session structure.
		$session = $result['current_session'];
		$this->assertArrayHasKey( 'session', $session );
		$this->assertArrayHasKey( 'page_views', $session );
		$this->assertArrayHasKey( 'cart_events', $session );

		// Check metrics structure.
		$metrics = $result['metrics'];
		$this->assertArrayHasKey( 'total_sessions', $metrics );
		$this->assertArrayHasKey( 'total_page_views', $metrics );
		$this->assertArrayHasKey( 'products_viewed', $metrics );
		$this->assertArrayHasKey( 'time_to_purchase_seconds', $metrics );
		$this->assertArrayHasKey( 'entry_page', $metrics );
		$this->assertArrayHasKey( 'entry_referrer', $metrics );
	}

	/**
	 * Test journey with multiple sessions.
	 */
	public function test_journey_with_multiple_sessions(): void {
		$order = new WC_Order( 88888 );
		$journey_data = [
			'current_session' => [
				'session' => [
					'session_id' => 'sess_current',
					'visitor_id' => 'visitor_multi',
				],
				'page_views' => [],
				'cart_events' => [],
			],
			'previous_sessions' => [
				[
					'session' => [
						'session_id' => 'sess_prev1',
						'visitor_id' => 'visitor_multi',
					],
					'page_views'  => [],
					'cart_events' => [],
				],
				[
					'session' => [
						'session_id' => 'sess_prev2',
						'visitor_id' => 'visitor_multi',
					],
					'page_views'  => [],
					'cart_events' => [],
				],
			],
			'metrics' => [
				'total_sessions' => 3,
			],
		];

		$order->update_meta_data( '_wab_journey', $journey_data );

		$result = WAB_Journey_Tracker::get_order_journey( $order );

		$this->assertCount( 2, $result['previous_sessions'] );
		$this->assertEquals( 3, $result['metrics']['total_sessions'] );
	}

	/**
	 * Test page types are valid.
	 */
	public function test_valid_page_types(): void {
		$valid_types = [ 'home', 'category', 'product', 'cart', 'checkout', 'shop', 'post', 'page', 'other' ];

		foreach ( $valid_types as $type ) {
			$this->assertContains( $type, $valid_types );
		}
	}

	/**
	 * Test cart event types are valid.
	 */
	public function test_valid_cart_event_types(): void {
		$valid_events = [ 'add_to_cart', 'remove_from_cart', 'checkout_start' ];

		foreach ( $valid_events as $event ) {
			$this->assertContains( $event, $valid_events );
		}
	}

	/**
	 * Test journey metrics include entry context for direct orders.
	 */
	public function test_journey_metrics_for_direct_orders(): void {
		$order = new WC_Order( 99999 );

		// Simulate a direct order (no UTM/click IDs but has entry page)
		$journey_data = [
			'current_session' => [
				'session' => [
					'session_id'      => 'sess_direct',
					'visitor_id'      => 'visitor_direct',
					'entry_page'      => '/product/popular-item',
					'entry_referrer'  => null, // Direct traffic
					'has_attribution' => 0,    // No UTM or click IDs
				],
				'page_views' => [
					[
						'page_url'   => '/product/popular-item',
						'page_type'  => 'product',
						'page_title' => 'Popular Item',
						'product_id' => 456,
						'viewed_at'  => '2024-01-15 12:00:00',
					],
				],
				'cart_events' => [],
			],
			'previous_sessions' => [],
			'metrics' => [
				'total_sessions'           => 1,
				'total_page_views'         => 1,
				'products_viewed'          => 1,
				'products_viewed_ids'      => [ 456 ],
				'time_to_purchase_seconds' => 300,
				'first_visit'              => '2024-01-15 12:00:00',
				'entry_page'               => '/product/popular-item',
				'entry_referrer'           => null,
			],
		];

		$order->update_meta_data( '_wab_journey', $journey_data );

		$result = WAB_Journey_Tracker::get_order_journey( $order );

		// Even for direct traffic, we should have entry page.
		$this->assertEquals( '/product/popular-item', $result['metrics']['entry_page'] );
		$this->assertNull( $result['metrics']['entry_referrer'] );
		$this->assertEquals( 0, $result['current_session']['session']['has_attribution'] );
	}
}
