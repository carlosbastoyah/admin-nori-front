import type { Content, ContentTable, TDocumentDefinitions } from 'pdfmake/interfaces';
import { amountInWordsMXN } from '../../shared/utils/amount-in-words.util';
import { paymentMethodLabel } from '../../shared/utils/labels.util';
import { ClientBillingProfile, Prefactura } from '../models/billing.models';
import { PREFACTURA_ISSUER as ISSUER, TAX_REGIME_SHORT } from './prefactura-issuer';

const NAVY = '#14335F';
const TEAL = '#21B6AF';
const TEAL_LIGHT = '#E6F6F5';
const SLATE_LIGHT = '#F6F8FB';
const GRAY = '#5B6B7B';
const LINE = '#E3E8EF';
const PENDING = 'Por confirmar';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export interface PrefacturaPdfInput {
  prefactura: Prefactura;
  clientName: string;
  profile: ClientBillingProfile | null;
}

/**
 * Year, month and day of an API value. A date ("2026-08-01") is already a calendar day; a moment
 * ("2026-10-01T02:00:00Z") is read in the admin's time zone, so a prefactura issued at 8 pm in Mérida
 * keeps that day instead of the next one in UTC.
 */
function calendarDay(value: string): [number, number, number] {
  if (value.length <= 10) {
    const [y, m, d] = value.split('-').map(Number);
    return [y, m, d];
  }
  const date = new Date(value);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}

/** "30/septiembre/2026". */
export function longDate(value: string | null | undefined): string {
  if (!value) return '';
  const [y, m, d] = calendarDay(value);
  return `${String(d).padStart(2, '0')}/${MONTHS[m - 1]}/${y}`;
}

/** "30/09/2026". */
export function shortDate(value: string | null | undefined): string {
  if (!value) return '';
  const [y, m, d] = calendarDay(value);
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/** File name like the template's: Prefactura_Capay_Agosto2026.pdf. */
export function prefacturaFileName(input: PrefacturaPdfInput): string {
  const [y, m] = calendarDay(input.prefactura.servicePeriodStart ?? input.prefactura.createdAt);
  const month = MONTHS[m - 1];
  const client = input.clientName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '') || 'Cliente';
  return `Prefactura_${client}_${month.charAt(0).toUpperCase()}${month.slice(1)}${y}_${input.prefactura.invoiceNumber}.pdf`;
}

