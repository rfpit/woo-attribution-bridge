<?php
/**
 * Deduplication class tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use WAB_Deduplication;
use Mockery;

/**
 * Test class for WAB_Deduplication.
 */
class DeduplicationTest extends WabTestCase {

	/**
	 * Mock wpdb.
	 *
	 * @var \Mockery\MockInterface
	 */
	private $wpdb;

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_dedup_enabled' => true,
			'wab_dedup_window'  => 3600,
			'wab_debug_mode'    => false,
		];

		// Mock wpdb.
		$this->wpdb = Mockery::mock( 'wpdb' );
		$this->wpdb->prefix = 'wp_';
		$GLOBALS['wpdb'] = $this->wpdb;
	}

	/**
	 * Tear down test environment.
	 */
	protected function tearDown(): void {
		unset( $GLOBALS['wpdb'] );
		parent::tearDown();
	}

	/**
	 * Test generate_event_id creates unique IDs.
	 */
	public function test_generate_event_id_creates_unique_ids(): void {
		$dedup = new WAB_Deduplication();

		$id1 = $dedup->generate_event_id( 123, 'meta', 'purchase' );
		$id2 = $dedup->generate_event_id( 123, 'meta', 'purchase' );

		$this->assertNotEquals( $id1, $id2, 'Event IDs should be unique (include timestamp)' );
		$this->assertStringContainsString( '123', $id1 );
		$this->assertStringContainsString( 'meta', $id1 );
		$this->assertStringContainsString( 'purchase', $id1 );
	}

	/**
	 * Test generate_stable_event_id creates consistent IDs.
	 */
	public function test_generate_stable_event_id_creates_consistent_ids(): void {
		$dedup = new WAB_Deduplication();

		$id1 = $dedup->generate_stable_event_id( 123, 'meta', 'purchase' );
		$id2 = $dedup->generate_stable_event_id( 123, 'meta', 'purchase' );

		$this->assertEquals( $id1, $id2, 'Stable event IDs should be identical for same inputs' );
	}

	/**
	 * Test generate_stable_event_id differs for different orders.
	 */
	public function test_generate_stable_event_id_differs_for_different_orders(): void {
		$dedup = new WAB_Deduplication();

		$id1 = $dedup->generate_stable_event_id( 123, 'meta', 'purchase' );
		$id2 = $dedup->generate_stable_event_id( 456, 'meta', 'purchase' );

		$this->assertNotEquals( $id1, $id2, 'Different orders should have different IDs' );
	}

	/**
	 * Test generate_stable_event_id differs for different integrations.
	 */
	public function test_generate_stable_event_id_differs_for_different_integrations(): void {
		$dedup = new WAB_Deduplication();

		$id1 = $dedup->generate_stable_event_id( 123, 'meta', 'purchase' );
		$id2 = $dedup->generate_stable_event_id( 123, 'google', 'purchase' );

		$this->assertNotEquals( $id1, $id2, 'Different integrations should have different IDs' );
	}

	/**
	 * Test is_duplicate returns false when deduplication is disabled.
	 */
	public function test_is_duplicate_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_dedup_enabled'] = false;

		$dedup = new WAB_Deduplication();
		$result = $dedup->is_duplicate( 123, 'meta' );

		$this->assertFalse( $result );
	}

	/**
	 * Test validate_settings returns correct structure.
	 */
	public function test_event_id_format(): void {
		$dedup = new WAB_Deduplication();

		$id = $dedup->generate_stable_event_id( 999, 'tiktok', 'CompletePayment' );

		// Should contain all parts.
		$this->assertMatchesRegularExpression( '/^[a-f0-9]+_999_tiktok_CompletePayment$/', $id );
	}

	/**
	 * Test is_duplicate returns true when recent success exists.
	 */
	public function test_is_duplicate_returns_true_when_recent_success(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->once()
			->andReturn( 42 ); // Found a log entry.

		$dedup  = new WAB_Deduplication();
		$result = $dedup->is_duplicate( 123, 'meta' );

		$this->assertTrue( $result );
	}

	/**
	 * Test is_duplicate returns false when no recent success.
	 */
	public function test_is_duplicate_returns_false_when_no_recent_success(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->once()
			->andReturn( null ); // No log entry found.

		$dedup  = new WAB_Deduplication();
		$result = $dedup->is_duplicate( 123, 'meta' );

		$this->assertFalse( $result );
	}

	/**
	 * Test should_skip_recent_attempt returns true when recent attempt exists.
	 */
	public function test_should_skip_recent_attempt_returns_true(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->once()
			->andReturn( 1 ); // Found a recent attempt.

		$dedup  = new WAB_Deduplication();
		$result = $dedup->should_skip_recent_attempt( 123, 'meta', 60 );

		$this->assertTrue( $result );
	}

	/**
	 * Test should_skip_recent_attempt returns false when no recent attempt.
	 */
	public function test_should_skip_recent_attempt_returns_false(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->once()
			->andReturn( null ); // No recent attempt.

		$dedup  = new WAB_Deduplication();
		$result = $dedup->should_skip_recent_attempt( 123, 'meta', 60 );

		$this->assertFalse( $result );
	}

	/**
	 * Test log_success inserts row with status success.
	 */
	public function test_log_success_inserts_row(): void {
		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->with(
				'wp_wab_log',
				Mockery::on( function( $data ) {
					return $data['order_id'] === 123
						&& $data['integration'] === 'meta'
						&& $data['event_type'] === 'purchase'
						&& $data['status'] === 'success'
						&& $data['response_code'] === 200;
				} ),
				Mockery::any()
			)
			->andReturn( 1 );

		$dedup = new WAB_Deduplication();
		$dedup->log_success( 123, 'meta', 'purchase', 'event_123', 200, '{"success":true}' );

		$this->assertTrue( true );
	}

	/**
	 * Test log_failure inserts row with status failed.
	 */
	public function test_log_failure_inserts_row(): void {
		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->with(
				'wp_wab_log',
				Mockery::on( function( $data ) {
					return $data['order_id'] === 456
						&& $data['integration'] === 'google'
						&& $data['status'] === 'failed'
						&& $data['response_code'] === 500;
				} ),
				Mockery::any()
			)
			->andReturn( 1 );

		$dedup = new WAB_Deduplication();
		$dedup->log_failure( 456, 'google', 'purchase', 'event_456', 500, 'Server Error' );

		$this->assertTrue( true );
	}

	/**
	 * Test log extracts click IDs from attribution data.
	 */
	public function test_log_extracts_click_ids(): void {
		$attribution_data = [
			'fbclid'     => 'fb_click_123',
			'gclid'      => 'google_click_456',
			'visitor_id' => 'visitor_789', // Not a click ID
		];

		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->with(
				'wp_wab_log',
				Mockery::on( function( $data ) {
					$click_ids = json_decode( $data['click_ids'], true );
					return isset( $click_ids['fbclid'] )
						&& isset( $click_ids['gclid'] )
						&& ! isset( $click_ids['visitor_id'] );
				} ),
				Mockery::any()
			)
			->andReturn( 1 );

		$dedup = new WAB_Deduplication();
		$dedup->log_success( 123, 'meta', 'purchase', 'event_123', 200, '{}', $attribution_data );

		$this->assertTrue( true );
	}

	/**
	 * Test log truncates long response body.
	 */
	public function test_log_truncates_response_body(): void {
		$long_response = str_repeat( 'a', 100000 ); // 100KB

		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->with(
				'wp_wab_log',
				Mockery::on( function( $data ) {
					return strlen( $data['response_body'] ) <= 65535;
				} ),
				Mockery::any()
			)
			->andReturn( 1 );

		$dedup = new WAB_Deduplication();
		$dedup->log_success( 123, 'meta', 'purchase', 'event_123', 200, $long_response );

		$this->assertTrue( true );
	}

	/**
	 * Test get_order_logs returns all logs for order.
	 */
	public function test_get_order_logs_returns_logs(): void {
		$mock_logs = [
			[ 'id' => 1, 'order_id' => 123, 'integration' => 'meta', 'status' => 'success' ],
			[ 'id' => 2, 'order_id' => 123, 'integration' => 'google', 'status' => 'failed' ],
		];

		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( $mock_logs );

		$dedup = new WAB_Deduplication();
		$logs  = $dedup->get_order_logs( 123 );

		$this->assertCount( 2, $logs );
		$this->assertEquals( 'meta', $logs[0]['integration'] );
		$this->assertEquals( 'google', $logs[1]['integration'] );
	}

	/**
	 * Test get_order_logs returns empty array when none.
	 */
	public function test_get_order_logs_returns_empty_when_none(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( null );

		$dedup = new WAB_Deduplication();
		$logs  = $dedup->get_order_logs( 999 );

		$this->assertEmpty( $logs );
	}

	/**
	 * Test get_stats returns organized statistics.
	 */
	public function test_get_stats_returns_organized_stats(): void {
		$mock_stats = [
			[ 'integration' => 'meta', 'status' => 'success', 'count' => '10' ],
			[ 'integration' => 'meta', 'status' => 'failed', 'count' => '2' ],
			[ 'integration' => 'google', 'status' => 'success', 'count' => '5' ],
		];

		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( $mock_stats );

		$dedup = new WAB_Deduplication();
		$stats = $dedup->get_stats( 'today' );

		$this->assertEquals( 10, $stats['meta']['success'] );
		$this->assertEquals( 2, $stats['meta']['failed'] );
		$this->assertEquals( 5, $stats['google']['success'] );
	}

	/**
	 * Test get_stats with 'all' period.
	 */
	public function test_get_stats_all_period(): void {
		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( [] );

		$dedup = new WAB_Deduplication();
		$stats = $dedup->get_stats( 'all' );

		$this->assertIsArray( $stats );
	}
}
