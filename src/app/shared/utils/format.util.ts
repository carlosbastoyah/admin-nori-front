export function formatMXN(value: number | null | undefined): string {
  const amount = value ?? 0;
  return '$' + amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatNumber(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('es-MX');
}
