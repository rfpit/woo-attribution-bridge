<?php
/**
 * Logs page view.
 *
 * @package WooAttributionBridge
 * @var array  $logs        Log entries.
 * @var int    $total       Total log count.
 * @var int    $page        Current page.
 * @var int    $total_pages Total pages.
 * @var string $integration Filter by integration.
 * @var string $status      Filter by status.
 */

defined( 'ABSPATH' ) || exit;
?>

<div class="wrap">
	<h1><?php esc_html_e( 'Attribution Bridge Logs', 'woo-attribution-bridge' ); ?></h1>

	<!-- Filters -->
	<form method="get" class="wab-filters">
		<input type="hidden" name="page" value="wab-logs">
		<select name="integration">
			<option value=""><?php esc_html_e( 'All Integrations', 'woo-attribution-bridge' ); ?></option>
			<option value="meta" <?php selected( $integration, 'meta' ); ?>><?php esc_html_e( 'Meta', 'woo-attribution-bridge' ); ?></option>
			<option value="google" <?php selected( $integration, 'google' ); ?>><?php esc_html_e( 'Google Ads', 'woo-attribution-bridge' ); ?></option>
			<option value="tiktok" <?php selected( $integration, 'tiktok' ); ?>><?php esc_html_e( 'TikTok', 'woo-attribution-bridge' ); ?></option>
			<option value="swetrix" <?php selected( $integration, 'swetrix' ); ?>><?php esc_html_e( 'Swetrix', 'woo-attribution-bridge' ); ?></option>
		</select>
		<select name="status">
			<option value=""><?php esc_html_e( 'All Status', 'woo-attribution-bridge' ); ?></option>
			<option value="success" <?php selected( $status, 'success' ); ?>><?php esc_html_e( 'Success', 'woo-attribution-bridge' ); ?></option>
			<option value="failed" <?php selected( $status, 'failed' ); ?>><?php esc_html_e( 'Failed', 'woo-attribution-bridge' ); ?></option>
		</select>
		<button type="submit" class="button"><?php esc_html_e( 'Filter', 'woo-attribution-bridge' ); ?></button>
	</form>

	<?php if ( empty( $logs ) ) : ?>
		<p><?php esc_html_e( 'No log entries found.', 'woo-attribution-bridge' ); ?></p>
	<?php else : ?>
		<table class="widefat striped">
			<thead>
				<tr>
					<th><?php esc_html_e( 'Time', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Order', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Integration', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Event', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Status', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'HTTP Code', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Click IDs', 'woo-attribution-bridge' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( $logs as $log ) : ?>
					<tr>
						<td>
							<?php echo esc_html( wp_date( 'Y-m-d H:i:s', strtotime( $log['created_at'] ) ) ); ?>
						</td>
						<td>
							<a href="<?php echo esc_url( admin_url( 'post.php?post=' . $log['order_id'] . '&action=edit' ) ); ?>">
								#<?php echo esc_html( $log['order_id'] ); ?>
							</a>
						</td>
						<td><?php echo esc_html( ucfirst( $log['integration'] ) ); ?></td>
						<td><?php echo esc_html( $log['event_type'] ); ?></td>
						<td>
							<span class="wab-status wab-status-<?php echo esc_attr( $log['status'] ); ?>">
								<?php echo esc_html( ucfirst( $log['status'] ) ); ?>
							</span>
						</td>
						<td><?php echo esc_html( $log['response_code'] ?: '-' ); ?></td>
						<td>
							<?php
							$click_ids = json_decode( $log['click_ids'] ?? '{}', true );
							if ( ! empty( $click_ids ) ) {
								echo esc_html( implode( ', ', array_keys( $click_ids ) ) );
							} else {
								esc_html_e( '-', 'woo-attribution-bridge' );
							}
							?>
						</td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>

		<!-- Pagination -->
		<?php if ( $total_pages > 1 ) : ?>
			<div class="tablenav">
				<div class="tablenav-pages">
					<?php
					$pagination_args = [
						'base'      => add_query_arg( 'paged', '%#%' ),
						'format'    => '',
						'total'     => $total_pages,
						'current'   => $page,
						'prev_text' => '&laquo;',
						'next_text' => '&raquo;',
					];
					echo paginate_links( $pagination_args );
					?>
				</div>
			</div>
		<?php endif; ?>
	<?php endif; ?>
</div>
