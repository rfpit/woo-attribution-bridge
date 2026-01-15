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
				<?php
				break;
		}

		submit_button();
		?>
	</form>
</div>
