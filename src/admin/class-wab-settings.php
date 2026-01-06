<?php
/**
 * Settings helper class.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Settings
 *
 * Helper class for handling settings.
 */
class WAB_Settings {

	/**
	 * Get all integrations status.
	 *
	 * @return array
	 */
	public static function get_integrations_status(): array {
		$integrations = [
			'meta' => [
				'name'    => 'Meta (Facebook/Instagram)',
				'enabled' => (bool) get_option( 'wab_meta_enabled' ),
				'configured' => ! empty( get_option( 'wab_meta_pixel_id' ) )
					&& ! empty( get_option( 'wab_meta_access_token' ) ),
			],
			'google' => [
				'name'    => 'Google Ads',
				'enabled' => (bool) get_option( 'wab_google_enabled' ),
				'configured' => ! empty( get_option( 'wab_google_customer_id' ) )
					&& ! empty( get_option( 'wab_google_conversion_action_id' ) ),
			],
			'tiktok' => [
				'name'    => 'TikTok',
				'enabled' => (bool) get_option( 'wab_tiktok_enabled' ),
				'configured' => ! empty( get_option( 'wab_tiktok_pixel_code' ) )
					&& ! empty( get_option( 'wab_tiktok_access_token' ) ),
			],
			'swetrix' => [
				'name'    => 'Swetrix',
				'enabled' => (bool) get_option( 'wab_swetrix_enabled' ),
				'configured' => ! empty( get_option( 'wab_swetrix_project_id' ) )
					|| WAB_Swetrix::is_plugin_active(),
			],
		];

		return $integrations;
	}

	/**
	 * Check if integration has required settings.
	 *
	 * @param string $integration Integration ID.
	 * @return array{valid: bool, missing: array}
	 */
	public static function validate_integration( string $integration ): array {
		$required = match ( $integration ) {
			'meta' => [ 'wab_meta_pixel_id', 'wab_meta_access_token' ],
			'google' => [ 'wab_google_customer_id', 'wab_google_conversion_action_id', 'wab_google_access_token' ],
			'tiktok' => [ 'wab_tiktok_pixel_code', 'wab_tiktok_access_token' ],
			'swetrix' => [ 'wab_swetrix_project_id' ],
			default => [],
		};

		$missing = [];
		foreach ( $required as $setting ) {
			if ( empty( get_option( $setting ) ) ) {
				$missing[] = $setting;
			}
		}

		return [
			'valid'   => empty( $missing ),
			'missing' => $missing,
		];
	}

	/**
	 * Get setting description.
	 *
	 * @param string $key Setting key.
	 * @return string Description.
	 */
	public static function get_setting_description( string $key ): string {
		$descriptions = [
			'wab_meta_pixel_id'     => __( 'Your Meta Pixel ID (found in Events Manager)', 'woo-attribution-bridge' ),
			'wab_meta_access_token' => __( 'Conversions API access token (generate in Events Manager → Settings)', 'woo-attribution-bridge' ),
			'wab_google_customer_id' => __( 'Google Ads Customer ID (format: 123-456-7890)', 'woo-attribution-bridge' ),
			'wab_google_conversion_action_id' => __( 'Conversion Action ID from Google Ads', 'woo-attribution-bridge' ),
			'wab_tiktok_pixel_code' => __( 'TikTok Pixel Code', 'woo-attribution-bridge' ),
			'wab_tiktok_access_token' => __( 'TikTok Events API access token', 'woo-attribution-bridge' ),
			'wab_swetrix_project_id' => __( 'Swetrix Project ID', 'woo-attribution-bridge' ),
			'wab_swetrix_api_url' => __( 'Custom Swetrix API URL (leave empty for hosted)', 'woo-attribution-bridge' ),
		];

		return $descriptions[ $key ] ?? '';
	}

	/**
	 * Render a text input field.
	 *
	 * @param string $name        Option name.
	 * @param string $label       Field label.
	 * @param string $description Field description.
	 * @param string $type        Input type (text, password).
	 */
	public static function render_text_field( string $name, string $label, string $description = '', string $type = 'text' ): void {
		$value = get_option( $name, '' );

		printf(
			'<tr>
				<th scope="row"><label for="%1$s">%2$s</label></th>
				<td>
					<input type="%5$s" id="%1$s" name="%1$s" value="%3$s" class="regular-text">
					%4$s
				</td>
			</tr>',
			esc_attr( $name ),
			esc_html( $label ),
			esc_attr( $value ),
			$description ? '<p class="description">' . esc_html( $description ) . '</p>' : '',
			esc_attr( $type )
		);
	}

	/**
	 * Render a checkbox field.
	 *
	 * @param string $name        Option name.
	 * @param string $label       Field label.
	 * @param string $description Field description.
	 */
	public static function render_checkbox_field( string $name, string $label, string $description = '' ): void {
		$value = get_option( $name, false );

		printf(
			'<tr>
				<th scope="row">%2$s</th>
				<td>
					<label>
						<input type="checkbox" id="%1$s" name="%1$s" value="1" %3$s>
						%4$s
					</label>
				</td>
			</tr>',
			esc_attr( $name ),
			esc_html( $label ),
			checked( $value, true, false ),
			$description ? '<span class="description">' . esc_html( $description ) . '</span>' : ''
		);
	}
}
