import { BillingLineType } from '../../clients/models/billing.models';
import { BillingOverview, PrefacturaRow } from '../../billing-overview/billing-overview.service';
import {
  Period,
  averageDaysToCollect,
  billedIn,
  change,
  isOpen,
  keyOf,
  monthShortLabel,
  onTimeRate,
  paidIn,
  periodLabel,
  periodMonths,
  previousPeriodMonths,
  subtotalOf,
  sum,
  topClients,
} from '../../billing-overview/billing-metrics';
import { planLabel } from '../../shared/utils/labels.util';

/** What the admin types before downloading: costs the system does not know, and the direction's comments. */
export interface PartnerReportInputs {
  /** Cost of serving the labs: hosting, CFDI stamps, storage, support. */
  costOfService: ExpenseLine[];
  /** Running the company: payroll, sales and marketing, administration. */
  operatingExpenses: ExpenseLine[];
  /** Cash in the bank at the end of the period, for the runway. */
  cashOnHand: number | null;
  highlights: string;
  challenges: string;
  nextSteps: string;
}

export interface ExpenseLine {
  label: string;
  amount: number | null;
}

export function emptyInputs(): PartnerReportInputs {
  return {
    costOfService: [
      { label: 'Infraestructura y hosting', amount: null },
      { label: 'Timbrado CFDI y servicios de terceros', amount: null },
      { label: 'Soporte e implementación', amount: null },
    ],
    operatingExpenses: [
      { label: 'Nómina y honorarios', amount: null },
      { label: 'Ventas y marketing', amount: null },
      { label: 'Gastos de administración', amount: null },
      { label: 'Otros gastos', amount: null },
    ],
    cashOnHand: null,
    highlights: '',
    challenges: '',
    nextSteps: '',
  };
}

const REVENUE_LABELS: Partial<Record<BillingLineType, string>> = {
  PlanBase: 'Suscripciones (plan base)',
  CaseTier: 'Excedente por volumen de casos',
  AddOn: 'Módulos adicionales',
  CfdiStamp: 'Timbrado CFDI',
  StorageBlock: 'Almacenamiento adicional',
  MigrationAdjustment: 'Ajustes de migración',
};

export interface AmountRow {
  label: string;
  amount: number;
}

export interface MonthRow {
  label: string;
  revenue: number;
  tax: number;
  collected: number;
  newClients: number;
  totalClients: number;
}

export interface AgingRow {
  label: string;
  amount: number;
  count: number;
}

export interface PartnerReport {
  periodLabel: string;
  generatedAt: Date;
  months: MonthRow[];

  // Income statement (accrual: by month of service, before IVA).
  revenueLines: AmountRow[];
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  costOfService: AmountRow[];
  totalCostOfService: number;
  grossProfit: number;
  operatingExpenses: AmountRow[];
  totalOperatingExpenses: number;
  operatingIncome: number;
  /** The admin typed at least one cost; without them the statement stops at revenue. */
  hasExpenses: boolean;

  // Headline numbers.
  previousNetRevenue: number;
  revenueChange: number | null;
  collected: number;
  previousCollected: number;
  collectedChange: number | null;
  /** Revenue before IVA of the last month with billing: the monthly recurring revenue. */
  mrr: number;
  mrrMonth: string | null;
  arr: number;
  /** Months of cash at the current burn; null when there is no burn or no cash typed. */
  runwayMonths: number | null;
  monthlyBurn: number | null;
  cashOnHand: number | null;

  // Clients.
  totalClients: number;
  newClients: number;
  previousNewClients: number;
  clientsAtStart: number;
  clientGrowth: number | null;
  status: { active: number; trial: number; suspended: number; cancelled: number };
  conversion: number | null;
  plans: { label: string; count: number }[];
  arpa: number | null;
  top: { name: string; amount: number; share: number }[];
  topShare: number;

  // Collections, as of today.
  outstanding: number;
  overdue: number;
  aging: AgingRow[];
  overdueClients: { name: string; amount: number; days: number }[];
  onTime: number | null;
  daysToCollect: number | null;

