<?php
/**
 * Queue manager tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use WAB_Queue;
use Mockery;

/**
 * Test class for WAB_Queue.
 */
class QueueTest extends WabTestCase {

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
			'wab_queue_enabled'         => true,
			'wab_queue_max_attempts'    => 5,
			'wab_queue_retry_intervals' => [ 60, 300, 1800, 7200, 43200 ],
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
	 * Test add returns false when queue disabled.
	 */
	public function test_add_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_queue_enabled'] = false;

		$queue  = new WAB_Queue();
		$result = $queue->add( 123, 'meta', [ 'test' => 'data' ] );

		$this->assertFalse( $result );
	}

	/**
	 * Test add inserts to database.
	 */
	public function test_add_inserts_to_database(): void {
		$this->wpdb->insert_id = 42;

		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->with(
				'wp_wab_queue',
				Mockery::on( function( $data ) {
					return $data['order_id'] === 123
						&& $data['integration'] === 'meta'
						&& $data['status'] === 'pending'
						&& $data['attempts'] === 0
						&& $data['max_attempts'] === 5;
				} ),
				Mockery::any()
			)
			->andReturn( 1 );

		$queue  = new WAB_Queue();
		$result = $queue->add( 123, 'meta', [ 'test' => 'data' ] );

		$this->assertEquals( 42, $result );
	}

	/**
	 * Test add returns false on database error.
	 */
	public function test_add_returns_false_on_database_error(): void {
		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->andReturn( false );

		$queue  = new WAB_Queue();
		$result = $queue->add( 123, 'meta', [ 'test' => 'data' ] );

		$this->assertFalse( $result );
	}

	/**
	 * Test process_pending does nothing when disabled.
	 */
	public function test_process_pending_does_nothing_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_queue_enabled'] = false;

		// wpdb should not be called.
		$this->wpdb->shouldNotReceive( 'get_results' );

		$queue = new WAB_Queue();
		$queue->process_pending();

		// If we get here without exception, test passes.
		$this->assertTrue( true );
	}

	/**
	 * Test process_pending does nothing when queue empty.
	 */
	public function test_process_pending_does_nothing_when_empty(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( [] );

		$queue = new WAB_Queue();
		$queue->process_pending();

		// If we get here without exception, test passes.
		$this->assertTrue( true );
	}

	/**
	 * Test get_stats returns organized statistics.
	 */
	public function test_get_stats_returns_organized_stats(): void {
		$mock_results = [
			[ 'integration' => 'meta', 'status' => 'pending', 'count' => '5' ],
			[ 'integration' => 'meta', 'status' => 'completed', 'count' => '10' ],
			[ 'integration' => 'google', 'status' => 'failed', 'count' => '2' ],
		];

		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( $mock_results );

		$queue = new WAB_Queue();
		$stats = $queue->get_stats();

		$this->assertEquals( 5, $stats['pending'] );
		$this->assertEquals( 10, $stats['completed'] );
		$this->assertEquals( 2, $stats['failed'] );
		$this->assertEquals( 5, $stats['by_integration']['meta']['pending'] );
		$this->assertEquals( 10, $stats['by_integration']['meta']['completed'] );
		$this->assertEquals( 2, $stats['by_integration']['google']['failed'] );
	}

	/**
	 * Test get_order_queue returns queue items for order.
	 */
	public function test_get_order_queue_returns_items(): void {
		$mock_items = [
			[ 'id' => 1, 'order_id' => 123, 'integration' => 'meta' ],
			[ 'id' => 2, 'order_id' => 123, 'integration' => 'google' ],
		];

		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( $mock_items );

		$queue = new WAB_Queue();
		$items = $queue->get_order_queue( 123 );

		$this->assertCount( 2, $items );
		$this->assertEquals( 'meta', $items[0]['integration'] );
	}

	/**
	 * Test get_order_queue returns empty array when none.
	 */
	public function test_get_order_queue_returns_empty_when_none(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( null );

		$queue = new WAB_Queue();
		$items = $queue->get_order_queue( 123 );

		$this->assertEmpty( $items );
	}

	/**
	 * Test cleanup removes old items.
	 */
	public function test_cleanup_removes_old_items(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'query' )
			->once()
			->andReturn( 15 );

		$queue   = new WAB_Queue();
		$deleted = $queue->cleanup( 30 );

		$this->assertEquals( 15, $deleted );
	}

	/**
	 * Test cancel updates pending item to cancelled.
	 */
	public function test_cancel_updates_pending_to_cancelled(): void {
		$this->wpdb->shouldReceive( 'update' )
			->once()
			->with(
				'wp_wab_queue',
				[ 'status' => 'cancelled' ],
				[ 'id' => 42, 'status' => 'pending' ],
				Mockery::any(),
				Mockery::any()
			)
			->andReturn( 1 );

		$queue  = new WAB_Queue();
		$result = $queue->cancel( 42 );

		$this->assertTrue( $result );
	}

	/**
	 * Test cancel returns false on failure.
	 */
	public function test_cancel_returns_false_on_failure(): void {
		$this->wpdb->shouldReceive( 'update' )
			->once()
			->andReturn( false );

		$queue  = new WAB_Queue();
		$result = $queue->cancel( 42 );

		$this->assertFalse( $result );
	}

	/**
	 * Test retry_now returns false when item not found.
	 */
	public function test_retry_now_returns_false_when_not_found(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_row' )
			->once()
			->andReturn( null );

		$queue  = new WAB_Queue();
		$result = $queue->retry_now( 999 );

		$this->assertFalse( $result );
	}

	/**
	 * Test retry_now returns false when item not pending.
	 */
	public function test_retry_now_returns_false_when_not_pending(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_row' )
			->once()
			->andReturn( [ 'id' => 42, 'status' => 'completed' ] );

		$queue  = new WAB_Queue();
		$result = $queue->retry_now( 42 );

		$this->assertFalse( $result );
	}

	/**
	 * Test add calculates next_retry using first interval.
	 */
	public function test_add_calculates_next_retry(): void {
		$this->wpdb->insert_id = 1;

		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->with(
				'wp_wab_queue',
				Mockery::on( function( $data ) {
					// next_retry should be set approximately now + 60 seconds.
					$expected_time = gmdate( 'Y-m-d H:i', time() + 60 );
					$actual_time   = substr( $data['next_retry'], 0, 16 );
					return $actual_time === $expected_time;
				} ),
				Mockery::any()
			)
			->andReturn( 1 );

		$queue = new WAB_Queue();
		$queue->add( 123, 'meta', [ 'test' => 'data' ] );

		$this->assertTrue( true );
	}

	/**
	 * Test retry intervals are exponential.
	 */
	public function test_retry_intervals_exponential(): void {
		global $wab_test_options;
		$intervals = $wab_test_options['wab_queue_retry_intervals'];

		// Each interval should be greater than the previous.
		for ( $i = 1; $i < count( $intervals ); $i++ ) {
			$this->assertGreaterThan(
				$intervals[ $i - 1 ],
				$intervals[ $i ],
				"Interval $i should be greater than interval " . ( $i - 1 )
			);
		}

		// Verify the actual values match expected.
		$this->assertEquals( 60, $intervals[0] );      // 1 minute
		$this->assertEquals( 300, $intervals[1] );     // 5 minutes
		$this->assertEquals( 1800, $intervals[2] );    // 30 minutes
		$this->assertEquals( 7200, $intervals[3] );    // 2 hours
		$this->assertEquals( 43200, $intervals[4] );   // 12 hours
	}
}
