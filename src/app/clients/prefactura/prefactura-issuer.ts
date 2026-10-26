/**
 * Who issues Nori's prefacturas and how the lab pays them. Bank data stays "Por confirmar" until the account
 * exists; while it does, the note at the bottom of the prefactura says it will be shared later.
 */
export const PREFACTURA_ISSUER = {
  brandFirst: 'WER',
  brandSecond: 'SOFT',
  legalName: 'WERSOFT SOLUTIONS',
  rfc: 'WSO260707KC6',
  taxRegimeHeader: 'Régimen 626 — Simplificado de Confianza (Personas Morales)',
  taxRegime: 'Régimen Simplificado de Confianza',
  address: 'Mérida, Yucatán, México · C.P. 97302',
  expeditionPlace: '97302 — Mérida, Yuc.',
  email: 'contacto@wersoft.mx',
  website: 'wersoft.mx',
  tagline: 'Software que impulsa tu operación',
  product: 'NORI',
  logoUrl: 'brand/wersoft-logo.png',
  bank: {
    name: null as string | null,
    holder: 'WERSOFT SOLUTIONS',
    clabe: null as string | null,
  },
  /** SAT forma de pago printed under Condiciones; null prints "Por confirmar". */
  paymentForm: null as string | null,
  currency: 'MXN — Peso mexicano',
  invoicing: 'CFDI 4.0 al confirmar el pago',
  /** SAT keys every concept is billed with: software as a service, unit "servicio", taxed. */
  satProductKey: '81112501',
  satUnit: 'E48',
  satTaxObject: '02',
  taxRateLabel: 'IVA trasladado 16%',
} as const;

/** Short names of the régimen fiscal keys, as they fit in the receptor box. */
export const TAX_REGIME_SHORT: Record<string, string> = {
  '601': 'General de Ley P.M.',
  '603': 'P.M. con Fines no Lucrativos',
  '605': 'Sueldos y Salarios',
  '606': 'Arrendamiento',
  '612': 'Act. Empresariales y Profesionales',
  '616': 'Sin obligaciones fiscales',
  '621': 'Incorporación Fiscal',
  '625': 'Plataformas Tecnológicas',
  '626': 'Simplificado de Confianza',
};