  inputs: PartnerReportInputs;
}

function expenseRows(lines: ExpenseLine[]): AmountRow[] {
  return lines.filter((l) => l.label.trim() && l.amount != null && l.amount !== 0).map((l) => ({ label: l.label.trim(), amount: Number(l.amount) }));
}

function daysOverdue(p: PrefacturaRow, today: Date): number {
  if (!p.dueDate) return 0;
  const due = new Date(`${p.dueDate.slice(0, 10)}T00:00:00`);
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

export function buildPartnerReport(overview: BillingOverview, period: Period, inputs: PartnerReportInputs, today = new Date()): PartnerReport {
  const { clients, prefacturas } = overview;
  const months = periodMonths(period, today);
  const previous = previousPeriodMonths(period, today);

  // ---- Income statement ----
  const billed = billedIn(prefacturas, months);
  const byType = new Map<string, number>();
  let discounts = 0;
  for (const p of billed) {
    for (const line of p.lines) {
      if (line.lineType === 'Note') continue;
      if (line.lineType === 'Discount') {
        discounts += line.amount;
        continue;
      }
      const label = REVENUE_LABELS[line.lineType] ?? 'Otros conceptos';
      byType.set(label, (byType.get(label) ?? 0) + line.amount);
    }
  }
  const netRevenue = subtotalOf(billed);
  const linesTotal = [...byType.values()].reduce((a, b) => a + b, 0) + discounts;
  // Edited prefacturas may not add up line by line; the difference is shown rather than hidden.
  const adjustment = netRevenue - linesTotal;
  if (Math.abs(adjustment) >= 0.01) byType.set('Ajustes', (byType.get('Ajustes') ?? 0) + adjustment);
  const revenueLines = [...byType.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
  const grossRevenue = revenueLines.reduce((a, r) => a + r.amount, 0);

  const costOfService = expenseRows(inputs.costOfService);
  const operatingExpenses = expenseRows(inputs.operatingExpenses);
  const totalCostOfService = costOfService.reduce((a, r) => a + r.amount, 0);
  const totalOperatingExpenses = operatingExpenses.reduce((a, r) => a + r.amount, 0);
  const grossProfit = netRevenue - totalCostOfService;
  const operatingIncome = grossProfit - totalOperatingExpenses;

  // ---- Months ----
  const monthRows: MonthRow[] = months.map((key) => {
    const rows = billed.filter((p) => keyOf(p.servicePeriodStart) === key);
    return {
      label: monthShortLabel(key),
      revenue: subtotalOf(rows),
      tax: rows.reduce((a, p) => a + p.taxAmount, 0),
      collected: sum(paidIn(prefacturas, [key])),
      newClients: clients.filter((c) => keyOf(c.createdAt) === key).length,
      totalClients: clients.filter((c) => (keyOf(c.createdAt) ?? '') <= key).length,
    };
  });

  const previousNetRevenue = subtotalOf(billedIn(prefacturas, previous));
  const collected = sum(paidIn(prefacturas, months));
  const previousCollected = sum(paidIn(prefacturas, previous));

  // The current month is still being billed, so MRR takes the last month that already has revenue.
  const lastWithRevenue = [...monthRows].reverse().find((m) => m.revenue > 0);
  const mrr = lastWithRevenue?.revenue ?? 0;

  const elapsedMonths = months.length || 1;
  const monthlyBurn = inputs.cashOnHand != null && operatingIncome < 0 ? -operatingIncome / elapsedMonths : null;
  const runwayMonths = monthlyBurn && inputs.cashOnHand != null ? inputs.cashOnHand / monthlyBurn : null;

  // ---- Clients ----
  const first = months[0];
  const clientsAtStart = clients.filter((c) => (keyOf(c.createdAt) ?? '') < first).length;
  const newClients = clients.filter((c) => months.includes(keyOf(c.createdAt) ?? '')).length;
  const previousNewClients = clients.filter((c) => previous.includes(keyOf(c.createdAt) ?? '')).length;
  const count = (status: string) => clients.filter((c) => c.subscription?.status === status).length;
  const status = { active: count('Active'), trial: count('Trial'), suspended: count('Suspended'), cancelled: count('Cancelled') };
  const decided = status.active + status.cancelled;

  const planCounts = new Map<string, number>();
  for (const c of clients) {
    if (!c.subscription || (c.subscription.status !== 'Active' && c.subscription.status !== 'Trial')) continue;
    const label = planLabel(c.subscription.planCode);
    planCounts.set(label, (planCounts.get(label) ?? 0) + 1);
  }

  const lastMonthKey = lastWithRevenue ? months[monthRows.indexOf(lastWithRevenue)] : null;
  const lastMonthBilled = lastMonthKey ? billed.filter((p) => keyOf(p.servicePeriodStart) === lastMonthKey) : [];
  const payers = new Set(lastMonthBilled.map((p) => p.clientId)).size;

  const top = topClients(prefacturas, months, 5);
  const periodCollected = collected || 1;
  const topShare = top.reduce((a, c) => a + c.total, 0) / periodCollected * 100;

  // ---- Collections ----
  const open = prefacturas.filter((p) => p.status === 'Issued');
  const buckets: AgingRow[] = [
    { label: 'Al corriente', amount: 0, count: 0 },
    { label: '1 a 30 días vencido', amount: 0, count: 0 },
    { label: '31 a 60 días', amount: 0, count: 0 },
    { label: '61 a 90 días', amount: 0, count: 0 },
    { label: 'Más de 90 días', amount: 0, count: 0 },
  ];
  const overdueByClient = new Map<string, { name: string; amount: number; days: number }>();
  for (const p of open) {
    const days = p.isOverdue ? Math.max(1, daysOverdue(p, today)) : 0;
    const bucket = days === 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    buckets[bucket].amount += p.total;
    buckets[bucket].count += 1;
    if (days > 0) {
      const entry = overdueByClient.get(p.clientId) ?? { name: p.clientName, amount: 0, days: 0 };
      entry.amount += p.total;
      entry.days = Math.max(entry.days, days);
      overdueByClient.set(p.clientId, entry);
    }
  }
  const periodPaid = paidIn(prefacturas, months);

  return {
    periodLabel: periodLabel(period, today),
    generatedAt: today,
    months: monthRows,
    revenueLines,
    grossRevenue,
    discounts,
    netRevenue,
    costOfService,
    totalCostOfService,
    grossProfit,
    operatingExpenses,
    totalOperatingExpenses,
    operatingIncome,
    hasExpenses: costOfService.length + operatingExpenses.length > 0,
    previousNetRevenue,
    revenueChange: change(netRevenue, previousNetRevenue),
    collected,
    previousCollected,
    collectedChange: change(collected, previousCollected),
    mrr,
    mrrMonth: lastWithRevenue?.label ?? null,
    arr: mrr * 12,
    runwayMonths,
    monthlyBurn,
    cashOnHand: inputs.cashOnHand,
    totalClients: clients.length,
    newClients,
    previousNewClients,
    clientsAtStart,
    clientGrowth: change(clientsAtStart + newClients, clientsAtStart),
    status,
    conversion: decided ? (status.active / decided) * 100 : null,
    plans: [...planCounts.entries()].map(([label, n]) => ({ label, count: n })).sort((a, b) => b.count - a.count),
    arpa: payers ? mrr / payers : null,
    top: top.map((c) => ({ name: c.clientName, amount: c.total, share: (c.total / periodCollected) * 100 })),
    topShare: collected ? topShare : 0,
    outstanding: sum(prefacturas.filter(isOpen)),
    overdue: sum(prefacturas.filter((p) => p.isOverdue)),
    aging: buckets,
    overdueClients: [...overdueByClient.values()].sort((a, b) => b.amount - a.amount).slice(0, 8),
    onTime: onTimeRate(periodPaid),
    daysToCollect: averageDaysToCollect(periodPaid),
    inputs,
  };
}