function money(value: number): string {
  return '$ ' + value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function unitMoney(value: number): string {
  return '$ ' + value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function quantity(value: number): string {
  return value.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function spaced(text: string, color = GRAY, size = 7): Content {
  return { text: text.toUpperCase(), fontSize: size, bold: true, color, characterSpacing: 1.6 };
}

/** Key/value rows of the emisor, receptor, pago and condiciones boxes. */
function pairs(rows: Array<[string, string]>, labelWidth: number, margin: [number, number, number, number] = [0, 0, 0, 0]): Content {
  return {
    margin,
    table: {
      widths: [labelWidth, '*'],
      body: rows.map(([label, value]) => [
        { text: label, color: GRAY, fontSize: 9 },
        { text: value || PENDING, bold: true, color: NAVY, fontSize: 9 },
      ]),
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 8, paddingRight: () => 0, paddingTop: () => 1.5, paddingBottom: () => 1.5 },
  };
}

/** A white box with a colored top rule, like EMISOR and RECEPTOR / CLIENTE. */
function partyBox(title: string, name: string, rows: Array<[string, string]>, accent: string): ContentTable {
  return {
    table: {
      widths: ['*'],
      body: [[{ stack: [spaced(title), { text: name, bold: true, color: NAVY, fontSize: 11, margin: [0, 4, 0, 4] }, pairs(rows, 100)] }]],
    },
    layout: {
      hLineWidth: (i) => (i === 0 ? 2.5 : 0.75),
      vLineWidth: () => 0.75,
      hLineColor: (i) => (i === 0 ? accent : LINE),
      vLineColor: () => LINE,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 10,
      paddingBottom: () => 10,
    },
  };
}

function receptorRows(profile: ClientBillingProfile | null): Array<[string, string]> {
  const regime = profile?.taxRegime ? `${profile.taxRegime} — ${TAX_REGIME_SHORT[profile.taxRegime] ?? ''}`.replace(/ — $/, '') : '';
  const postal = profile?.postalCode ? [profile.postalCode, profile.city].filter(Boolean).join(' — ') : '';
  const rows: Array<[string, string]> = [
    ['RFC', profile?.rfc ?? ''],
    ['Domicilio fiscal (C.P.)', postal],
    ['Régimen fiscal', regime],
  ];
  if (profile?.cfdiUse) rows.push(['Uso de CFDI', profile.cfdiUse]);
  return rows;
}

function conceptsTable(prefactura: Prefactura): Content {
  const header = ['CLAVE SAT', 'CONCEPTO', 'CANT.', 'P. UNITARIO', 'IMPORTE'].map((text, i) => ({
    text,
    color: 'white',
    bold: true,
    fontSize: 7.5,
    characterSpacing: 1.2,
    alignment: (i >= 2 ? 'right' : 'left') as 'right' | 'left',
  }));

  const rows = prefactura.lines.map((line) => {
    const isNote = line.lineType === 'Note';
    return [
      {
        stack: [
          { text: ISSUER.satProductKey, fontSize: 8, color: GRAY },
          { text: `Unidad: ${ISSUER.satUnit}`, fontSize: 7.5, color: GRAY },
          { text: `Obj. imp.: ${ISSUER.satTaxObject}`, fontSize: 7.5, color: GRAY },
        ],
      },
      {
        stack: [
          { text: line.description, bold: true, color: NAVY, fontSize: 10 },
          ...(line.detail ? [{ text: line.detail, fontSize: 8, color: GRAY, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
        ],
      },
      { text: isNote ? '' : quantity(line.quantity), alignment: 'right' as const, fontSize: 9.5, color: NAVY },
      { text: isNote ? '' : unitMoney(line.unitPrice), alignment: 'right' as const, fontSize: 9.5, color: NAVY },
      { text: isNote ? '' : money(line.amount), alignment: 'right' as const, fontSize: 9.5, color: NAVY },
    ];
  });

  return {
    table: { headerRows: 1, dontBreakRows: true, widths: [58, '*', 36, 60, 66], body: [header, ...rows] },
    layout: {
      fillColor: (row) => (row === 0 ? NAVY : null),
      hLineWidth: (i, node) => (i === 0 || i === 1 ? 0 : i === node.table.body.length ? 0.75 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: (i) => (i === 0 ? 6 : 9),
      paddingBottom: (i) => (i === 0 ? 6 : 9),
    },
  };
}

function totals(prefactura: Prefactura): Content {
  return {
    table: {
      widths: ['*', 'auto'],
      body: [
        [{ text: 'Subtotal', color: GRAY, fontSize: 9.5 }, { text: money(prefactura.subtotal), bold: true, color: NAVY, fontSize: 9.5, alignment: 'right' }],
        [{ text: ISSUER.taxRateLabel, color: GRAY, fontSize: 9.5 }, { text: money(prefactura.taxAmount), bold: true, color: NAVY, fontSize: 9.5, alignment: 'right' }],
        [
          { text: 'Total MXN', bold: true, color: 'white', fontSize: 12, fillColor: TEAL },
          { text: money(prefactura.total), bold: true, color: 'white', fontSize: 12, alignment: 'right', fillColor: TEAL },
        ],
      ],
    },
    layout: {
      hLineWidth: (i) => (i === 1 ? 0.5 : 0),
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: (i) => (i === 2 ? 7 : 5),
      paddingBottom: (i) => (i === 2 ? 7 : 5),
    },
  };
}

/** Status the document carries across the page when it is not a live prefactura. */
function watermark(prefactura: Prefactura): TDocumentDefinitions['watermark'] {
  if (prefactura.status === 'Draft') return { text: 'BORRADOR', color: NAVY, opacity: 0.06, bold: true };
  if (prefactura.status === 'Cancelled') return { text: 'CANCELADA', color: '#C0392B', opacity: 0.1, bold: true };
  return undefined;
}

export function buildPrefacturaDocument(input: PrefacturaPdfInput, logoDataUrl: string | null): TDocumentDefinitions {
  const { prefactura, profile } = input;
  const folio = prefactura.invoiceNumber;
  const bankPending = !ISSUER.bank.clabe;
  const issuedOn = prefactura.issuedAt ?? prefactura.createdAt;

  const meta: Array<[string, string]> = [
    ['Folio', folio],
    ['Fecha de emisión', longDate(issuedOn)],
    ['Vigencia', longDate(prefactura.dueDate)],
  ];
  if (prefactura.status === 'Paid') meta.push(['Pagada el', longDate(prefactura.paidAt)]);

  const header: Content = {
    columns: [
      {
        width: '*',
        columns: [
          ...(logoDataUrl ? [{ image: logoDataUrl, width: 62, margin: [0, 2, 12, 0] as [number, number, number, number] }] : []),
          {
            width: '*',
            stack: [
              {
                text: [
                  { text: ISSUER.brandFirst, color: NAVY },
                  { text: ISSUER.brandSecond, color: TEAL },
                ],
                fontSize: 20,
                bold: true,
                characterSpacing: 3,
              },
              {
                text: [`${ISSUER.legalName} · RFC: ${ISSUER.rfc}`, ISSUER.taxRegimeHeader, ISSUER.address, `${ISSUER.email} · ${ISSUER.website}`].join('\n'),
                fontSize: 8,
                color: GRAY,
                lineHeight: 1.15,
                margin: [0, 4, 0, 0],
              },
            ],
          },
        ],
      },
      {
        width: 250,
        columns: [
          {
            width: 26,
            canvas: [{ type: 'polyline', closePath: true, points: [{ x: 16, y: 0 }, { x: 26, y: 0 }, { x: 10, y: 98 }, { x: 0, y: 98 }], color: TEAL, lineColor: TEAL }],
          },
          {
            width: '*',
            margin: [12, 0, 0, 0],
            stack: [
              spaced(ISSUER.product, TEAL, 8),
              { text: 'PREFACTURA', fontSize: 22, bold: true, color: NAVY, margin: [0, 1, 0, 0] },
              spaced('Documento previo de cobro — no fiscal', GRAY, 6.5),
              {
                margin: [0, 6, 0, 0],
                table: {
                  widths: ['auto', '*'],
                  body: meta.map(([label, value]) => [
                    { text: label, color: GRAY, fontSize: 8.5 },
                    { text: value, bold: true, color: NAVY, fontSize: 8.5, alignment: 'right' },
                  ]),
                },
                layout: {
                  fillColor: () => TEAL_LIGHT,
                  hLineWidth: () => 0,
                  vLineWidth: () => 0,
                  paddingLeft: () => 8,
                  paddingRight: () => 8,
                  paddingTop: () => 2.5,
                  paddingBottom: () => 2.5,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  const parties: Content = {
    margin: [0, 26, 0, 0],
    columns: [
      partyBox(
        'Emisor',
        ISSUER.legalName,
        [
          ['RFC', ISSUER.rfc],
          ['Régimen fiscal', ISSUER.taxRegime],
          ['Lugar de expedición', ISSUER.expeditionPlace],
        ],
        NAVY,
      ),
      partyBox('Receptor / Cliente', profile?.legalName || input.clientName, receptorRows(profile), TEAL),
    ],
    columnGap: 30,
  };

  const amountAndTotals: Content = {
    margin: [0, 22, 0, 0],
    columns: [
      {
        width: '*',
        table: {
          widths: ['*'],
          heights: [62],
          body: [[{ stack: [spaced('Importe con letra'), { text: amountInWordsMXN(prefactura.total), bold: true, color: NAVY, fontSize: 9.5, margin: [0, 5, 0, 0] }] }]],
        },
        layout: {
          fillColor: () => SLATE_LIGHT,
          hLineWidth: () => 0.75,
          vLineWidth: () => 0.75,
          hLineColor: () => LINE,
          vLineColor: () => LINE,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 9,
          paddingBottom: () => 9,
        },
      },
      { width: 220, stack: [totals(prefactura)] },
    ],
    columnGap: 40,
  };

  const paymentRows: Array<[string, string]> =
    prefactura.status === 'Paid'
      ? [
          ['Fecha de pago', longDate(prefactura.paidAt)],
          ['Forma de pago', paymentMethodLabel(prefactura.paymentMethod)],
          ['Referencia', prefactura.paymentReference ?? folio],
          ['Titular', ISSUER.bank.holder],
        ]
      : [
          ['Banco', ISSUER.bank.name ?? PENDING],
          ['Titular', ISSUER.bank.holder],
          ['CLABE', ISSUER.bank.clabe ?? PENDING],
          ['Referencia', folio],
        ];

  const paymentAndConditions: Content = {
    margin: [0, 28, 0, 0],
    columns: [
      { width: '*', stack: [spaced(prefactura.status === 'Paid' ? 'Pago recibido' : 'Datos para pago', TEAL), pairs(paymentRows, 80, [0, 5, 0, 0])] },
      {
        width: '*',
        stack: [
          spaced('Condiciones', TEAL),
          pairs(
            [
              ['Moneda', ISSUER.currency],
              ['Forma de pago', prefactura.status === 'Paid' ? paymentMethodLabel(prefactura.paymentMethod) : (ISSUER.paymentForm ?? PENDING)],
              ['Facturación', ISSUER.invoicing],
            ],
            80,
            [0, 5, 0, 0],
          ),
        ],
      },
    ],
    columnGap: 30,
  };

  const legal =
    `Una vez confirmado el pago, Wersoft emitirá la factura electrónica correspondiente. Para timbrar, envíe su constancia de situación fiscal ` +
    `y uso de CFDI a ${ISSUER.email} indicando el folio ${folio}.` +
    (bankPending && prefactura.status !== 'Paid' ? ' Los datos bancarios para el pago se compartirán en cuanto estén confirmados.' : '');

  const notes: Content[] = prefactura.notes
    ? [{ margin: [0, 18, 0, 0], stack: [spaced('Observaciones'), { text: prefactura.notes, fontSize: 8.5, color: NAVY, margin: [0, 4, 0, 0] }] }]
    : [];

  const disclaimer: Content = {
    margin: [0, 22, 0, 0],
    table: {
      widths: ['*'],
      body: [[{ text: [{ text: 'Este documento es una prefactura y no es un comprobante fiscal digital (CFDI). ', bold: true, color: NAVY }, { text: legal, color: GRAY }], fontSize: 8 }]],
    },
    layout: { fillColor: () => TEAL_LIGHT, hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 8, paddingBottom: () => 8 },
  };

  return {
    pageSize: 'LETTER',
    pageMargins: [40, 40, 40, 50],
    info: { title: `Prefactura ${folio}`, author: ISSUER.legalName, subject: `Prefactura ${folio} — ${input.clientName}` },
    defaultStyle: { fontSize: 9, color: NAVY },
    watermark: watermark(prefactura),
    footer: (currentPage, pageCount) => ({
      margin: [40, 12, 40, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 532, y2: 0, lineWidth: 0.75, lineColor: LINE }] },
        {
          margin: [0, 6, 0, 0],
          columns: [
            { text: [{ text: 'Wersoft', bold: true, color: NAVY }, { text: ` · ${ISSUER.tagline}`, color: GRAY }], fontSize: 7.5 },
            { text: `Página ${currentPage} de ${pageCount} · Prefactura ${folio}`, fontSize: 7.5, color: GRAY, alignment: 'right' },
          ],
        },
      ],
    }),
    content: [header, parties, { margin: [0, 26, 0, 0], stack: [conceptsTable(prefactura)] }, amountAndTotals, paymentAndConditions, ...notes, disclaimer],
  };
}

let logoCache: Promise<string | null> | null = null;

/** The issuer logo as a data URL, read once; the PDF goes without it if it cannot load. */
export function loadIssuerLogo(): Promise<string | null> {
  logoCache ??= fetch(new URL(ISSUER.logoUrl, document.baseURI))
    .then((response) => (response.ok ? response.blob() : Promise.reject()))
    .then(
      (blob) =>
        new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        }),
    )
    .catch(() => {
      logoCache = null;
      return null;
    });
  return logoCache;
}

/** pdfmake weighs ~1 MB with its fonts, so it loads the first time a PDF is made. */
export async function loadPdfMake(): Promise<any> {
  const [pdfMakeModule, fontsModule] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  const pdfMake: any = (pdfMakeModule as any).default ?? pdfMakeModule;
  const fonts: any = (fontsModule as any).default ?? fontsModule;
  pdfMake.vfs = fonts.pdfMake?.vfs ?? fonts.vfs ?? fonts;
  return pdfMake;
}

async function createPdf(input: PrefacturaPdfInput) {
  const [pdfMake, logo] = await Promise.all([loadPdfMake(), loadIssuerLogo()]);
  return pdfMake.createPdf(buildPrefacturaDocument(input, logo));
}

export async function downloadPrefacturaPdf(input: PrefacturaPdfInput): Promise<void> {
  (await createPdf(input)).download(prefacturaFileName(input));
}

/** Opens the PDF in a new tab to look at or print. */
export async function openPrefacturaPdf(input: PrefacturaPdfInput): Promise<void> {
  // Opened before the await so the browser does not treat it as a popup.
  const tab = window.open('', '_blank');
  try {
    (await createPdf(input)).open({}, tab);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
