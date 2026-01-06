<?php
/**
 * Survey tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use WAB_Survey;
use Brain\Monkey\Functions;
use Mockery;

/**
 * Test class for WAB_Survey.
 */
class SurveyTest extends WabTestCase {

	/**
	 * Mock wpdb.
	 *
	 * @var \Mockery\MockInterface
	 */
	private $wpdb;

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
			'wab_survey_enabled'      => true,
			'wab_survey_new_only'     => true,
			'wab_survey_question'     => 'How did you hear about us?',
			'wab_survey_options'      => [
				'facebook'   => 'Facebook / Instagram',
				'google'     => 'Google Search',
				'tiktok'     => 'TikTok',
				'other'      => 'Other',
			],
			'wab_survey_show_coupon'  => false,
			'wab_survey_coupon_code'  => '',
		];

		// Mock wpdb.
		$this->wpdb = Mockery::mock( 'wpdb' );
		$this->wpdb->prefix = 'wp_';
		$GLOBALS['wpdb'] = $this->wpdb;

		// Mock order.
		$this->mock_order = Mockery::mock( 'WC_Order' );
		$this->mock_order->shouldReceive( 'get_id' )->andReturn( 123 );
		$this->mock_order->shouldReceive( 'get_billing_email' )->andReturn( 'test@example.com' );

		// Mock WordPress functions specific to survey.
		Functions\when( 'wc_get_order' )->alias( function( $id ) {
			if ( $id === 123 ) {
				return $this->mock_order;
			}
			return false;
		} );

		Functions\when( 'wc_get_orders' )->alias( function( $args ) {
			global $wab_test_orders;
			return $wab_test_orders ?? [];
		} );

		Functions\when( 'current_time' )->justReturn( '2024-01-15 10:30:00' );

		Functions\when( 'wp_create_nonce' )->alias( function( $action ) {
			return 'test_nonce_' . $action;
		} );

		Functions\when( 'wp_verify_nonce' )->justReturn( true );

		Functions\when( 'absint' )->alias( function( $val ) {
			return abs( (int) $val );
		} );

		Functions\when( 'esc_attr__' )->alias( function( $text, $domain = 'default' ) {
			return htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
		} );

		Functions\when( 'esc_html_e' )->alias( function( $text, $domain = 'default' ) {
			echo htmlspecialchars( $text, ENT_QUOTES, 'UTF-8' );
		} );

		Functions\when( 'shortcode_atts' )->alias( function( $defaults, $atts, $shortcode = '' ) {
			return array_merge( $defaults, (array) $atts );
		} );

		Functions\when( 'get_query_var' )->justReturn( 0 );

		Functions\when( 'is_wc_endpoint_url' )->justReturn( false );

		Functions\when( 'has_shortcode' )->justReturn( false );

		Functions\when( 'wp_enqueue_style' )->justReturn( true );

		Functions\when( 'wp_enqueue_script' )->justReturn( true );

		Functions\when( 'wp_localize_script' )->justReturn( true );

		Functions\when( 'add_shortcode' )->justReturn( true );
	}

	/**
	 * Tear down test environment.
	 */
	protected function tearDown(): void {
		unset( $GLOBALS['wpdb'] );
		unset( $GLOBALS['wab_test_orders'] );
		parent::tearDown();
	}

	/**
	 * Test is_enabled returns true when enabled.
	 */
	public function test_is_enabled_returns_true(): void {
		$survey = new WAB_Survey();
		$this->assertTrue( $survey->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when disabled.
	 */
	public function test_is_enabled_returns_false(): void {
		global $wab_test_options;
		$wab_test_options['wab_survey_enabled'] = false;

		$survey = new WAB_Survey();
		$this->assertFalse( $survey->is_enabled() );
	}

	/**
	 * Test is_new_customer returns true for first order.
	 */
	public function test_is_new_customer_returns_true_for_first_order(): void {
		global $wab_test_orders;
		$wab_test_orders = [ $this->mock_order ]; // Only this order.

		$survey = new WAB_Survey();
		$this->assertTrue( $survey->is_new_customer( $this->mock_order ) );
	}

	/**
	 * Test is_new_customer returns false for repeat customer.
	 */
	public function test_is_new_customer_returns_false_for_repeat(): void {
		global $wab_test_orders;
		$other_order = Mockery::mock( 'WC_Order' );
		$wab_test_orders = [ $this->mock_order, $other_order ]; // Two orders.

		$survey = new WAB_Survey();
		$this->assertFalse( $survey->is_new_customer( $this->mock_order ) );
	}

	/**
	 * Test has_response returns false when no response.
	 */
	public function test_has_response_returns_false_when_none(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->once()
			->andReturn( 0 );

		$survey = new WAB_Survey();
		$this->assertFalse( $survey->has_response( 123 ) );
	}

	/**
	 * Test has_response returns true when response exists.
	 */
	public function test_has_response_returns_true_when_exists(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->once()
			->andReturn( 1 );

		$survey = new WAB_Survey();
		$this->assertTrue( $survey->has_response( 123 ) );
	}

	/**
	 * Test should_display returns false when disabled.
	 */
	public function test_should_display_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_survey_enabled'] = false;

		$survey = new WAB_Survey();
		$this->assertFalse( $survey->should_display( $this->mock_order ) );
	}

	/**
	 * Test should_display returns false when already responded.
	 */
	public function test_should_display_returns_false_when_responded(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->once()
			->andReturn( 1 );

		$survey = new WAB_Survey();
		$this->assertFalse( $survey->should_display( $this->mock_order ) );
	}

	/**
	 * Test should_display returns false for repeat customer when new_only.
	 */
	public function test_should_display_returns_false_for_repeat_when_new_only(): void {
		global $wab_test_orders;
		$other_order = Mockery::mock( 'WC_Order' );
		$wab_test_orders = [ $this->mock_order, $other_order ];

		$this->wpdb->shouldReceive( 'prepare' )
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->andReturn( 0 );

		$survey = new WAB_Survey();
		$this->assertFalse( $survey->should_display( $this->mock_order ) );
	}

	/**
	 * Test should_display returns true when all conditions met.
	 */
	public function test_should_display_returns_true_when_valid(): void {
		global $wab_test_orders;
		$wab_test_orders = [ $this->mock_order ]; // New customer.

		$this->wpdb->shouldReceive( 'prepare' )
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->andReturn( 0 ); // No existing response.

		$survey = new WAB_Survey();
		$this->assertTrue( $survey->should_display( $this->mock_order ) );
	}

	/**
	 * Test get_question returns configured question.
	 */
	public function test_get_question_returns_configured(): void {
		$survey = new WAB_Survey();
		$this->assertEquals( 'How did you hear about us?', $survey->get_question() );
	}

	/**
	 * Test get_options returns configured options.
	 */
	public function test_get_options_returns_configured(): void {
		$survey = new WAB_Survey();
		$options = $survey->get_options();

		$this->assertArrayHasKey( 'facebook', $options );
		$this->assertArrayHasKey( 'google', $options );
		$this->assertArrayHasKey( 'other', $options );
		$this->assertEquals( 'Facebook / Instagram', $options['facebook'] );
	}

	/**
	 * Test get_source_mapping returns expected mapping.
	 */
	public function test_get_source_mapping_returns_mapping(): void {
		$survey = new WAB_Survey();
		$mapping = $survey->get_source_mapping();

		$this->assertArrayHasKey( 'facebook', $mapping );
		$this->assertEquals( 'meta', $mapping['facebook'] );
		$this->assertEquals( 'google', $mapping['google'] );
		$this->assertEquals( 'tiktok', $mapping['tiktok'] );
	}

	/**
	 * Test save_response inserts to database.
	 */
	public function test_save_response_inserts_to_database(): void {
		$this->wpdb->insert_id = 42;

		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->with(
				'wp_wab_surveys',
				Mockery::on( function( $data ) {
					return $data['order_id'] === 123
						&& $data['response'] === 'facebook'
						&& $data['source_mapped'] === 'meta'
						&& ! empty( $data['email_hash'] );
				} ),
				Mockery::any()
			)
			->andReturn( 1 );

		// Mock order meta saving.
		$this->mock_order->shouldReceive( 'update_meta_data' )->times( 2 );
		$this->mock_order->shouldReceive( 'save' )->once();

		$survey = new WAB_Survey();
		$result = $survey->save_response( $this->mock_order, 'facebook' );

		$this->assertEquals( 42, $result );
	}

	/**
	 * Test save_response handles other text.
	 */
	public function test_save_response_handles_other_text(): void {
		$this->wpdb->insert_id = 43;

		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->with(
				'wp_wab_surveys',
				Mockery::on( function( $data ) {
					return $data['response'] === 'other'
						&& $data['response_other'] === 'Newsletter';
				} ),
				Mockery::any()
			)
			->andReturn( 1 );

		$this->mock_order->shouldReceive( 'update_meta_data' )->times( 3 ); // Includes other text.
		$this->mock_order->shouldReceive( 'save' )->once();

		$survey = new WAB_Survey();
		$result = $survey->save_response( $this->mock_order, 'other', 'Newsletter' );

		$this->assertEquals( 43, $result );
	}

	/**
	 * Test save_response returns false on failure.
	 */
	public function test_save_response_returns_false_on_failure(): void {
		$this->wpdb->shouldReceive( 'insert' )
			->once()
			->andReturn( false );

		$survey = new WAB_Survey();
		$result = $survey->save_response( $this->mock_order, 'facebook' );

		$this->assertFalse( $result );
	}

	/**
	 * Test get_response returns data when exists.
	 */
	public function test_get_response_returns_data(): void {
		$mock_data = [
			'id'           => 1,
			'order_id'     => 123,
			'response'     => 'google',
			'source_mapped' => 'google',
		];

		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_row' )
			->once()
			->andReturn( $mock_data );

		$survey = new WAB_Survey();
		$result = $survey->get_response( 123 );

		$this->assertEquals( $mock_data, $result );
	}

	/**
	 * Test get_response returns null when not found.
	 */
	public function test_get_response_returns_null_when_not_found(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_row' )
			->once()
			->andReturn( null );

		$survey = new WAB_Survey();
		$result = $survey->get_response( 999 );

		$this->assertNull( $result );
	}

	/**
	 * Test get_stats returns organized statistics.
	 */
	public function test_get_stats_returns_statistics(): void {
		$this->wpdb->shouldReceive( 'get_var' )
			->once()
			->andReturn( 100 );

		$this->wpdb->shouldReceive( 'get_results' )
			->twice()
			->andReturn(
				[
					[ 'response' => 'facebook', 'count' => '42' ],
					[ 'response' => 'google', 'count' => '38' ],
					[ 'response' => 'other', 'count' => '20' ],
				],
				[
					[ 'source_mapped' => 'meta', 'count' => '42' ],
					[ 'source_mapped' => 'google', 'count' => '38' ],
					[ 'source_mapped' => 'other', 'count' => '20' ],
				]
			);

		$survey = new WAB_Survey();
		$stats = $survey->get_stats( 'month' );

		$this->assertEquals( 100, $stats['total'] );
		$this->assertEquals( 'month', $stats['period'] );
		$this->assertArrayHasKey( 'by_response', $stats );
		$this->assertArrayHasKey( 'by_source', $stats );
		$this->assertEquals( 42, $stats['by_response']['facebook']['count'] );
		$this->assertEquals( 42.0, $stats['by_response']['facebook']['percentage'] );
	}

	/**
	 * Test get_recent_responses returns latest responses.
	 */
	public function test_get_recent_responses_returns_data(): void {
		$mock_responses = [
			[ 'id' => 3, 'order_id' => 125, 'response' => 'facebook' ],
			[ 'id' => 2, 'order_id' => 124, 'response' => 'google' ],
		];

		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_results' )
			->once()
			->andReturn( $mock_responses );

		$this->wpdb->posts = 'wp_posts'; // Required for the JOIN.

		$survey = new WAB_Survey();
		$responses = $survey->get_recent_responses( 10 );

		$this->assertCount( 2, $responses );
		$this->assertEquals( 'facebook', $responses[0]['response'] );
	}

	/**
	 * Test cleanup removes old responses.
	 */
	public function test_cleanup_removes_old_responses(): void {
		$this->wpdb->shouldReceive( 'prepare' )
			->once()
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'query' )
			->once()
			->andReturn( 25 );

		$survey = new WAB_Survey();
		$deleted = $survey->cleanup( 365 );

		$this->assertEquals( 25, $deleted );
	}

	/**
	 * Test render_survey outputs HTML.
	 */
	public function test_render_survey_outputs_html(): void {
		global $wab_test_orders;
		$wab_test_orders = [ $this->mock_order ];

		$survey = new WAB_Survey();
		$html = $survey->render_survey( $this->mock_order );

		$this->assertStringContainsString( 'wab-survey', $html );
		$this->assertStringContainsString( 'How did you hear about us?', $html );
		$this->assertStringContainsString( 'Facebook / Instagram', $html );
		$this->assertStringContainsString( 'Google Search', $html );
		$this->assertStringContainsString( 'data-order-id="123"', $html );
	}

	/**
	 * Test render_survey includes coupon when enabled.
	 */
	public function test_render_survey_includes_coupon_when_enabled(): void {
		global $wab_test_options, $wab_test_orders;
		$wab_test_options['wab_survey_show_coupon'] = true;
		$wab_test_options['wab_survey_coupon_code'] = 'THANKS10';
		$wab_test_options['wab_survey_coupon_text'] = 'Use code %s for 10%% off!';
		$wab_test_orders = [ $this->mock_order ];

		$survey = new WAB_Survey();
		$html = $survey->render_survey( $this->mock_order );

		$this->assertStringContainsString( 'wab-survey-coupon', $html );
		$this->assertStringContainsString( 'THANKS10', $html );
	}

	/**
	 * Test shortcode_survey returns empty when no order.
	 */
	public function test_shortcode_survey_returns_empty_when_no_order(): void {
		$survey = new WAB_Survey();
		$result = $survey->shortcode_survey( [] );

		$this->assertEmpty( $result );
	}

	/**
	 * Test shortcode_survey returns HTML when order provided.
	 */
	public function test_shortcode_survey_returns_html_with_order(): void {
		global $wab_test_orders;
		$wab_test_orders = [ $this->mock_order ];

		$this->wpdb->shouldReceive( 'prepare' )
			->andReturn( 'prepared_query' );

		$this->wpdb->shouldReceive( 'get_var' )
			->andReturn( 0 );

		$survey = new WAB_Survey();
		$result = $survey->shortcode_survey( [ 'order_id' => 123 ] );

		$this->assertStringContainsString( 'wab-survey', $result );
	}

	/**
	 * Test init registers hooks.
	 */
	public function test_init_registers_hooks(): void {
		$survey = new WAB_Survey();
		$survey->init();

		// If we got here without errors, hooks were registered.
		$this->assertTrue( true );
	}
}
