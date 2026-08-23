export type PlanCode = 'esencial' | 'crecimiento' | 'escala' | 'enterprise';
export type AddOnCode = 'billing' | 'inventory';

export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Expired' | 'Superseded';
export type SubscriptionStatus = 'Trial' | 'Active' | 'Suspended' | 'Cancelled';
export type BillingCycle = 'Monthly' | 'Annual';
export type PlatformRole = 'Admin' | 'Sales' | 'Support';
export type AddOnAvailability = 'Included' | 'Optional' | 'NotAvailable';
