<?php
/**
 * Dispatcher tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use WAB_Dispatcher;
use WAB_Deduplication;
use WAB_Queue;
use WAB_Integration;
use Mockery;

/**
 * Test class for WAB_Dispatcher.
 */
class DispatcherTest extends WabTestCase {

	/**
	 * Mock integration.
	 *
	 * @var \Mockery\MockInterface
	 */
	private $mock_integration;

	/**
	 * Mock deduplication.
	 *
	 * @var \Mockery\MockInterface
	 */
	private $mock_dedup;

	/**
	 * Mock queue.
	 *
	 * @var \Mockery\MockInterface
	 */
	private $mock_queue;

	/**
	 * Mock order.
	 *
	 * @var \Mockery\MockInterface
	 */
	private $mock_order;

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;
		$wab_test_options = [
			'wab_queue_enabled' => true,
		];

		$this->mock_integration = Mockery::mock( WAB_Integration::class );
		$this->mock_dedup       = Mockery::mock( WAB_Deduplication::class );
		$this->mock_queue       = Mockery::mock( WAB_Queue::class );
		$this->mock_order       = Mockery::mock( 'WC_Order' );

		$this->mock_order->shouldReceive( 'get_id' )->andReturn( 123 );
	}

	/**
	 * Test get_integrations returns registered integrations.
	 */
	public function test_get_integrations_returns_registered(): void {
		$integrations = [ 'meta' => $this->mock_integration ];

		$dispatcher = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$this->assertEquals( $integrations, $dispatcher->get_integrations() );
	}

	/**
	 * Test get_integration returns specific integration.
	 */
	public function test_get_integration_returns_specific(): void {
		$integrations = [ 'meta' => $this->mock_integration ];

		$dispatcher = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$this->assertSame( $this->mock_integration, $dispatcher->get_integration( 'meta' ) );
	}

	/**
	 * Test get_integration returns null when not found.
	 */
	public function test_get_integration_returns_null_when_not_found(): void {
		$dispatcher = new WAB_Dispatcher( [], $this->mock_dedup, $this->mock_queue );

		$this->assertNull( $dispatcher->get_integration( 'nonexistent' ) );
	}

	/**
	 * Test has_active_integrations returns true when active.
	 */
	public function test_has_active_integrations_returns_true(): void {
		$this->mock_integration->shouldReceive( 'is_enabled' )->andReturn( true );
		$this->mock_integration->shouldReceive( 'is_configured' )->andReturn( true );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$this->assertTrue( $dispatcher->has_active_integrations() );
	}

	/**
	 * Test has_active_integrations returns false when none active.
	 */
	public function test_has_active_integrations_returns_false_when_none(): void {
		$this->mock_integration->shouldReceive( 'is_enabled' )->andReturn( false );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$this->assertFalse( $dispatcher->has_active_integrations() );
	}

	/**
	 * Test has_active_integrations returns false when enabled but not configured.
	 */
	public function test_has_active_integrations_returns_false_when_not_configured(): void {
		$this->mock_integration->shouldReceive( 'is_enabled' )->andReturn( true );
		$this->mock_integration->shouldReceive( 'is_configured' )->andReturn( false );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$this->assertFalse( $dispatcher->has_active_integrations() );
	}

	/**
	 * Test get_integrations_status returns status array.
	 */
	public function test_get_integrations_status_returns_status(): void {
		$this->mock_integration->shouldReceive( 'get_id' )->andReturn( 'meta' );
		$this->mock_integration->shouldReceive( 'get_name' )->andReturn( 'Meta' );
		$this->mock_integration->shouldReceive( 'is_enabled' )->andReturn( true );
		$this->mock_integration->shouldReceive( 'is_configured' )->andReturn( true );
		$this->mock_integration->shouldReceive( 'validate_settings' )->andReturn( [
			'valid'   => true,
			'missing' => [],
		] );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$status = $dispatcher->get_integrations_status();

		$this->assertArrayHasKey( 'meta', $status );
		$this->assertEquals( 'Meta', $status['meta']['name'] );
		$this->assertTrue( $status['meta']['enabled'] );
		$this->assertTrue( $status['meta']['configured'] );
		$this->assertTrue( $status['meta']['valid'] );
	}

	/**
	 * Test dispatch skips when should_send returns false.
	 */
	public function test_dispatch_skips_when_should_send_false(): void {
		$this->mock_integration->shouldReceive( 'get_id' )->andReturn( 'meta' );
		$this->mock_integration->shouldReceive( 'should_send' )
			->with( $this->mock_order, Mockery::any() )
			->andReturn( false );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$results = $dispatcher->dispatch( $this->mock_order, [] );

		$this->assertTrue( $results['meta']['skipped'] );
		$this->assertFalse( $results['meta']['sent'] );
	}

	/**
	 * Test dispatch skips duplicate.
	 */
	public function test_dispatch_skips_duplicate(): void {
		$this->mock_integration->shouldReceive( 'get_id' )->andReturn( 'meta' );
		$this->mock_integration->shouldReceive( 'should_send' )->andReturn( true );

		$this->mock_dedup->shouldReceive( 'is_duplicate' )
			->with( 123, 'meta' )
			->andReturn( true );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$results = $dispatcher->dispatch( $this->mock_order, [] );

		$this->assertTrue( $results['meta']['skipped'] );
		$this->assertEquals( 'Duplicate event already sent', $results['meta']['reason'] );
	}

	/**
	 * Test dispatch sends successfully.
	 */
	public function test_dispatch_sends_successfully(): void {
		$this->mock_integration->shouldReceive( 'get_id' )->andReturn( 'meta' );
		$this->mock_integration->shouldReceive( 'should_send' )->andReturn( true );
		$this->mock_integration->shouldReceive( 'prepare_payload' )->andReturn( [ 'test' => 'data' ] );
		$this->mock_integration->shouldReceive( 'send' )->andReturn( [ 'success' => true ] );

		$this->mock_dedup->shouldReceive( 'is_duplicate' )->andReturn( false );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$results = $dispatcher->dispatch( $this->mock_order, [] );

		$this->assertTrue( $results['meta']['sent'] );
		$this->assertFalse( $results['meta']['queued'] );
		$this->assertFalse( $results['meta']['skipped'] );
	}

	/**
	 * Test dispatch queues on failure.
	 */
	public function test_dispatch_queues_on_failure(): void {
		$this->mock_integration->shouldReceive( 'get_id' )->andReturn( 'meta' );
		$this->mock_integration->shouldReceive( 'should_send' )->andReturn( true );
		$this->mock_integration->shouldReceive( 'prepare_payload' )->andReturn( [ 'test' => 'data' ] );
		$this->mock_integration->shouldReceive( 'send' )->andReturn( [
			'success' => false,
			'error'   => 'Connection failed',
		] );

		$this->mock_dedup->shouldReceive( 'is_duplicate' )->andReturn( false );

		$this->mock_queue->shouldReceive( 'add' )
			->with( 123, 'meta', Mockery::any() )
			->andReturn( 42 );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$results = $dispatcher->dispatch( $this->mock_order, [] );

		$this->assertFalse( $results['meta']['sent'] );
		$this->assertTrue( $results['meta']['queued'] );
		$this->assertEquals( 42, $results['meta']['queue_id'] );
		$this->assertEquals( 'Connection failed', $results['meta']['error'] );
	}

	/**
	 * Test dispatch handles queue failure.
	 */
	public function test_dispatch_handles_queue_failure(): void {
		global $wab_test_options;
		$wab_test_options['wab_queue_enabled'] = true;

		$this->mock_integration->shouldReceive( 'get_id' )->andReturn( 'meta' );
		$this->mock_integration->shouldReceive( 'should_send' )->andReturn( true );
		$this->mock_integration->shouldReceive( 'prepare_payload' )->andReturn( [ 'test' => 'data' ] );
		$this->mock_integration->shouldReceive( 'send' )->andReturn( [
			'success' => false,
			'error'   => 'API Error',
		] );

		$this->mock_dedup->shouldReceive( 'is_duplicate' )->andReturn( false );

		$this->mock_queue->shouldReceive( 'add' )->andReturn( false );

		$integrations = [ 'meta' => $this->mock_integration ];
		$dispatcher   = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );

		$results = $dispatcher->dispatch( $this->mock_order, [] );

		$this->assertFalse( $results['meta']['sent'] );
		$this->assertFalse( $results['meta']['queued'] );
		$this->assertEquals( 'API Error', $results['meta']['error'] );
	}

	/**
	 * Test dispatch to multiple integrations.
	 */
	public function test_dispatch_to_multiple_integrations(): void {
		$mock_meta   = Mockery::mock( WAB_Integration::class );
		$mock_google = Mockery::mock( WAB_Integration::class );

		$mock_meta->shouldReceive( 'get_id' )->andReturn( 'meta' );
		$mock_meta->shouldReceive( 'should_send' )->andReturn( true );
		$mock_meta->shouldReceive( 'prepare_payload' )->andReturn( [] );
		$mock_meta->shouldReceive( 'send' )->andReturn( [ 'success' => true ] );

		$mock_google->shouldReceive( 'get_id' )->andReturn( 'google' );
		$mock_google->shouldReceive( 'should_send' )->andReturn( false );

		$this->mock_dedup->shouldReceive( 'is_duplicate' )->andReturn( false );

		$integrations = [
			'meta'   => $mock_meta,
			'google' => $mock_google,
		];

		$dispatcher = new WAB_Dispatcher( $integrations, $this->mock_dedup, $this->mock_queue );
		$results    = $dispatcher->dispatch( $this->mock_order, [] );

		$this->assertArrayHasKey( 'meta', $results );
		$this->assertArrayHasKey( 'google', $results );
		$this->assertTrue( $results['meta']['sent'] );
		$this->assertTrue( $results['google']['skipped'] );
	}
}
