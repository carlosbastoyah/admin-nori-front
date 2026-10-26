import { Client } from '../clients/models/client.models';
import { PrefacturaRow } from './billing-overview.service';

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** One month of a series: `key` is yyyy-MM. */
export interface MonthPoint {
  key: string;
  label: string;
  value: number;
  /** Extra line for the tooltip. */
  hint?: string;
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** yyyy-MM of an ISO date or datetime, without moving it through the browser's time zone. */
export function keyOf(value: string | null | undefined): string | null {
  return value ? value.slice(0, 7) : null;
}

export function monthShortLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

/** The last `count` month keys, oldest first, ending in the current month. */
export function lastMonths(count: number, today = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => monthKey(new Date(today.getFullYear(), today.getMonth() - (count - 1 - i), 1)));
}

/** The span the dashboard and the report look at: the last 12 months, or a calendar year. */
export type Period = 'last12' | number;

/** Month keys of the period, oldest first; the current year stops at the current month. */
export function periodMonths(period: Period, today = new Date()): string[] {
  if (period === 'last12') return lastMonths(12, today);
  const last = period === today.getFullYear() ? today.getMonth() + 1 : 12;
  return Array.from({ length: last }, (_, i) => `${period}-${String(i + 1).padStart(2, '0')}`);
}

/** The same months one period earlier, to compare against: the 12 before, or the same months of the year before. */
export function previousPeriodMonths(period: Period, today = new Date()): string[] {
  if (period === 'last12') return lastMonths(24, today).slice(0, 12);
  return periodMonths(period, today).map((key) => `${period - 1}${key.slice(4)}`);
}

export function periodLabel(period: Period, today = new Date()): string {
  if (period === 'last12') return 'Últimos 12 meses';
  if (period === today.getFullYear()) return `${MONTHS_SHORT[0]}–${MONTHS_SHORT[today.getMonth()]} ${period}`;
  return String(period);
}

/** Years with data, newest first, always including the current one. */
export function availableYears(clients: Client[], prefacturas: PrefacturaRow[], today = new Date()): number[] {
  const years = new Set<number>([today.getFullYear()]);
  for (const c of clients) if (c.createdAt) years.add(Number(c.createdAt.slice(0, 4)));
  for (const p of prefacturas) if (p.servicePeriodStart) years.add(Number(p.servicePeriodStart.slice(0, 4)));
  return [...years].filter((y) => y > 2000).sort((a, b) => b - a);
}

/** Issued or paid: what the business earned. Drafts are not final and cancelled ones were never owed. */
export function isBilled(p: PrefacturaRow): boolean {
  return p.status === 'Issued' || p.status === 'Paid';
}

export function sum(rows: { total: number }[]): number {
  return rows.reduce((total, row) => total + row.total, 0);
}

export function isOpen(p: PrefacturaRow): boolean {
  return p.status === 'Draft' || p.status === 'Issued';
}

/** Money collected each month, by the day it was paid. */
export function collectedByMonth(prefacturas: PrefacturaRow[], months: string[]): MonthPoint[] {
  const paid = prefacturas.filter((p) => p.status === 'Paid');
  return months.map((key) => {
    const rows = paid.filter((p) => keyOf(p.paidAt) === key);
    return { key, label: monthShortLabel(key), value: sum(rows), hint: `${rows.length} pago${rows.length === 1 ? '' : 's'}` };
  });
}

/** Revenue before IVA of each month of service (drafts and cancelled left out): the income statement's view. */
export function revenueByMonth(prefacturas: PrefacturaRow[], months: string[]): MonthPoint[] {
  const billed = prefacturas.filter(isBilled);
  return months.map((key) => {
    const rows = billed.filter((p) => keyOf(p.servicePeriodStart) === key);
    const value = rows.reduce((total, p) => total + p.subtotal, 0);
    return { key, label: monthShortLabel(key), value, hint: `${rows.length} prefactura${rows.length === 1 ? '' : 's'}` };
  });
}

/** Paid prefacturas whose payment falls in the months. */
export function paidIn(prefacturas: PrefacturaRow[], months: string[]): PrefacturaRow[] {
  return prefacturas.filter((p) => p.status === 'Paid' && months.includes(keyOf(p.paidAt) ?? ''));
}

/** Issued or paid prefacturas whose service month falls in the months. */
export function billedIn(prefacturas: PrefacturaRow[], months: string[]): PrefacturaRow[] {
  return prefacturas.filter((p) => isBilled(p) && months.includes(keyOf(p.servicePeriodStart) ?? ''));
}

export function subtotalOf(rows: { subtotal: number }[]): number {
  return rows.reduce((total, row) => total + row.subtotal, 0);
}

/** Clients registered by the end of each month, with the new ones of that month. */
export function clientGrowth(clients: Client[], months: string[]): MonthPoint[] {
  return months.map((key) => {
    const total = clients.filter((c) => (keyOf(c.createdAt) ?? '') <= key).length;
    const added = clients.filter((c) => keyOf(c.createdAt) === key).length;
    return { key, label: monthShortLabel(key), value: total, hint: `+${added} nuevo${added === 1 ? '' : 's'} en el mes` };
  });
}

/** Percent change from `previous` to `current`; null when there is nothing to compare against. */
export function change(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function daysBetween(from: string, to: string): number {
  return (new Date(to.slice(0, 10)).getTime() - new Date(from.slice(0, 10)).getTime()) / 86_400_000;
}

/** Of the paid prefacturas with a due date, how many were paid on or before it (percent). */
export function onTimeRate(prefacturas: PrefacturaRow[]): number | null {
  const measured = prefacturas.filter((p) => p.status === 'Paid' && p.paidAt && p.dueDate);
  if (!measured.length) return null;
  const onTime = measured.filter((p) => p.paidAt!.slice(0, 10) <= p.dueDate!.slice(0, 10)).length;
  return (onTime / measured.length) * 100;
}

/** Average days from issuing a prefactura to getting it paid. */
export function averageDaysToCollect(prefacturas: PrefacturaRow[]): number | null {
  const measured = prefacturas.filter((p) => p.status === 'Paid' && p.paidAt && p.issuedAt);
  if (!measured.length) return null;
  return measured.reduce((total, p) => total + Math.max(0, daysBetween(p.issuedAt!, p.paidAt!)), 0) / measured.length;
}

export interface ClientRevenue {
  clientId: string;
  clientName: string;
  total: number;
}

/** Clients that paid the most in the given months, highest first. */
export function topClients(prefacturas: PrefacturaRow[], months: string[], limit: number): ClientRevenue[] {
  const byClient = new Map<string, ClientRevenue>();
  for (const p of prefacturas) {
    if (p.status !== 'Paid' || !months.includes(keyOf(p.paidAt) ?? '')) continue;
    const entry = byClient.get(p.clientId) ?? { clientId: p.clientId, clientName: p.clientName, total: 0 };
    entry.total += p.total;
    byClient.set(p.clientId, entry);
  }
  return [...byClient.values()].sort((a, b) => b.total - a.total).slice(0, limit);
}

export function formatPercent(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Compact money for chart axes: $12.5k, $1.2M. */
export function formatMXNShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${Math.round(value)}`;
}
