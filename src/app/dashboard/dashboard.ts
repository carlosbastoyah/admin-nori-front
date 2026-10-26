import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@nori/core';
import { BillingOverviewService } from '../billing-overview/billing-overview.service';
import {
  Period,
  availableYears,
  averageDaysToCollect,
  billedIn,
  change,
  clientGrowth,
  collectedByMonth,
  formatMXNShort,
  formatPercent,
  isOpen,
  keyOf,
  monthKey,
  onTimeRate,
  paidIn,
  periodLabel,
  periodMonths,
  previousPeriodMonths,
  revenueByMonth,
  subtotalOf,
  sum,
  topClients,
} from '../billing-overview/billing-metrics';
import { TrendChart } from '../shared/components/trend-chart/trend-chart';
import { formatMXN, formatNumber } from '../shared/utils/format.util';
import { planLabel } from '../shared/utils/labels.util';
import { PartnerReportDialog } from './partner-report/partner-report-dialog';

/** How the business is doing: money collected, what is owed, and how the client base grows. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, TrendChart, PartnerReportDialog],
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly authService = inject(AuthService);
  private readonly billingOverview = inject(BillingOverviewService);

  readonly currentUser = this.authService.getCurrentUser();
  readonly overview = this.billingOverview.overview;
  readonly isLoading = this.billingOverview.isLoading;
  readonly error = this.billingOverview.error;

  readonly formatMXN = formatMXN;
  readonly formatMXNShort = formatMXNShort;
  readonly formatNumber = formatNumber;
  readonly formatPercent = formatPercent;
  readonly formatCount = (value: number) => formatNumber(Math.round(value));

  readonly period = signal<Period>('last12');
  readonly isReportOpen = signal(false);

  private readonly prefacturas = computed(() => this.overview()?.prefacturas ?? []);
  private readonly clients = computed(() => this.overview()?.clients ?? []);

  readonly years = computed(() => availableYears(this.clients(), this.prefacturas()));
  readonly periodLabel = computed(() => periodLabel(this.period()));
  private readonly months = computed(() => periodMonths(this.period()));
  private readonly previous = computed(() => previousPeriodMonths(this.period()));
  private readonly paid = computed(() => paidIn(this.prefacturas(), this.months()));

  // ---- Money in the period ----
  readonly collected = computed(() => collectedByMonth(this.prefacturas(), this.months()));
  readonly revenue = computed(() => revenueByMonth(this.prefacturas(), this.months()));
  readonly collectedTotal = computed(() => sum(this.paid()));
  readonly collectedChange = computed(() => change(this.collectedTotal(), sum(paidIn(this.prefacturas(), this.previous()))));
  readonly revenueTotal = computed(() => subtotalOf(billedIn(this.prefacturas(), this.months())));
  readonly revenueChange = computed(() => change(this.revenueTotal(), subtotalOf(billedIn(this.prefacturas(), this.previous()))));
  /** Revenue of the last month that already has billing: the month in course is still being charged. */
  readonly mrr = computed(() => [...this.revenue()].reverse().find((p) => p.value > 0) ?? null);

  // ---- As of today ----
  readonly open = computed(() => this.prefacturas().filter(isOpen));
  readonly outstanding = computed(() => sum(this.open()));
  readonly overdueRows = computed(() => this.prefacturas().filter((p) => p.isOverdue));
  readonly overdue = computed(() => sum(this.overdueRows()));
  readonly drafts = computed(() => this.prefacturas().filter((p) => p.status === 'Draft'));
  readonly pendingPeriods = computed(() => (this.overview()?.pending ?? []).reduce((n, c) => n + c.periods.length, 0));

  readonly onTime = computed(() => onTimeRate(this.paid()));
  readonly daysToCollect = computed(() => averageDaysToCollect(this.paid()));
  /** MRR over the clients billed that month (ARPA). */
  readonly revenuePerClient = computed(() => {
    const month = this.mrr();
    if (!month) return null;
    const payers = new Set(billedIn(this.prefacturas(), [month.key]).map((p) => p.clientId)).size;
    return payers ? month.value / payers : null;
  });
  readonly top = computed(() => topClients(this.prefacturas(), this.months(), 5));
  readonly topMax = computed(() => Math.max(1, ...this.top().map((c) => c.total)));

  // ---- Clients ----
  readonly growth = computed(() => clientGrowth(this.clients(), this.months()));
  readonly newInPeriod = computed(() => this.clients().filter((c) => this.months().includes(keyOf(c.createdAt) ?? '')).length);
  readonly newInPrevious = computed(() => this.clients().filter((c) => this.previous().includes(keyOf(c.createdAt) ?? '')).length);
  readonly newThisMonth = computed(() => this.clients().filter((c) => keyOf(c.createdAt) === monthKey(new Date())).length);
  readonly byStatus = computed(() => {
    const count = (status: string) => this.clients().filter((c) => c.subscription?.status === status).length;
    return {
      active: count('Active'),
      trial: count('Trial'),
      suspended: count('Suspended'),
      cancelled: count('Cancelled'),
      none: this.clients().filter((c) => !c.subscription).length,
    };
  });
  /** Clients paying or trying each plan, most first. */
  readonly byPlan = computed(() => {
    const live = this.clients().filter((c) => c.subscription && (c.subscription.status === 'Active' || c.subscription.status === 'Trial'));
    const counts = new Map<string, number>();
    for (const c of live) counts.set(c.subscription!.planCode, (counts.get(c.subscription!.planCode) ?? 0) + 1);
    const total = live.length || 1;
    return [...counts.entries()]
      .map(([code, count]) => ({ label: planLabel(code), count, share: (count / total) * 100 }))
      .sort((a, b) => b.count - a.count);
  });
  /** Clients that ended a trial: how many became paying ones. */
  readonly conversion = computed(() => {
    const s = this.byStatus();
    const decided = s.active + s.cancelled;
    return decided ? (s.active / decided) * 100 : null;
  });

  constructor() {
    this.billingOverview.load();
  }

  reload(): void {
    this.billingOverview.load(true);
  }

  selectPeriod(value: string): void {
    this.period.set(value === 'last12' ? 'last12' : Number(value));
  }

  changeLabel(value: number | null): string {
    if (value == null) return 'sin periodo previo para comparar';
    return `${value >= 0 ? '▲' : '▼'} ${Math.abs(value).toFixed(0)}% vs periodo anterior`;
  }
}
