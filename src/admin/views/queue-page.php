<?php
/**
 * Queue page view.
 *
 * @package WooAttributionBridge
 * @var array $stats Queue statistics.
 * @var array $items Pending queue items.
 */

defined( 'ABSPATH' ) || exit;
?>

<div class="wrap">
	<h1><?php esc_html_e( 'Attribution Bridge Queue', 'woo-attribution-bridge' ); ?></h1>

	<div class="wab-queue-stats">
		<div class="wab-stat-box">
			<span class="wab-stat-value"><?php echo esc_html( $stats['pending'] ?? 0 ); ?></span>
			<span class="wab-stat-label"><?php esc_html_e( 'Pending', 'woo-attribution-bridge' ); ?></span>
		</div>
		<div class="wab-stat-box">
			<span class="wab-stat-value"><?php echo esc_html( $stats['completed'] ?? 0 ); ?></span>
			<span class="wab-stat-label"><?php esc_html_e( 'Completed', 'woo-attribution-bridge' ); ?></span>
		</div>
		<div class="wab-stat-box">
			<span class="wab-stat-value"><?php echo esc_html( $stats['failed'] ?? 0 ); ?></span>
			<span class="wab-stat-label"><?php esc_html_e( 'Failed', 'woo-attribution-bridge' ); ?></span>
		</div>
	</div>

	<h2><?php esc_html_e( 'Pending Items', 'woo-attribution-bridge' ); ?></h2>

	<?php if ( empty( $items ) ) : ?>
		<p><?php esc_html_e( 'No pending items in the queue.', 'woo-attribution-bridge' ); ?></p>
	<?php else : ?>
		<table class="widefat striped">
			<thead>
				<tr>
					<th><?php esc_html_e( 'ID', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Order', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Integration', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Attempts', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Next Retry', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Last Error', 'woo-attribution-bridge' ); ?></th>
					<th><?php esc_html_e( 'Actions', 'woo-attribution-bridge' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php foreach ( $items as $item ) : ?>
					<tr>
						<td><?php echo esc_html( $item['id'] ); ?></td>
						<td>
							<a href="<?php echo esc_url( admin_url( 'post.php?post=' . $item['order_id'] . '&action=edit' ) ); ?>">
								#<?php echo esc_html( $item['order_id'] ); ?>
							</a>
						</td>
						<td><?php echo esc_html( ucfirst( $item['integration'] ) ); ?></td>
						<td><?php echo esc_html( $item['attempts'] . '/' . $item['max_attempts'] ); ?></td>
						<td>
							<?php
							$next_retry = strtotime( $item['next_retry'] );
							if ( $next_retry <= time() ) {
								esc_html_e( 'Now', 'woo-attribution-bridge' );
							} else {
								echo esc_html( human_time_diff( time(), $next_retry ) );
							}
							?>
						</td>
						<td>
							<?php
							if ( ! empty( $item['last_error'] ) ) {
								echo '<code>' . esc_html( mb_substr( $item['last_error'], 0, 50 ) ) . '</code>';
							} else {
								esc_html_e( '-', 'woo-attribution-bridge' );
							}
							?>
						</td>
						<td>
							<button type="button" class="button button-small wab-retry-now" data-id="<?php echo esc_attr( $item['id'] ); ?>">
								<?php esc_html_e( 'Retry Now', 'woo-attribution-bridge' ); ?>
							</button>
							<button type="button" class="button button-small wab-cancel" data-id="<?php echo esc_attr( $item['id'] ); ?>">
								<?php esc_html_e( 'Cancel', 'woo-attribution-bridge' ); ?>
							</button>
						</td>
					</tr>
				<?php endforeach; ?>
			</tbody>
		</table>
	<?php endif; ?>
</div>
