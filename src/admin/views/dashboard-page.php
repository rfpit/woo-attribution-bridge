<?php
/**
 * Dashboard page view.
 *
 * @package WooAttributionBridge
 * @var array $stats Integration send statistics.
 * @var array $queue_stats Queue statistics.
 */

defined( 'ABSPATH' ) || exit;

$integrations = WAB_Settings::get_integrations_status();
?>

<div class="wrap wab-dashboard">
	<h1><?php esc_html_e( 'Attribution Bridge Dashboard', 'woo-attribution-bridge' ); ?></h1>

	<div class="wab-stats-grid">
		<!-- Integration Status -->
		<div class="wab-card">
			<h2><?php esc_html_e( 'Integrations', 'woo-attribution-bridge' ); ?></h2>
			<table class="widefat">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Platform', 'woo-attribution-bridge' ); ?></th>
						<th><?php esc_html_e( 'Status', 'woo-attribution-bridge' ); ?></th>
						<th><?php esc_html_e( 'Today', 'woo-attribution-bridge' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php foreach ( $integrations as $id => $integration ) : ?>
						<tr>
							<td><?php echo esc_html( $integration['name'] ); ?></td>
							<td>
								<?php if ( $integration['enabled'] && $integration['configured'] ) : ?>
									<span class="wab-status wab-status-active"><?php esc_html_e( 'Active', 'woo-attribution-bridge' ); ?></span>
								<?php elseif ( $integration['enabled'] ) : ?>
									<span class="wab-status wab-status-warning"><?php esc_html_e( 'Not Configured', 'woo-attribution-bridge' ); ?></span>
								<?php else : ?>
									<span class="wab-status wab-status-inactive"><?php esc_html_e( 'Disabled', 'woo-attribution-bridge' ); ?></span>
								<?php endif; ?>
							</td>
							<td>
								<?php
								$sent   = $stats[ $id ]['success'] ?? 0;
								$failed = $stats[ $id ]['failed'] ?? 0;
								printf(
									'<span class="wab-sent">%d</span> / <span class="wab-failed">%d</span>',
									$sent,
									$failed
								);
								?>
							</td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		</div>

		<!-- Queue Status -->
		<div class="wab-card">
			<h2><?php esc_html_e( 'Queue Status', 'woo-attribution-bridge' ); ?></h2>
			<div class="wab-queue-stats">
				<div class="wab-stat">
					<span class="wab-stat-value"><?php echo esc_html( $queue_stats['pending'] ?? 0 ); ?></span>
					<span class="wab-stat-label"><?php esc_html_e( 'Pending', 'woo-attribution-bridge' ); ?></span>
				</div>
				<div class="wab-stat">
					<span class="wab-stat-value"><?php echo esc_html( $queue_stats['completed'] ?? 0 ); ?></span>
					<span class="wab-stat-label"><?php esc_html_e( 'Completed', 'woo-attribution-bridge' ); ?></span>
				</div>
				<div class="wab-stat">
					<span class="wab-stat-value"><?php echo esc_html( $queue_stats['failed'] ?? 0 ); ?></span>
					<span class="wab-stat-label"><?php esc_html_e( 'Failed', 'woo-attribution-bridge' ); ?></span>
				</div>
			</div>
			<p>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=wab-queue' ) ); ?>" class="button">
					<?php esc_html_e( 'View Queue', 'woo-attribution-bridge' ); ?>
				</a>
			</p>
		</div>

		<!-- Quick Actions -->
		<div class="wab-card">
			<h2><?php esc_html_e( 'Quick Actions', 'woo-attribution-bridge' ); ?></h2>
			<p>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=wab-settings' ) ); ?>" class="button button-primary">
					<?php esc_html_e( 'Configure Integrations', 'woo-attribution-bridge' ); ?>
				</a>
			</p>
			<p>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=wab-logs' ) ); ?>" class="button">
					<?php esc_html_e( 'View Logs', 'woo-attribution-bridge' ); ?>
				</a>
			</p>
		</div>
	</div>

	<!-- Recent Activity -->
	<div class="wab-card wab-card-full">
		<h2><?php esc_html_e( 'Recent Conversions', 'woo-attribution-bridge' ); ?></h2>
		<?php
		global $wpdb;
		$log_table = $wpdb->prefix . 'wab_log';
		$recent    = $wpdb->get_results(
			"SELECT * FROM {$log_table} ORDER BY created_at DESC LIMIT 10",
			ARRAY_A
		);

		if ( empty( $recent ) ) :
			?>
			<p><?php esc_html_e( 'No conversions sent yet.', 'woo-attribution-bridge' ); ?></p>
		<?php else : ?>
			<table class="widefat">
				<thead>
					<tr>
						<th><?php esc_html_e( 'Order', 'woo-attribution-bridge' ); ?></th>
						<th><?php esc_html_e( 'Integration', 'woo-attribution-bridge' ); ?></th>
						<th><?php esc_html_e( 'Status', 'woo-attribution-bridge' ); ?></th>
						<th><?php esc_html_e( 'Time', 'woo-attribution-bridge' ); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php foreach ( $recent as $log ) : ?>
						<tr>
							<td>
								<a href="<?php echo esc_url( admin_url( 'post.php?post=' . $log['order_id'] . '&action=edit' ) ); ?>">
									#<?php echo esc_html( $log['order_id'] ); ?>
								</a>
							</td>
							<td><?php echo esc_html( ucfirst( $log['integration'] ) ); ?></td>
							<td>
								<span class="wab-status wab-status-<?php echo esc_attr( $log['status'] ); ?>">
									<?php echo esc_html( ucfirst( $log['status'] ) ); ?>
								</span>
							</td>
							<td><?php echo esc_html( human_time_diff( strtotime( $log['created_at'] ) ) . ' ago' ); ?></td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
		<?php endif; ?>
	</div>
</div>
