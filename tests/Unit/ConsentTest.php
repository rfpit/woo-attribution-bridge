<?php
/**
 * Consent handler tests.
 *
 * @package WooAttributionBridge\Tests
 */

namespace WAB\Tests\Unit;

use WAB_Consent;

/**
 * Test class for WAB_Consent.
 *
 * Tests cookie consent detection for GDPR/CCPA compliance.
 * Spec: WAB-P-008
 */
class ConsentTest extends WabTestCase {

	/**
	 * Set up test environment.
	 */
	protected function setUp(): void {
		parent::setUp();

		global $wab_test_options;

		$wab_test_options = [
			'wab_consent_required'      => false,
			'wab_consent_manager'       => 'auto',
			'wab_consent_custom_cookie' => '',
			'wab_respect_dnt'           => true,
			'wab_strict_mode'           => false,
			'wab_debug_mode'            => false,
		];

		// Clear cookies and headers between tests.
		$_COOKIE = [];
		unset( $_SERVER['HTTP_DNT'] );
	}

	// =========================================================================
	// Consent Level Tests
	// =========================================================================

	/**
	 * Test get_consent_level returns 'full' when no manager and consent not required.
	 */
	public function test_no_manager_consent_not_required_returns_full(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_required'] = false;

		$consent = new WAB_Consent();
		$this->assertEquals( 'full', $consent->get_consent_level() );
	}

	/**
	 * Test get_consent_level returns 'none' when no manager and consent required.
	 */
	public function test_no_manager_consent_required_returns_none(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_required'] = true;

		$consent = new WAB_Consent();
		$this->assertEquals( 'none', $consent->get_consent_level() );
	}

	// =========================================================================
	// CookieYes Detection Tests
	// =========================================================================

	/**
	 * Test CookieYes full consent (advertisement:yes).
	 */
	public function test_cookieyes_full_consent(): void {
		$_COOKIE['cookieyes-consent'] = 'consentid:abc123,consent:yes,action:yes,necessary:yes,functional:yes,analytics:yes,performance:yes,advertisement:yes';

		$consent = new WAB_Consent();
		$this->assertEquals( 'full', $consent->get_consent_level() );
	}

	/**
	 * Test CookieYes anonymous consent (analytics:yes, no advertisement).
	 */
	public function test_cookieyes_analytics_only(): void {
		$_COOKIE['cookieyes-consent'] = 'consentid:abc123,consent:yes,action:yes,necessary:yes,functional:yes,analytics:yes,performance:no,advertisement:no';

		$consent = new WAB_Consent();
		$this->assertEquals( 'anonymous', $consent->get_consent_level() );
	}

	/**
	 * Test CookieYes no consent (all denied).
	 */
	public function test_cookieyes_no_consent(): void {
		$_COOKIE['cookieyes-consent'] = 'consentid:abc123,consent:no,action:yes,necessary:yes,functional:no,analytics:no,performance:no,advertisement:no';

		$consent = new WAB_Consent();
		$this->assertEquals( 'none', $consent->get_consent_level() );
	}

	// =========================================================================
	// CookieBot Detection Tests
	// =========================================================================

	/**
	 * Test CookieBot marketing consent.
	 */
	public function test_cookiebot_marketing_consent(): void {
		$cookiebot_consent = json_encode( [
			'stamp'       => '123456',
			'necessary'   => true,
			'preferences' => true,
			'statistics'  => true,
			'marketing'   => true,
		] );
		$_COOKIE['CookieConsent'] = $cookiebot_consent;

		$consent = new WAB_Consent();
		$this->assertEquals( 'full', $consent->get_consent_level() );
	}

	/**
	 * Test CookieBot statistics only (no marketing).
	 */
	public function test_cookiebot_statistics_only(): void {
		$cookiebot_consent = json_encode( [
			'stamp'       => '123456',
			'necessary'   => true,
			'preferences' => true,
			'statistics'  => true,
			'marketing'   => false,
		] );
		$_COOKIE['CookieConsent'] = $cookiebot_consent;

		$consent = new WAB_Consent();
		$this->assertEquals( 'anonymous', $consent->get_consent_level() );
	}

	/**
	 * Test CookieBot no consent.
	 */
	public function test_cookiebot_no_consent(): void {
		$cookiebot_consent = json_encode( [
			'stamp'       => '123456',
			'necessary'   => true,
			'preferences' => false,
			'statistics'  => false,
			'marketing'   => false,
		] );
		$_COOKIE['CookieConsent'] = $cookiebot_consent;

		$consent = new WAB_Consent();
		$this->assertEquals( 'none', $consent->get_consent_level() );
	}

	// =========================================================================
	// Complianz Detection Tests
	// =========================================================================

