import type { Column, Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { loadIssuerLogo, loadPdfMake, longDate } from '../../clients/prefactura/prefactura-pdf';
import { PREFACTURA_ISSUER as ISSUER } from '../../clients/prefactura/prefactura-issuer';
import { planLabel, quoteStatusLabel } from '../../shared/utils/labels.util';
import { Quote } from '../models/quote.models';

const NAVY = '#14335F';
const TEAL = '#21B6AF';
const TEAL_LIGHT = '#E6F6F5';
const SLATE_LIGHT = '#F6F8FB';
const GRAY = '#5B6B7B';
const LINE = '#E3E8EF';

/** "$ 1,200.00", or "−$ 600.00" for a discount. */
function money(value: number): string {
  return (value < 0 ? '−' : '') + '$ ' + Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function unitMoney(value: number): string {
  return (value < 0 ? '−' : '') + '$ ' + Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function quantity(value: number): string {
  return value.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function pct(fraction: number | undefined): string {
  return fraction ? `${(fraction * 100).toLocaleString('es-MX', { maximumFractionDigits: 2 })}%` : '—';
}

/** Folio printed on the quote; the API has no number for quotes, so it comes from the id. */
export function quoteFolio(quote: Quote): string {
  return `COT-${quote.id.toUpperCase()}`;
}

export function quoteCustomer(quote: Quote): string {
  return quote.clientName || quote.prospectName || 'Cliente';
}

function spaced(text: string, color = GRAY, size = 7): Content {
  return { text: text.toUpperCase(), fontSize: size, bold: true, color, characterSpacing: 1.6 };
}

function pairs(rows: Array<[string, string]>, labelWidth: number): Content {
  return {
    table: {
      widths: [labelWidth, '*'],
      body: rows.map(([label, value]) => [
        { text: label, color: GRAY, fontSize: 9 },
        { text: value || '—', bold: true, color: NAVY, fontSize: 9 },
      ]),
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 1.5, paddingBottom: () => 1.5 },
  };
}

function box(title: string, name: string, rows: Array<[string, string]>, accent: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{ stack: [spaced(title), { text: name, bold: true, color: NAVY, fontSize: 11, margin: [0, 4, 0, 4] }, pairs(rows, 90)] }]],
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

function conceptsTable(quote: Quote): Content {
  const header: TableCell[] = ['CONCEPTO', 'CANT.', 'P. UNITARIO', 'IMPORTE'].map((text, i) => ({
    text,
    color: 'white',
    bold: true,
    fontSize: 7.5,
    characterSpacing: 1.2,
    alignment: i >= 1 ? 'right' : 'left',
  }));
  const lines = [...quote.lineItems].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows: TableCell[][] = lines.map((line) => {
    const isNote = line.lineType === 'Note';
    return [
      { text: line.description, bold: !isNote, italics: isNote, color: isNote ? GRAY : NAVY, fontSize: isNote ? 8.5 : 9.5 },
      { text: isNote ? '' : quantity(line.quantity), alignment: 'right', fontSize: 9.5, color: NAVY },
      { text: isNote ? '' : unitMoney(line.unitPrice), alignment: 'right', fontSize: 9.5, color: NAVY },
      { text: isNote ? '' : money(line.amount), alignment: 'right', fontSize: 9.5, color: line.amount < 0 ? '#C2410C' : NAVY },
    ];
  });
  return {
    table: { headerRows: 1, dontBreakRows: true, widths: ['*', 40, 70, 76], body: [header, ...rows] },
    layout: {
      fillColor: (row) => (row === 0 ? NAVY : null),
      hLineWidth: (i, node) => (i === 0 || i === 1 ? 0 : i === node.table.body.length ? 0.75 : 0.5),
      vLineWidth: () => 0,
      hLineColor: () => LINE,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: (i) => (i === 0 ? 6 : 6),
      paddingBottom: (i) => (i === 0 ? 6 : 6),
    },
  };
}

function totals(quote: Quote): Content {
  const label = quote.billingCycle === 'Annual' ? 'Total anual MXN' : 'Total mensual MXN';
  return {
    table: {
      widths: ['*', 'auto'],
      body: [
        [{ text: 'Subtotal', color: GRAY, fontSize: 9.5 }, { text: money(quote.subtotal), bold: true, color: NAVY, fontSize: 9.5, alignment: 'right' }],
        [
          { text: `IVA ${(quote.taxRate * 100).toFixed(0)}%`, color: GRAY, fontSize: 9.5 },
          { text: money(quote.taxAmount), bold: true, color: NAVY, fontSize: 9.5, alignment: 'right' },
        ],
        [
          { text: label, bold: true, color: 'white', fontSize: 12, fillColor: TEAL },
          { text: money(quote.total), bold: true, color: 'white', fontSize: 12, alignment: 'right', fillColor: TEAL },
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

/** What the price assumes: the volumes it was quoted with and, for Enterprise, the negotiated terms. */
function assumptions(quote: Quote): Content {
  const volume: Array<[string, string]> = [
    ['Casos al mes', quantity(quote.estimatedCases)],
    ['Timbres CFDI al mes', quantity(quote.estimatedCfdiStamps)],
    ['Almacenamiento extra', `${quantity(quote.estimatedStorageExtraGb)} GB`],
  ];
  const t = quote.enterpriseTerms;
  const terms: Array<[string, string]> = t
    ? [
        ['Cuota base', money(t.negotiatedBasePrice)],
        ['Precio por caso', unitMoney(t.negotiatedCaseUnitPrice)],
        ['Precio por timbre', unitMoney(t.negotiatedCfdiStampPrice)],
        ['Almacenamiento incluido', `${quantity(t.storageIncludedGb)} GB`],
        ...(t.storageBlockSizeGb && t.storageBlockPrice ? [['Bloque adicional', `${quantity(t.storageBlockSizeGb)} GB por ${money(t.storageBlockPrice)}`] as [string, string]] : []),
        ['Descuento', pct(t.discountPercent)],
        ['Incremento anual', pct(t.annualIncreasePercent)],
      ]
    : [];
  const modules = [t?.billingIncluded && 'Facturación', t?.inventoryIncluded && 'Inventario', t?.analyticsIncluded && 'Analítica'].filter(Boolean) as string[];
  if (modules.length) terms.push(['Módulos incluidos', modules.join(', ')]);

  const column = (title: string, rows: Array<[string, string]>): Column => ({
    width: '*',
    stack: [
      {
        table: {
          widths: ['*'],
          body: [[{ fillColor: SLATE_LIGHT, stack: [spaced(title), { text: '', margin: [0, 3, 0, 0] }, pairs(rows, 110)] }]],
        },
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 9, paddingBottom: () => 9 },
      },
    ],
  });

  return { columns: terms.length ? [column('Volumen estimado', volume), column('Condiciones negociadas', terms)] : [column('Volumen estimado', volume)], columnGap: 12 };
}

export function buildQuoteDocument(quote: Quote, logo: string | null): TDocumentDefinitions {
  const folio = quoteFolio(quote);
  const cycle = quote.billingCycle === 'Annual' ? 'Anual' : 'Mensual';

  const header: Content = {
    columns: [
      logo
        ? { image: logo, width: 120 }
        : { text: [{ text: ISSUER.brandFirst, color: NAVY }, { text: ISSUER.brandSecond, color: TEAL }], bold: true, fontSize: 22, width: 160 },
      {
        width: '*',
        alignment: 'right',
        stack: [
          { text: 'COTIZACIÓN', fontSize: 20, bold: true, color: NAVY, characterSpacing: 1 },
          { text: folio, fontSize: 10, bold: true, color: TEAL, margin: [0, 2, 0, 6] },
          pairsRight([
            ['Fecha', longDate(quote.createdAt)],
            ['Vigencia', quote.validUntil ? longDate(quote.validUntil) : '30 días'],
            ['Producto', `${ISSUER.product} · Plan ${planLabel(quote.planCode)}`],
            ['Facturación', cycle],
          ]),
        ],
      },
    ],
  };

  const parties: Content = {
    margin: [0, 14, 0, 0],
    columns: [
      box('Proveedor', ISSUER.legalName, [
        ['RFC', ISSUER.rfc],
        ['Domicilio', ISSUER.address],
        ['Contacto', ISSUER.email],
      ], NAVY),
      box(quote.clientId ? 'Cliente' : 'Prospecto', quoteCustomer(quote), [
        ['Plan', quote.planName || planLabel(quote.planCode)],
        ['Ciclo', cycle],
        ['Estado', quoteStatusLabel(quote.status)],
      ], TEAL),
    ],
    columnGap: 14,
  };

  const notes: Content[] = quote.notes?.trim()
    ? [
        {
          margin: [0, 12, 0, 0],
          table: { widths: ['*'], body: [[{ fillColor: TEAL_LIGHT, stack: [spaced('Notas', NAVY), { text: quote.notes.trim(), fontSize: 9, color: NAVY, margin: [0, 4, 0, 0] }] }]] },
          layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 10, paddingRight: () => 10, paddingTop: () => 9, paddingBottom: () => 9 },
        },
      ]
    : [];

  // Beside the totals, where the page is otherwise empty.
  const conditions: Content = {
    margin: [0, 2, 16, 0],
    stack: [
      spaced('Condiciones comerciales', NAVY),
      {
        margin: [0, 5, 0, 0],
        ul: [
          'Precios en pesos mexicanos (MXN); el IVA se desglosa por separado.',
          `Facturación ${cycle.toLowerCase()} con ${ISSUER.invoicing}.`,
          'Los cargos por casos, timbres y almacenamiento se calculan con el uso real de cada periodo; los volúmenes de esta cotización son estimados.',
          quote.validUntil ? `Precios válidos hasta el ${longDate(quote.validUntil)}.` : 'Precios válidos por 30 días a partir de la fecha de emisión.',
          'Este documento es una propuesta comercial y no es un comprobante fiscal.',
        ],
        fontSize: 7.5,
        color: GRAY,
      },
    ],
  };

  return {
    pageSize: 'LETTER',
    pageMargins: [40, 40, 40, 50],
    info: { title: `Cotización ${folio} — ${quoteCustomer(quote)}`, author: ISSUER.legalName },
    defaultStyle: { fontSize: 9, color: NAVY },
    watermark: quote.status === 'Draft' ? { text: 'BORRADOR', color: NAVY, opacity: 0.06, bold: true } : undefined,
    footer: (currentPage: number, pageCount: number): Content => ({
      margin: [40, 14, 40, 0],
      columns: [
        { text: [{ text: ISSUER.legalName, bold: true, color: NAVY }, { text: ` · ${ISSUER.website} · ${ISSUER.email}`, color: GRAY }], fontSize: 7.5 },
        { text: `Página ${currentPage} de ${pageCount} · ${folio}`, fontSize: 7.5, color: GRAY, alignment: 'right' },
      ],
    }),
    content: [
      header,
      parties,
      { margin: [0, 16, 0, 0], stack: [conceptsTable(quote)] },
      { margin: [0, 10, 0, 0], columns: [{ width: '*', stack: [conditions] }, { width: 230, stack: [totals(quote)] }] },
      { margin: [0, 14, 0, 0], stack: [assumptions(quote)] },
      ...notes,
    ],
  };
}

function pairsRight(rows: Array<[string, string]>): Content {
  return {
    table: {
      widths: ['*', 'auto'],
      body: rows.map(([label, value]) => [
        { text: label, color: GRAY, fontSize: 8.5, alignment: 'right' },
        { text: value, bold: true, color: NAVY, fontSize: 8.5, alignment: 'right' },
      ]),
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 6, paddingRight: () => 0, paddingTop: () => 1, paddingBottom: () => 1 },
  };
}

/** Cotizacion_Capay_COT-XXXX.pdf */
export function quoteFileName(quote: Quote): string {
  const customer = quoteCustomer(quote).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '') || 'Cliente';
  return `Cotizacion_${customer}_${quoteFolio(quote)}.pdf`;
}

/** Resolves once the PDF exists; pdfmake reports the end only through getBlob's callback. */
async function quoteBlob(quote: Quote): Promise<Blob> {
  const [pdfMake, logo] = await Promise.all([loadPdfMake(), loadIssuerLogo()]);
  return new Promise<Blob>((resolve, reject) => {
    setTimeout(() => reject(new Error('PDF generation timed out')), 60_000);
    try {
      pdfMake.createPdf(buildQuoteDocument(quote, logo)).getBlob(resolve);
    } catch (error) {
      reject(error);
    }
  });
}

export async function downloadQuotePdf(quote: Quote): Promise<void> {
  const url = URL.createObjectURL(await quoteBlob(quote));
  const link = document.createElement('a');
  link.href = url;
  link.download = quoteFileName(quote);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Opens the PDF in a new tab to look at, print or forward. */
export async function openQuotePdf(quote: Quote): Promise<void> {
  // Opened before the await so the browser does not treat it as a popup.
  const tab = window.open('', '_blank');
  try {
    const url = URL.createObjectURL(await quoteBlob(quote));
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}
