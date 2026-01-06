/**
 * Cohort Analysis
 *
 * Analyze customer behavior by acquisition month/source
 * Track retention, repeat purchase rates, and revenue over time.
 */

export interface CohortData {
  cohortId: string;
  cohortDate: Date;
  cohortMonth: string; // YYYY-MM format
  source: string;
  customersCount: number;
  initialRevenue: number;
  periods: CohortPeriod[];
}

export interface CohortPeriod {
  period: number; // 0 = acquisition month, 1 = month after, etc.
  activeCustomers: number;
  revenue: number;
  orders: number;
  retentionRate: number; // % of original customers still active
  cumulativeRevenue: number;
  avgRevenuePerCustomer: number;
}

export interface CohortInput {
  customerId: string;
  firstOrderDate: Date;
  orderDate: Date;
  revenue: number;
  source?: string;
}

export interface CohortOptions {
  groupBy: "month" | "week" | "quarter";
  source?: string; // Filter by attribution source
  maxPeriods?: number;
}

/**
 * Build cohort analysis from order data
 */
export function buildCohortAnalysis(
  orders: CohortInput[],
  options: CohortOptions = { groupBy: "month", maxPeriods: 12 },
): CohortData[] {
  const { groupBy, source, maxPeriods = 12 } = options;

  // Group customers by cohort (first order date)
  const customerCohorts = new Map<
    string,
    {
      cohortKey: string;
      cohortDate: Date;
      customerId: string;
      source: string;
      orders: { date: Date; revenue: number }[];
    }
  >();

  for (const order of orders) {
    // Filter by source if specified
    if (source && order.source !== source) continue;

    const cohortKey = getCohortKey(order.firstOrderDate, groupBy);

    if (!customerCohorts.has(order.customerId)) {
      customerCohorts.set(order.customerId, {
        cohortKey,
        cohortDate: startOfPeriod(order.firstOrderDate, groupBy),
        customerId: order.customerId,
        source: order.source || "direct",
        orders: [],
      });
    }

    const customer = customerCohorts.get(order.customerId)!;
    customer.orders.push({
      date: order.orderDate,
      revenue: order.revenue,
    });
  }

  // Group by cohort key
  const cohortGroups = new Map<
    string,
    typeof customerCohorts extends Map<any, infer V> ? V[] : never
  >();

  for (const customer of customerCohorts.values()) {
    if (!cohortGroups.has(customer.cohortKey)) {
      cohortGroups.set(customer.cohortKey, []);
    }
    cohortGroups.get(customer.cohortKey)!.push(customer);
  }

  // Build cohort data
  const cohorts: CohortData[] = [];

  for (const [cohortKey, customers] of cohortGroups.entries()) {
    const cohortDate = customers[0].cohortDate;
    const customersCount = customers.length;

    // Calculate initial revenue (period 0)
    let initialRevenue = 0;
    for (const customer of customers) {
      for (const order of customer.orders) {
        if (getPeriodNumber(cohortDate, order.date, groupBy) === 0) {
          initialRevenue += order.revenue;
        }
      }
    }

    // Build periods
    const periods: CohortPeriod[] = [];
    let cumulativeRevenue = 0;

    for (let period = 0; period <= maxPeriods; period++) {
      const periodStats = calculatePeriodStats(
        customers,
        cohortDate,
        period,
        groupBy,
      );

      cumulativeRevenue += periodStats.revenue;

      periods.push({
        period,
        activeCustomers: periodStats.activeCustomers,
        revenue: periodStats.revenue,
        orders: periodStats.orders,
        retentionRate:
          customersCount > 0
            ? (periodStats.activeCustomers / customersCount) * 100
            : 0,
        cumulativeRevenue,
        avgRevenuePerCustomer:
          customersCount > 0 ? cumulativeRevenue / customersCount : 0,
      });
    }

    cohorts.push({
      cohortId: cohortKey,
      cohortDate,
      cohortMonth: cohortKey,
      source: source || "all",
      customersCount,
      initialRevenue,
      periods,
    });
  }

  // Sort by cohort date
  return cohorts.sort(
    (a, b) => a.cohortDate.getTime() - b.cohortDate.getTime(),
  );
}

/**
 * Get cohort key from date
 */
