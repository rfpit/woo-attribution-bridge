<?php
/**
 * Settings page view.
 *
 * @package WooAttributionBridge
 * @var string $current_tab Current tab slug.
 * @var array  $tabs        Available tabs.
 */

defined( 'ABSPATH' ) || exit;
?>

<div class="wrap">
	<h1><?php esc_html_e( 'Attribution Bridge Settings', 'woo-attribution-bridge' ); ?></h1>

	<nav class="nav-tab-wrapper">
		<?php foreach ( $tabs as $tab_id => $tab_name ) : ?>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=wab-settings&tab=' . $tab_id ) ); ?>"
			   class="nav-tab <?php echo $current_tab === $tab_id ? 'nav-tab-active' : ''; ?>">
				<?php echo esc_html( $tab_name ); ?>
			</a>
		<?php endforeach; ?>
	</nav>

	<form method="post" action="options.php">
		<?php
		switch ( $current_tab ) {
			case 'dashboard':
				settings_fields( 'wab_dashboard' );
				$is_connected = ! empty( get_option( 'wab_api_key' ) ) && ! empty( get_option( 'wab_dashboard_url' ) );
				?>
				<h2><?php esc_html_e( 'Dashboard Connection', 'woo-attribution-bridge' ); ?></h2>
				<p><?php esc_html_e( 'Connect this store to your Attribution Bridge dashboard to centralize analytics and manage all your stores in one place.', 'woo-attribution-bridge' ); ?></p>

				<?php if ( $is_connected ) : ?>
					<div class="notice notice-success inline" style="margin: 10px 0;">
						<p><strong><?php esc_html_e( 'Connected', 'woo-attribution-bridge' ); ?></strong> - <?php esc_html_e( 'This store is connected to the dashboard.', 'woo-attribution-bridge' ); ?></p>
					</div>
				<?php else : ?>
					<div class="notice notice-warning inline" style="margin: 10px 0;">
						<p><strong><?php esc_html_e( 'Not Connected', 'woo-attribution-bridge' ); ?></strong> - <?php esc_html_e( 'Enter your Dashboard URL and API Key to connect.', 'woo-attribution-bridge' ); ?></p>
					</div>
				<?php endif; ?>

				<table class="form-table">
					<?php
					WAB_Settings::render_checkbox_field(
						'wab_dashboard_enabled',
						__( 'Enable Dashboard Sync', 'woo-attribution-bridge' ),
						__( 'Send attribution data to the centralized dashboard', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_text_field(
						'wab_dashboard_url',
						__( 'Dashboard URL', 'woo-attribution-bridge' ),
						__( 'The URL of your Attribution Bridge dashboard (e.g., https://attribution.example.com)', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_text_field(
						'wab_api_key',
						__( 'API Key', 'woo-attribution-bridge' ),
						__( 'The API key from your dashboard (found when you add this store)', 'woo-attribution-bridge' ),
						'password'
					);
					?>
				</table>

				<div class="card" style="max-width: 600px; margin-top: 20px;">
					<h3><?php esc_html_e( 'How to Connect', 'woo-attribution-bridge' ); ?></h3>
					<ol>
						<li><?php esc_html_e( 'Log in to your Attribution Bridge dashboard', 'woo-attribution-bridge' ); ?></li>
						<li><?php esc_html_e( 'Go to Stores and click "Add Store"', 'woo-attribution-bridge' ); ?></li>
						<li><?php esc_html_e( 'Select WooCommerce and enter your store details', 'woo-attribution-bridge' ); ?></li>
						<li><?php esc_html_e( 'Copy the generated API Key', 'woo-attribution-bridge' ); ?></li>
						<li><?php esc_html_e( 'Paste it here along with your Dashboard URL', 'woo-attribution-bridge' ); ?></li>
						<li><?php esc_html_e( 'Click Save Changes', 'woo-attribution-bridge' ); ?></li>
					</ol>
				</div>
				<?php
				break;

			case 'meta':
				settings_fields( 'wab_integrations' );
				?>
				<h2><?php esc_html_e( 'Meta (Facebook/Instagram) Conversions API', 'woo-attribution-bridge' ); ?></h2>
				<p><?php esc_html_e( 'Send purchase events to Meta via the Conversions API (CAPI).', 'woo-attribution-bridge' ); ?></p>
				<table class="form-table">
					<?php
					WAB_Settings::render_checkbox_field(
						'wab_meta_enabled',
						__( 'Enable Meta Integration', 'woo-attribution-bridge' ),
						__( 'Send conversions to Meta Conversions API', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_text_field(
						'wab_meta_pixel_id',
						__( 'Pixel ID', 'woo-attribution-bridge' ),
						WAB_Settings::get_setting_description( 'wab_meta_pixel_id' )
					);
					WAB_Settings::render_text_field(
						'wab_meta_access_token',
						__( 'Access Token', 'woo-attribution-bridge' ),
						WAB_Settings::get_setting_description( 'wab_meta_access_token' ),
						'password'
					);
					WAB_Settings::render_text_field(
						'wab_meta_test_event_code',
						__( 'Test Event Code', 'woo-attribution-bridge' ),
						__( 'Optional: For testing in Meta Events Manager', 'woo-attribution-bridge' )
					);
					?>
				</table>
				<?php
				break;

			case 'google':
				settings_fields( 'wab_integrations' );
				?>
				<h2><?php esc_html_e( 'Google Ads Offline Conversions', 'woo-attribution-bridge' ); ?></h2>
				<p><?php esc_html_e( 'Send purchase events to Google Ads via the Offline Conversions API.', 'woo-attribution-bridge' ); ?></p>
				<table class="form-table">
					<?php
					WAB_Settings::render_checkbox_field(
						'wab_google_enabled',
						__( 'Enable Google Ads Integration', 'woo-attribution-bridge' ),
						__( 'Send conversions to Google Ads', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_text_field(
						'wab_google_customer_id',
						__( 'Customer ID', 'woo-attribution-bridge' ),
						WAB_Settings::get_setting_description( 'wab_google_customer_id' )
					);
					WAB_Settings::render_text_field(
						'wab_google_conversion_action_id',
						__( 'Conversion Action ID', 'woo-attribution-bridge' ),
						WAB_Settings::get_setting_description( 'wab_google_conversion_action_id' )
					);
					WAB_Settings::render_text_field(
						'wab_google_developer_token',
						__( 'Developer Token', 'woo-attribution-bridge' ),
						__( 'Google Ads API Developer Token', 'woo-attribution-bridge' ),
						'password'
					);
					WAB_Settings::render_text_field(
						'wab_google_access_token',
						__( 'Access Token', 'woo-attribution-bridge' ),
						__( 'OAuth Access Token', 'woo-attribution-bridge' ),
						'password'
					);
					WAB_Settings::render_text_field(
						'wab_google_refresh_token',
						__( 'Refresh Token', 'woo-attribution-bridge' ),
						__( 'OAuth Refresh Token for auto-renewal', 'woo-attribution-bridge' ),
						'password'
					);
					WAB_Settings::render_text_field(
						'wab_google_client_id',
						__( 'OAuth Client ID', 'woo-attribution-bridge' ),
						__( 'For token refresh', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_text_field(
						'wab_google_client_secret',
						__( 'OAuth Client Secret', 'woo-attribution-bridge' ),
						__( 'For token refresh', 'woo-attribution-bridge' ),
						'password'
					);
					?>
				</table>
				<?php
				break;

			case 'tiktok':
				settings_fields( 'wab_integrations' );
				?>
				<h2><?php esc_html_e( 'TikTok Events API', 'woo-attribution-bridge' ); ?></h2>
				<p><?php esc_html_e( 'Send purchase events to TikTok via the Events API.', 'woo-attribution-bridge' ); ?></p>
				<table class="form-table">
					<?php
					WAB_Settings::render_checkbox_field(
						'wab_tiktok_enabled',
						__( 'Enable TikTok Integration', 'woo-attribution-bridge' ),
						__( 'Send conversions to TikTok Events API', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_text_field(
						'wab_tiktok_pixel_code',
						__( 'Pixel Code', 'woo-attribution-bridge' ),
						WAB_Settings::get_setting_description( 'wab_tiktok_pixel_code' )
					);
					WAB_Settings::render_text_field(
						'wab_tiktok_access_token',
						__( 'Access Token', 'woo-attribution-bridge' ),
						WAB_Settings::get_setting_description( 'wab_tiktok_access_token' ),
						'password'
					);
					WAB_Settings::render_text_field(
						'wab_tiktok_test_event_code',
						__( 'Test Event Code', 'woo-attribution-bridge' ),
						__( 'Optional: For testing', 'woo-attribution-bridge' )
					);
					?>
				</table>
				<?php
				break;

			case 'swetrix':
				settings_fields( 'wab_integrations' );
				$swetrix_detected = WAB_Swetrix::is_plugin_active();
				?>
				<h2><?php esc_html_e( 'Swetrix Analytics', 'woo-attribution-bridge' ); ?></h2>
				<p><?php esc_html_e( 'Send purchase events to Swetrix Analytics.', 'woo-attribution-bridge' ); ?></p>
				<?php if ( $swetrix_detected ) : ?>
					<div class="notice notice-info inline">
						<p><?php esc_html_e( 'Swetrix plugin detected! Settings will be auto-detected if left empty.', 'woo-attribution-bridge' ); ?></p>
					</div>
				<?php endif; ?>
				<table class="form-table">
					<?php
					WAB_Settings::render_checkbox_field(
						'wab_swetrix_enabled',
						__( 'Enable Swetrix Integration', 'woo-attribution-bridge' ),
						__( 'Send conversions to Swetrix', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_text_field(
						'wab_swetrix_project_id',
						__( 'Project ID', 'woo-attribution-bridge' ),
						WAB_Settings::get_setting_description( 'wab_swetrix_project_id' ) .
						( $swetrix_detected ? ' ' . __( '(Auto-detected if empty)', 'woo-attribution-bridge' ) : '' )
					);
					WAB_Settings::render_text_field(
						'wab_swetrix_api_url',
						__( 'Custom API URL', 'woo-attribution-bridge' ),
						WAB_Settings::get_setting_description( 'wab_swetrix_api_url' )
					);
					?>
				</table>
				<?php
				break;

			default: // General tab.
				settings_fields( 'wab_general' );
				?>
				<h2><?php esc_html_e( 'General Settings', 'woo-attribution-bridge' ); ?></h2>
				<table class="form-table">
					<?php
					WAB_Settings::render_checkbox_field(
						'wab_debug_mode',
						__( 'Debug Mode', 'woo-attribution-bridge' ),
						__( 'Log debug information to error log', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_checkbox_field(
						'wab_dedup_enabled',
						__( 'Deduplication', 'woo-attribution-bridge' ),
						__( 'Prevent sending duplicate conversions', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_checkbox_field(
						'wab_queue_enabled',
						__( 'Retry Queue', 'woo-attribution-bridge' ),
						__( 'Queue failed sends for automatic retry', 'woo-attribution-bridge' )
					);
					WAB_Settings::render_text_field(
						'wab_cookie_expiry',
						__( 'Cookie Expiry (days)', 'woo-attribution-bridge' ),
						__( 'How long to store attribution data in cookies', 'woo-attribution-bridge' )
					);
					?>
				</table>

				<h2><?php esc_html_e( 'Browser Fingerprinting', 'woo-attribution-bridge' ); ?></h2>
				<p><?php esc_html_e( 'Browser fingerprinting enables attribution for visitors who decline cookies. Uses canvas, WebGL, and other browser characteristics to generate a privacy-preserving fingerprint.', 'woo-attribution-bridge' ); ?></p>
				<?php
				// Display fingerprint stats if available.
				if ( class_exists( 'WAB_Fingerprint' ) ) {
					$fingerprint = new WAB_Fingerprint();
					$fp_stats = $fingerprint->get_stats();
					if ( $fp_stats['total_fingerprints'] > 0 ) {
						?>
						<div class="notice notice-info inline" style="margin: 10px 0;">
							<p>
								<strong><?php esc_html_e( 'Fingerprint Stats:', 'woo-attribution-bridge' ); ?></strong>
								<?php
								printf(
									/* translators: 1: total fingerprints, 2: attribution rate, 3: avg confidence */
									esc_html__( '%1$d fingerprints stored, %2$s%% with attribution data, %3$s avg confidence', 'woo-attribution-bridge' ),
									$fp_stats['total_fingerprints'],
									$fp_stats['attribution_rate'],
									$fp_stats['avg_confidence']
								);
								?>
							</p>
						</div>
						<?php
					}
				}
				?>
				<table class="form-table">
					<?php
					WAB_Settings::render_checkbox_field(
						'wab_fingerprint_enabled',
						__( 'Enable Fingerprinting', 'woo-attribution-bridge' ),
						__( 'Use browser fingerprinting as fallback for cookieless attribution', 'woo-attribution-bridge' )
					);
					?>
					<tr>
						<th scope="row"><label for="wab_fingerprint_min_confidence"><?php esc_html_e( 'Minimum Confidence', 'woo-attribution-bridge' ); ?></label></th>
						<td>
							<input type="number" id="wab_fingerprint_min_confidence" name="wab_fingerprint_min_confidence"
								   value="<?php echo esc_attr( get_option( 'wab_fingerprint_min_confidence', 0.75 ) ); ?>"
								   min="0.5" max="0.99" step="0.01" class="small-text">
							<p class="description"><?php esc_html_e( 'Minimum confidence level (0.5-0.99) required to use a fingerprint match. Higher values mean more accuracy but fewer matches.', 'woo-attribution-bridge' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="wab_fingerprint_ttl"><?php esc_html_e( 'Fingerprint TTL (days)', 'woo-attribution-bridge' ); ?></label></th>
						<td>
							<input type="number" id="wab_fingerprint_ttl" name="wab_fingerprint_ttl"
								   value="<?php echo esc_attr( get_option( 'wab_fingerprint_ttl', 90 ) ); ?>"
								   min="7" max="365" class="small-text">
							<p class="description"><?php esc_html_e( 'How long to keep fingerprint records before deletion.', 'woo-attribution-bridge' ); ?></p>
						</td>
					</tr>
				</table>

				<h2><?php esc_html_e( 'Journey Tracking', 'woo-attribution-bridge' ); ?></h2>
				<p><?php esc_html_e( 'Track complete customer journeys including all page views, not just marketing touchpoints. This enables showing entry points and referrers for "direct" orders.', 'woo-attribution-bridge' ); ?></p>
				<?php
				// Display journey stats if available.
				global $wpdb;
				$sessions_table = $wpdb->prefix . 'wab_sessions';
				$page_views_table = $wpdb->prefix . 'wab_page_views';

				// Check if tables exist before querying.
				$sessions_exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $sessions_table ) );
				$page_views_exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $page_views_table ) );

				if ( $sessions_exists && $page_views_exists ) {
					$total_sessions = $wpdb->get_var( "SELECT COUNT(*) FROM {$sessions_table}" );
					$total_page_views = $wpdb->get_var( "SELECT COUNT(*) FROM {$page_views_table}" );
					$today_sessions = $wpdb->get_var(
						$wpdb->prepare(
							"SELECT COUNT(*) FROM {$sessions_table} WHERE started_at >= %s",
							gmdate( 'Y-m-d 00:00:00' )
						)
					);

					if ( $total_sessions > 0 ) {
						?>
						<div class="notice notice-info inline" style="margin: 10px 0;">
							<p>
								<strong><?php esc_html_e( 'Journey Stats:', 'woo-attribution-bridge' ); ?></strong>
								<?php
								printf(
									/* translators: 1: total sessions, 2: today sessions, 3: total page views */
									esc_html__( '%1$s total sessions (%2$s today), %3$s page views tracked', 'woo-attribution-bridge' ),
									number_format( $total_sessions ),
									number_format( $today_sessions ),
									number_format( $total_page_views )
								);
								?>
							</p>
						</div>
						<?php
					}
				}
				?>
				<table class="form-table">
					<?php
					WAB_Settings::render_checkbox_field(
						'wab_journey_tracking_enabled',
						__( 'Enable Journey Tracking', 'woo-attribution-bridge' ),
						__( 'Track page views and build complete customer journeys', 'woo-attribution-bridge' )
					);
					?>
					<tr>
						<th scope="row"><label for="wab_journey_session_timeout"><?php esc_html_e( 'Session Timeout (minutes)', 'woo-attribution-bridge' ); ?></label></th>
						<td>
							<input type="number" id="wab_journey_session_timeout" name="wab_journey_session_timeout"
								   value="<?php echo esc_attr( get_option( 'wab_journey_session_timeout', 30 ) ); ?>"
								   min="5" max="120" class="small-text">
							<p class="description"><?php esc_html_e( 'Inactivity timeout before starting a new session (5-120 minutes).', 'woo-attribution-bridge' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="wab_journey_max_pages_per_session"><?php esc_html_e( 'Max Pages per Session', 'woo-attribution-bridge' ); ?></label></th>
						<td>
							<input type="number" id="wab_journey_max_pages_per_session" name="wab_journey_max_pages_per_session"
								   value="<?php echo esc_attr( get_option( 'wab_journey_max_pages_per_session', 50 ) ); ?>"
								   min="10" max="200" class="small-text">
							<p class="description"><?php esc_html_e( 'Maximum page views to record per session (10-200).', 'woo-attribution-bridge' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="wab_journey_retention_days"><?php esc_html_e( 'Data Retention (days)', 'woo-attribution-bridge' ); ?></label></th>
						<td>
							<input type="number" id="wab_journey_retention_days" name="wab_journey_retention_days"
								   value="<?php echo esc_attr( get_option( 'wab_journey_retention_days', 90 ) ); ?>"
								   min="7" max="365" class="small-text">
							<p class="description"><?php esc_html_e( 'How long to keep journey data before automatic cleanup (7-365 days).', 'woo-attribution-bridge' ); ?></p>
						</td>
					</tr>
				</table>
				<?php
				break;
		}

		submit_button();
		?>
	</form>
</div>
