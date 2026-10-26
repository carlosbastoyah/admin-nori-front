/** What Nori charges a lab: its fiscal data, the billing periods and the prefacturas that charge them. */

export type PrefacturaStatus = 'Draft' | 'Issued' | 'Paid' | 'Cancelled';

export type BillingLineType =
  | 'PlanBase'
  | 'CaseTier'
  | 'AddOn'
  | 'CfdiStamp'
  | 'StorageBlock'
  | 'MigrationAdjustment'
  | 'Discount'
  | 'Note';

export interface PrefacturaLine {
  lineType: BillingLineType;
  description: string;
  /** Text under the concept: what the plan includes, the service period, the volume. */
  detail: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface Prefactura {
  id: string;
  clientId: string;
  /** Folio, e.g. PRE-NR-0002. */
  invoiceNumber: string;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  status: PrefacturaStatus;
  createdAt: string;
  issuedAt: string | null;
  /** Vigencia: the day the payment is due. */
  dueDate: string | null;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  notes: string | null;
  isOverdue: boolean;
  lines: PrefacturaLine[];
}

export interface PrefacturaPreview {
  periodStart: string;
  periodEnd: string;
  serviceStart: string;
  serviceEnd: string;
  studies: number;
  /** False when the admin typed the studies or the usage service did not answer. */
  studiesFromUsage: boolean;
  usageWarning: string | null;
  lines: PrefacturaLine[];
  subtotal: number;
  taxAmount: number;
  total: number;
}

/** A month since the service started and the prefactura that charges it, if any. */
export interface BillingPeriod {
  periodStart: string;
  periodEnd: string;
  isCurrent: boolean;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: PrefacturaStatus | null;
  invoiceTotal: number | null;
  isOverdue: boolean;
}

export interface GeneratePrefacturaRequest {
  /** Any day of the period to charge (yyyy-MM-dd). */
  periodStart: string;
  /** Overrides the studies measured by the lab's usage. */
  studies: number | null;
  dueDate: string | null;
  notes: string | null;
}

export interface PrefacturaLineInput {
  lineType: BillingLineType;
  description: string;
  detail: string | null;
  quantity: number;
  unitPrice: number;
}

export interface UpdatePrefacturaRequest {
  lines: PrefacturaLineInput[];
  dueDate: string | null;
  notes: string | null;
}

export interface MarkPrefacturaPaidRequest {
  paidOn: string;
  paymentMethod: string | null;
  paymentReference: string | null;
}

/** Receptor of the prefactura. */
export interface ClientBillingProfile {
  legalName: string;
  rfc: string;
  /** SAT régimen fiscal key, e.g. 601. */
  taxRegime: string | null;
  postalCode: string | null;
  city: string | null;
  /** SAT uso de CFDI key, e.g. G03. */
  cfdiUse: string | null;
  billingEmail: string | null;
}
