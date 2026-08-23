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
