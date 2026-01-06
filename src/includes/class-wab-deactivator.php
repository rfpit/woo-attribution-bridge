<?php
/**
 * Plugin deactivation handler.
 *
 * @package WooAttributionBridge
 */

defined( 'ABSPATH' ) || exit;

/**
 * Class WAB_Deactivator
 *
 * Handles plugin deactivation tasks.
 */
class WAB_Deactivator {

	/**
	 * Deactivate the plugin.
	 *
	 * Clears scheduled events but preserves data.
	 */
	public static function deactivate(): void {
		self::clear_cron_events();

		// Note: We intentionally do NOT delete database tables or options
		// on deactivation. Data should only be removed on uninstall.
	}

	/**
	 * Clear all scheduled cron events.
	 */
	private static function clear_cron_events(): void {
		$events = [
			'wab_process_queue',
			'wab_cleanup_old_logs',
		];

		foreach ( $events as $event ) {
			$timestamp = wp_next_scheduled( $event );
			if ( $timestamp ) {
				wp_unschedule_event( $timestamp, $event );
			}
		}
	}
}