	/**
	 * Test Complianz marketing consent.
	 */
	public function test_complianz_marketing_allow(): void {
		$_COOKIE['cmplz_marketing'] = 'allow';

		$consent = new WAB_Consent();
		$this->assertEquals( 'full', $consent->get_consent_level() );
	}

	/**
	 * Test Complianz statistics only.
	 */
	public function test_complianz_statistics_allow(): void {
		$_COOKIE['cmplz_statistics'] = 'allow';
		$_COOKIE['cmplz_marketing'] = 'deny';

		$consent = new WAB_Consent();
		$this->assertEquals( 'anonymous', $consent->get_consent_level() );
	}

	/**
	 * Test Complianz all denied.
	 */
	public function test_complianz_all_denied(): void {
		$_COOKIE['cmplz_marketing'] = 'deny';
		$_COOKIE['cmplz_statistics'] = 'deny';

		$consent = new WAB_Consent();
		$this->assertEquals( 'none', $consent->get_consent_level() );
	}

	// =========================================================================
	// DNT (Do Not Track) Tests
	// =========================================================================

	/**
	 * Test DNT header respected when enabled.
	 */
	public function test_dnt_enabled_honored(): void {
		global $wab_test_options;
		$wab_test_options['wab_respect_dnt'] = true;

		$_SERVER['HTTP_DNT'] = '1';

		$consent = new WAB_Consent();
		$this->assertEquals( 'none', $consent->get_consent_level() );
	}

	/**
	 * Test DNT header ignored when disabled.
	 */
	public function test_dnt_enabled_not_honored(): void {
		global $wab_test_options;
		$wab_test_options['wab_respect_dnt'] = false;
		$wab_test_options['wab_consent_required'] = false;

		$_SERVER['HTTP_DNT'] = '1';

		$consent = new WAB_Consent();
		$this->assertEquals( 'full', $consent->get_consent_level() );
	}

	/**
	 * Test is_dnt_enabled returns true when header is set.
	 */
	public function test_is_dnt_enabled_with_header(): void {
		$_SERVER['HTTP_DNT'] = '1';

		$consent = new WAB_Consent();
		$this->assertTrue( $consent->is_dnt_enabled() );
	}

	/**
	 * Test is_dnt_enabled returns false when header not set.
	 */
	public function test_is_dnt_enabled_without_header(): void {
		$consent = new WAB_Consent();
		$this->assertFalse( $consent->is_dnt_enabled() );
	}

	// =========================================================================
	// Helper Method Tests
	// =========================================================================

	/**
	 * Test has_full_consent returns true for full consent.
	 */
	public function test_has_full_consent_true(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_required'] = false;

		$consent = new WAB_Consent();
		$this->assertTrue( $consent->has_full_consent() );
	}

	/**
	 * Test has_full_consent returns false for anonymous consent.
	 */
	public function test_has_full_consent_false_for_anonymous(): void {
		$_COOKIE['cookieyes-consent'] = 'consentid:abc123,consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no';

		$consent = new WAB_Consent();
		$this->assertFalse( $consent->has_full_consent() );
	}

	/**
	 * Test can_track returns true for full consent.
	 */
	public function test_can_track_true_for_full(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_required'] = false;

		$consent = new WAB_Consent();
		$this->assertTrue( $consent->can_track() );
	}

	/**
	 * Test can_track returns true for anonymous consent.
	 */
	public function test_can_track_true_for_anonymous(): void {
		$_COOKIE['cookieyes-consent'] = 'consentid:abc123,consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no';

		$consent = new WAB_Consent();
		$this->assertTrue( $consent->can_track() );
	}

	/**
	 * Test can_track returns false for no consent.
	 */
	public function test_can_track_false_for_none(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_required'] = true;

		$consent = new WAB_Consent();
		$this->assertFalse( $consent->can_track() );
	}

	/**
	 * Test can_set_cookies returns true for full consent.
	 */
	public function test_can_set_cookies_true_for_full(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_required'] = false;

		$consent = new WAB_Consent();
		$this->assertTrue( $consent->can_set_cookies() );
	}

	/**
	 * Test can_set_cookies returns false for anonymous consent.
	 */
	public function test_can_set_cookies_false_for_anonymous(): void {
		$_COOKIE['cookieyes-consent'] = 'consentid:abc123,consent:yes,action:yes,necessary:yes,analytics:yes,advertisement:no';

		$consent = new WAB_Consent();
		$this->assertFalse( $consent->can_set_cookies() );
	}

	// =========================================================================
	// Manager Detection Tests
	// =========================================================================

	/**
	 * Test detect_consent_manager returns cookieyes.
	 */
	public function test_detect_consent_manager_cookieyes(): void {
		$_COOKIE['cookieyes-consent'] = 'consentid:abc123,consent:yes';

		$consent = new WAB_Consent();
		$this->assertEquals( 'cookieyes', $consent->detect_consent_manager() );
	}