function getCohortKey(
  date: Date,
  groupBy: "month" | "week" | "quarter",
): string {
  const year = date.getFullYear();
  const month = date.getMonth();

  switch (groupBy) {
    case "week": {
      const weekNum = getWeekNumber(date);
      return `${year}-W${weekNum.toString().padStart(2, "0")}`;
    }
    case "quarter": {
      const quarter = Math.floor(month / 3) + 1;
      return `${year}-Q${quarter}`;
    }
    case "month":
    default:
      return `${year}-${(month + 1).toString().padStart(2, "0")}`;
  }
}

/**
 * Get start of period
 */
function startOfPeriod(
  date: Date,
  groupBy: "month" | "week" | "quarter",
): Date {
  const year = date.getFullYear();
  const month = date.getMonth();

  switch (groupBy) {
    case "week": {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    }
    case "quarter": {
      const quarterStart = Math.floor(month / 3) * 3;
      return new Date(year, quarterStart, 1);
    }
    case "month":
    default:
      return new Date(year, month, 1);
  }
}

/**
 * Get period number (months/weeks/quarters since cohort)
 */
function getPeriodNumber(
  cohortDate: Date,
  orderDate: Date,
  groupBy: "month" | "week" | "quarter",
): number {
  const cohortStart = startOfPeriod(cohortDate, groupBy);
  const orderStart = startOfPeriod(orderDate, groupBy);

  switch (groupBy) {
    case "week":
      return Math.floor(
        (orderStart.getTime() - cohortStart.getTime()) /
          (7 * 24 * 60 * 60 * 1000),
      );
    case "quarter":
      return (
        (orderStart.getFullYear() - cohortStart.getFullYear()) * 4 +
        Math.floor(orderStart.getMonth() / 3) -
        Math.floor(cohortStart.getMonth() / 3)
      );
    case "month":
    default:
      return (
        (orderStart.getFullYear() - cohortStart.getFullYear()) * 12 +
        orderStart.getMonth() -
        cohortStart.getMonth()
      );
  }
}

/**
 * Calculate stats for a period
 */
function calculatePeriodStats(
  customers: Array<{
    customerId: string;
    orders: { date: Date; revenue: number }[];
  }>,
  cohortDate: Date,
  period: number,
  groupBy: "month" | "week" | "quarter",
): { activeCustomers: number; revenue: number; orders: number } {
  let activeCustomers = 0;
  let revenue = 0;
  let orders = 0;

  const activeSet = new Set<string>();

  for (const customer of customers) {
    for (const order of customer.orders) {
      const orderPeriod = getPeriodNumber(cohortDate, order.date, groupBy);
      if (orderPeriod === period) {
        activeSet.add(customer.customerId);
        revenue += order.revenue;
        orders++;
      }
    }
  }

  return {
    activeCustomers: activeSet.size,
    revenue,
    orders,
  };
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Get cohort retention matrix for visualization
 */
export function getCohortRetentionMatrix(
  cohorts: CohortData[],
): { cohort: string; periods: number[] }[] {
  return cohorts.map((cohort) => ({
    cohort: cohort.cohortMonth,
    periods: cohort.periods.map((p) => p.retentionRate),
  }));
}

/**
 * Calculate average retention curve across all cohorts
 */
export function getAverageRetentionCurve(
  cohorts: CohortData[],
): { period: number; avgRetention: number }[] {
  if (cohorts.length === 0) return [];

  const maxPeriods = Math.max(...cohorts.map((c) => c.periods.length));
  const result: { period: number; avgRetention: number }[] = [];

  for (let period = 0; period < maxPeriods; period++) {
    const retentionRates = cohorts
      .filter((c) => c.periods[period] !== undefined)
      .map((c) => c.periods[period].retentionRate);

    if (retentionRates.length > 0) {
      const avg =
        retentionRates.reduce((sum, r) => sum + r, 0) / retentionRates.length;
      result.push({ period, avgRetention: avg });
    }
  }

  return result;
}

/**
 * Calculate cohort LTV (total revenue per customer over time)
 */
export function getCohortLTV(cohorts: CohortData[]): {
  cohort: string;
  ltv: number[];
}[] {
  return cohorts.map((cohort) => ({
    cohort: cohort.cohortMonth,
    ltv: cohort.periods.map((p) => p.avgRevenuePerCustomer),
  }));
}
