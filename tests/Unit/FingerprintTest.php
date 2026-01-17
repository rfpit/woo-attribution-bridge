<?php
/**
 * Fingerprint handler tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use Brain\Monkey\Functions;
use WAB_Fingerprint;

/**
 * Tests for WAB_Fingerprint class.
 */
class FingerprintTest extends WabTestCase {

	/**
	 * Instance under test.
	 *
	 * @var WAB_Fingerprint
	 */
	private WAB_Fingerprint $fingerprint;

	/**
	 * Mock wpdb instance.
	 *
	 * @var object
	 */
	private $wpdb;

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		// Set up default options.
		global $wab_test_options;
		$wab_test_options = [
			'wab_fingerprint_enabled'        => true,
			'wab_fingerprint_min_confidence' => 0.75,
			'wab_fingerprint_ttl'            => 90,
			'wab_fingerprint_components'     => [
				'canvas'   => true,
				'webgl'    => true,
				'audio'    => true,
				'screen'   => true,
				'timezone' => true,
				'fonts'    => false,
			],
			'wab_debug_mode' => false,
		];

		// Mock wpdb.
		$this->wpdb = $this->create_wpdb_mock();
		$GLOBALS['wpdb'] = $this->wpdb;

		// Additional WordPress function mocks.
		Functions\when( 'wp_create_nonce' )->justReturn( 'test-nonce-12345' );
		Functions\when( 'check_ajax_referer' )->justReturn( true );
		Functions\when( 'wp_send_json_success' )->alias( function( $data ) {
			return [ 'success' => true, 'data' => $data ];
		} );
		Functions\when( 'wp_send_json_error' )->alias( function( $data ) {
			return [ 'success' => false, 'data' => $data ];
		} );
		Functions\when( 'wp_enqueue_script' )->justReturn( true );
		Functions\when( 'wp_localize_script' )->justReturn( true );
		Functions\when( 'plugins_url' )->justReturn( 'https://example.com/wp-content/plugins/woo-attribution-bridge/assets/js/wab-fingerprint.js' );

		// Mock constants.
		if ( ! defined( 'WAB_VERSION' ) ) {
			define( 'WAB_VERSION', '1.1.0' );
		}

