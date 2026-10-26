export type BadgeTone = 'ok' | 'info' | 'warn' | 'danger' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  ok: 'bg-ok-light text-ok',
  info: 'bg-info-light text-info',
  warn: 'bg-lo-light text-lo',
  danger: 'bg-hi-light text-hi',
  neutral: 'bg-surface-sunken text-type-3',
};

export function badgeClass(tone: BadgeTone): string {
  return `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`;
}

export const PLAN_LABELS: Record<string, string> = {
  esencial: 'Esencial',
  crecimiento: 'Crecimiento',
  escala: 'Escala',
  enterprise: 'Enterprise',
};

export function planLabel(code: string): string {
  return PLAN_LABELS[code] ?? code;
}

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  Trial: 'Prueba',
  Active: 'Activa',
  Suspended: 'Suspendida',
  Cancelled: 'Cancelada',
};

export function subscriptionStatusLabel(status: string): string {
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}

export function subscriptionStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'Active':
      return 'ok';
    case 'Trial':
      return 'info';
    case 'Suspended':
      return 'warn';
    case 'Cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  Draft: 'Borrador',
  Sent: 'Enviada',
  Accepted: 'Aceptada',
  Expired: 'Expirada',
  Superseded: 'Reemplazada',
};

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUS_LABELS[status] ?? status;
}

export function quoteStatusTone(status: string): BadgeTone {
  switch (status) {
    case 'Accepted':
      return 'ok';
    case 'Sent':
      return 'info';
    case 'Expired':
      return 'warn';
    case 'Superseded':
      return 'neutral';
    default:
      return 'neutral';
  }
}

const PREFACTURA_STATUS_LABELS: Record<string, string> = {
  Draft: 'Borrador',
  Issued: 'Emitida',
  Paid: 'Pagada',
  Cancelled: 'Cancelada',
};

export function prefacturaStatusLabel(status: string, isOverdue = false): string {
  if (isOverdue) return 'Vencida';
  return PREFACTURA_STATUS_LABELS[status] ?? status;
}

export function prefacturaStatusTone(status: string, isOverdue = false): BadgeTone {
  if (isOverdue) return 'danger';
  switch (status) {
    case 'Paid':
      return 'ok';
    case 'Issued':
      return 'info';
    case 'Draft':
      return 'warn';
    default:
      return 'neutral';
  }
}

/** SAT formas de pago an admin records a lab's payment with. */
export const PAYMENT_METHODS: ReadonlyArray<{ code: string; label: string }> = [
  { code: '03', label: '03 — Transferencia electrónica' },
  { code: '01', label: '01 — Efectivo' },
  { code: '02', label: '02 — Cheque nominativo' },
  { code: '04', label: '04 — Tarjeta de crédito' },
  { code: '28', label: '28 — Tarjeta de débito' },
  { code: '99', label: '99 — Por definir' },
];

export function paymentMethodLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return PAYMENT_METHODS.find((m) => m.code === code)?.label ?? code;
}

/** SAT régimen fiscal keys a lab may have. */
export const TAX_REGIMES: ReadonlyArray<{ code: string; label: string }> = [
  { code: '601', label: '601 — General de Ley Personas Morales' },
  { code: '603', label: '603 — Personas Morales con Fines no Lucrativos' },
  { code: '605', label: '605 — Sueldos y Salarios' },
  { code: '606', label: '606 — Arrendamiento' },
  { code: '612', label: '612 — Personas Físicas con Actividades Empresariales y Profesionales' },
  { code: '616', label: '616 — Sin obligaciones fiscales' },
  { code: '621', label: '621 — Incorporación Fiscal' },
  { code: '625', label: '625 — Actividades Empresariales con ingresos a través de Plataformas Tecnológicas' },
  { code: '626', label: '626 — Régimen Simplificado de Confianza' },
];

export function taxRegimeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return TAX_REGIMES.find((r) => r.code === code)?.label ?? code;
}