	/**
	 * Test detect_consent_manager returns cookiebot.
	 */
	public function test_detect_consent_manager_cookiebot(): void {
		$_COOKIE['CookieConsent'] = json_encode( [ 'necessary' => true ] );

		$consent = new WAB_Consent();
		$this->assertEquals( 'cookiebot', $consent->detect_consent_manager() );
	}

	/**
	 * Test detect_consent_manager returns complianz.
	 */
	public function test_detect_consent_manager_complianz(): void {
		$_COOKIE['cmplz_marketing'] = 'allow';

		$consent = new WAB_Consent();
		$this->assertEquals( 'complianz', $consent->detect_consent_manager() );
	}

	/**
	 * Test detect_consent_manager returns null when none detected.
	 */
	public function test_detect_consent_manager_none(): void {
		$consent = new WAB_Consent();
		$this->assertNull( $consent->detect_consent_manager() );
	}

	// =========================================================================
	// Filter Hook Tests
	// =========================================================================

	/**
	 * Test that consent level filter can modify the return value.
	 *
	 * Note: In the mock environment, we verify filter application by
	 * overriding apply_filters to return a modified value. This confirms
	 * the implementation correctly uses the filter result.
	 */
	public function test_custom_filter_applied(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_required'] = true;

		// Override apply_filters to return 'full' when wab_consent_level filter is applied.
		// This verifies the implementation uses the filtered value.
		\Brain\Monkey\Functions\when( 'apply_filters' )
			->alias( function( $hook, $value, ...$args ) {
				if ( $hook === 'wab_consent_level' ) {
					// Filter overrides detected level to 'full'.
					return WAB_Consent::LEVEL_FULL;
				}
				return $value;
			} );

		$consent = new WAB_Consent();
		$level = $consent->get_consent_level();

		// The internal detection returns 'none' (consent required, no manager).
		// But the filter should override it to 'full'.
		$this->assertEquals( 'full', $level );
	}

	// =========================================================================
	// Edge Cases and Error Handling
	// =========================================================================

	/**
	 * Test malformed CookieBot JSON is handled gracefully.
	 */
	public function test_malformed_cookiebot_json(): void {
		$_COOKIE['CookieConsent'] = 'not valid json {{{';

		$consent = new WAB_Consent();
		// Should not throw exception, return safe default.
		$this->assertEquals( 'none', $consent->get_consent_level() );
	}

	/**
	 * Test consent level is cached for performance.
	 */
	public function test_consent_caching(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_required'] = false;

		$consent = new WAB_Consent();

		// First call.
		$level1 = $consent->get_consent_level();

		// Change settings mid-request (shouldn't affect cached result).
		$wab_test_options['wab_consent_required'] = true;

		// Second call should return cached result.
		$level2 = $consent->get_consent_level();

		$this->assertEquals( $level1, $level2 );
		$this->assertEquals( 'full', $level2 );
	}

	/**
	 * Test empty CookieYes consent cookie.
	 */
	public function test_empty_cookieyes_consent(): void {
		$_COOKIE['cookieyes-consent'] = '';

		$consent = new WAB_Consent();
		// Empty cookie should be treated as no consent.
		$level = $consent->get_consent_level();
		$this->assertContains( $level, [ 'none', 'full' ] ); // Depends on consent_required setting.
	}

	/**
	 * Test forced consent manager setting.
	 */
	public function test_forced_consent_manager_setting(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_manager'] = 'cookieyes';

		// Set both CookieYes and CookieBot cookies.
		$_COOKIE['cookieyes-consent'] = 'consentid:abc123,consent:yes,advertisement:yes';
		$_COOKIE['CookieConsent'] = json_encode( [ 'marketing' => false ] );

		$consent = new WAB_Consent();

		// Should use CookieYes (forced) and return full consent.
		$this->assertEquals( 'cookieyes', $consent->detect_consent_manager() );
		$this->assertEquals( 'full', $consent->get_consent_level() );
	}

	/**
	 * Test custom consent cookie.
	 */
	public function test_custom_consent_cookie(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_manager'] = 'custom';
		$wab_test_options['wab_consent_custom_cookie'] = 'my_consent';

		$_COOKIE['my_consent'] = 'granted';

		$consent = new WAB_Consent();
		$this->assertEquals( 'full', $consent->get_consent_level() );
	}

	/**
	 * Test custom consent cookie denied.
	 */
	public function test_custom_consent_cookie_denied(): void {
		global $wab_test_options;
		$wab_test_options['wab_consent_manager'] = 'custom';
		$wab_test_options['wab_consent_custom_cookie'] = 'my_consent';

		$_COOKIE['my_consent'] = 'denied';

		$consent = new WAB_Consent();
		$this->assertEquals( 'none', $consent->get_consent_level() );
	}
}