		$this->fingerprint = new WAB_Fingerprint();
	}

	/**
	 * Create a mock wpdb instance.
	 */
	private function create_wpdb_mock(): object {
		$wpdb = new class {
			public string $prefix = 'wp_';
			public array $insert_data = [];
			public array $update_data = [];
			public ?array $last_query_result = null;

			public function prepare( $query, ...$args ) {
				return vsprintf( str_replace( [ '%s', '%d', '%f' ], [ "'%s'", '%d', '%f' ], $query ), $args );
			}

			public function insert( $table, $data, $format = null ) {
				$this->insert_data = [ 'table' => $table, 'data' => $data ];
				return true;
			}

			public function update( $table, $data, $where, $format = null, $where_format = null ) {
				$this->update_data = [ 'table' => $table, 'data' => $data, 'where' => $where ];
				return true;
			}

			public function get_row( $query, $output = OBJECT ) {
				return $this->last_query_result;
			}

			public function get_var( $query ) {
				if ( strpos( $query, 'COUNT(*)' ) !== false ) {
					return 10;
				}
				if ( strpos( $query, 'AVG(confidence)' ) !== false ) {
					return 0.85;
				}
				if ( strpos( $query, 'AVG(hit_count)' ) !== false ) {
					return 2.5;
				}
				return null;
			}

			public function query( $query ) {
				return true;
			}
		};

		return $wpdb;
	}

	/**
	 * Test is_enabled returns true when setting is enabled.
	 */
	public function test_is_enabled_returns_true_when_enabled(): void {
		$this->assertTrue( $this->fingerprint->is_enabled() );
	}

	/**
	 * Test is_enabled returns false when setting is disabled.
	 */
	public function test_is_enabled_returns_false_when_disabled(): void {
		global $wab_test_options;
		$wab_test_options['wab_fingerprint_enabled'] = false;

		$fingerprint = new WAB_Fingerprint();
		$this->assertFalse( $fingerprint->is_enabled() );
	}

	/**
	 * Test get_components_config returns default configuration.
	 */
	public function test_get_components_config_returns_configuration(): void {
		$config = $this->fingerprint->get_components_config();

		$this->assertIsArray( $config );
		$this->assertTrue( $config['canvas'] );
		$this->assertTrue( $config['webgl'] );
		$this->assertTrue( $config['audio'] );
		$this->assertTrue( $config['screen'] );
		$this->assertTrue( $config['timezone'] );
		$this->assertFalse( $config['fonts'] ); // Disabled by default.
	}

	/**
	 * Test get_min_confidence returns configured threshold.
	 */
	public function test_get_min_confidence_returns_configured_value(): void {
		$this->assertEquals( 0.75, $this->fingerprint->get_min_confidence() );
	}

	/**
	 * Test get_ttl_days returns configured value.
	 */
	public function test_get_ttl_days_returns_configured_value(): void {
		$this->assertEquals( 90, $this->fingerprint->get_ttl_days() );
	}

	/**
	 * Test store_fingerprint inserts new record.
	 */
	public function test_store_fingerprint_inserts_new_record(): void {
		$hash = hash( 'sha256', 'test-fingerprint-data' );
		$data = [
			'components'   => 'canvas,webgl,audio',
			'visitor_id'   => 'visitor-123',
			'click_ids'    => [ 'gclid' => 'test-gclid' ],
			'utm_params'   => [ 'utm_source' => 'google' ],
			'landing_page' => 'https://example.com/product',
			'referrer'     => 'https://google.com',
		];

		$result = $this->fingerprint->store_fingerprint( $hash, $data );

		$this->assertIsArray( $result );
		$this->assertTrue( $result['inserted'] );
		$this->assertEquals( 'wp_wab_fingerprints', $this->wpdb->insert_data['table'] );
		$this->assertEquals( $hash, $this->wpdb->insert_data['data']['fingerprint_hash'] );
		$this->assertEquals( 'visitor-123', $this->wpdb->insert_data['data']['visitor_id'] );
	}

	/**
	 * Test store_fingerprint updates existing record.
	 */
	public function test_store_fingerprint_updates_existing_record(): void {
		$hash = hash( 'sha256', 'existing-fingerprint' );

		// Set up existing record.
		$this->wpdb->last_query_result = [
			'id'               => 1,
			'fingerprint_hash' => $hash,
			'visitor_id'       => null,
			'components'       => 'canvas,webgl',
			'click_ids'        => '{"fbclid":"existing-fbclid"}',
			'utm_params'       => '{"utm_source":"facebook"}',
			'landing_page'     => 'https://example.com/old',
			'referrer'         => null,
			'confidence'       => 0.85,
			'hit_count'        => 1,
		];

		$data = [
			'components'   => 'canvas,webgl,audio',
			'visitor_id'   => 'visitor-456',
			'click_ids'    => [ 'gclid' => 'new-gclid' ],
			'utm_params'   => [],
			'landing_page' => 'https://example.com/new',
			'referrer'     => 'https://google.com',
		];

		$result = $this->fingerprint->store_fingerprint( $hash, $data );

		$this->assertIsArray( $result );
		$this->assertTrue( $result['updated'] );
		// Should have merged click IDs.
		$this->assertEquals( 2, $this->wpdb->update_data['data']['hit_count'] );
	}

	/**
	 * Test get_attribution returns attribution data for valid fingerprint.
	 */
	public function test_get_attribution_returns_data_for_valid_fingerprint(): void {
		$hash = hash( 'sha256', 'valid-fingerprint' );

		$this->wpdb->last_query_result = [
			'id'               => 1,
			'fingerprint_hash' => $hash,
			'visitor_id'       => 'visitor-789',
			'components'       => 'canvas,webgl',
			'click_ids'        => '{"gclid":"test-gclid","fbclid":"test-fbclid"}',
			'utm_params'       => '{"utm_source":"google","utm_medium":"cpc"}',
			'landing_page'     => 'https://example.com/landing',
			'referrer'         => 'https://google.com/search',
			'confidence'       => 0.90,
			'hit_count'        => 5,
		];

		$attribution = $this->fingerprint->get_attribution( $hash );

		$this->assertIsArray( $attribution );
		$this->assertEquals( 'test-gclid', $attribution['gclid'] );
		$this->assertEquals( 'test-fbclid', $attribution['fbclid'] );
		$this->assertEquals( 'google', $attribution['utm']['utm_source'] );
		$this->assertEquals( 'cpc', $attribution['utm']['utm_medium'] );
		$this->assertEquals( 'https://example.com/landing', $attribution['landing_page'] );
		$this->assertEquals( 'https://google.com/search', $attribution['referrer'] );
		$this->assertEquals( 'fingerprint', $attribution['_source'] );
		$this->assertEquals( 0.90, $attribution['_confidence'] );
	}

	/**
	 * Test get_attribution returns null when fingerprint not found.
	 */
	public function test_get_attribution_returns_null_when_not_found(): void {
		$this->wpdb->last_query_result = null;

		$attribution = $this->fingerprint->get_attribution( 'nonexistent-hash' );

		$this->assertNull( $attribution );
	}

	/**
	 * Test get_attribution_by_visitor returns attribution data.
	 */
	public function test_get_attribution_by_visitor_returns_data(): void {
		$this->wpdb->last_query_result = [
			'id'               => 1,
			'fingerprint_hash' => 'test-hash',
			'visitor_id'       => 'visitor-123',
			'components'       => 'canvas,webgl',
			'click_ids'        => '{"ttclid":"test-ttclid"}',
			'utm_params'       => '{}',
			'landing_page'     => 'https://example.com',
			'referrer'         => null,
			'confidence'       => 0.88,
			'hit_count'        => 3,
		];

		$attribution = $this->fingerprint->get_attribution_by_visitor( 'visitor-123' );

		$this->assertIsArray( $attribution );
		$this->assertEquals( 'test-ttclid', $attribution['ttclid'] );
		$this->assertEquals( 'fingerprint', $attribution['_source'] );
	}

	/**
	 * Test link_visitor updates fingerprint record.
	 */
	public function test_link_visitor_updates_fingerprint(): void {
		$hash       = 'test-fingerprint-hash';
		$visitor_id = 'visitor-to-link';

		$result = $this->fingerprint->link_visitor( $hash, $visitor_id );

		$this->assertTrue( $result );
		$this->assertEquals( 'wp_wab_fingerprints', $this->wpdb->update_data['table'] );
		$this->assertEquals( $visitor_id, $this->wpdb->update_data['data']['visitor_id'] );
		$this->assertEquals( 0.90, $this->wpdb->update_data['data']['confidence'] );
	}

	/**
	 * Test get_stats returns statistics.
	 */
	public function test_get_stats_returns_statistics(): void {
		$stats = $this->fingerprint->get_stats();

		$this->assertIsArray( $stats );
		$this->assertArrayHasKey( 'total_fingerprints', $stats );
		$this->assertArrayHasKey( 'with_click_ids', $stats );
		$this->assertArrayHasKey( 'attribution_rate', $stats );
		$this->assertArrayHasKey( 'avg_confidence', $stats );
		$this->assertArrayHasKey( 'avg_hits', $stats );
	}

	/**
	 * Test first touch and last touch are set in attribution.
	 */
	public function test_attribution_includes_first_and_last_touch(): void {
		$this->wpdb->last_query_result = [
			'id'               => 1,
			'fingerprint_hash' => 'test-hash',
			'visitor_id'       => 'visitor-123',
			'components'       => 'canvas',
			'click_ids'        => '{"gclid":"touch-gclid"}',
			'utm_params'       => '{}',
			'landing_page'     => null,
			'referrer'         => null,
			'confidence'       => 0.80,
			'hit_count'        => 1,
		];

		$attribution = $this->fingerprint->get_attribution( 'test-hash' );

		$this->assertArrayHasKey( 'first_touch', $attribution );
		$this->assertArrayHasKey( 'last_touch', $attribution );
		$this->assertEquals( 'touch-gclid', $attribution['first_touch']['gclid'] );
		$this->assertEquals( 'touch-gclid', $attribution['last_touch']['gclid'] );
	}

	/**
	 * Test confidence increases on update.
	 */
	public function test_confidence_increases_on_update(): void {
		$hash = hash( 'sha256', 'returning-visitor' );

		$this->wpdb->last_query_result = [
			'id'               => 1,
			'fingerprint_hash' => $hash,
			'visitor_id'       => null,
			'components'       => 'canvas',
			'click_ids'        => '{}',
			'utm_params'       => '{}',
			'landing_page'     => null,
			'referrer'         => null,
			'confidence'       => 0.85,
			'hit_count'        => 5,
		];

		$this->fingerprint->store_fingerprint( $hash, [] );

		// Confidence should increase by 0.02 to 0.87.
		$this->assertEquals( 0.87, $this->wpdb->update_data['data']['confidence'] );
	}

	/**
	 * Test confidence is capped at 0.95.
	 */
	public function test_confidence_is_capped_at_maximum(): void {
		$hash = hash( 'sha256', 'frequent-visitor' );

		$this->wpdb->last_query_result = [
			'id'               => 1,
			'fingerprint_hash' => $hash,
			'visitor_id'       => null,
			'components'       => 'canvas',
			'click_ids'        => '{}',
			'utm_params'       => '{}',
			'landing_page'     => null,
			'referrer'         => null,
			'confidence'       => 0.94, // Near cap.
			'hit_count'        => 50,
		];

		$this->fingerprint->store_fingerprint( $hash, [] );

		// Confidence should be capped at 0.95.
		$this->assertEquals( 0.95, $this->wpdb->update_data['data']['confidence'] );
	}
}
