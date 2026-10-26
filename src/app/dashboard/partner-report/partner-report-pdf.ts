import type { Content, TableCell, TDocumentDefinitions } from 'pdfmake/interfaces';
import { loadIssuerLogo, loadPdfMake } from '../../clients/prefactura/prefactura-pdf';
import { PREFACTURA_ISSUER as ISSUER } from '../../clients/prefactura/prefactura-issuer';
import { AmountRow, PartnerReport } from './partner-report-data';

const NAVY = '#14335F';
const TEAL = '#21B6AF';
const TEAL_LIGHT = '#E6F6F5';
const SLATE_LIGHT = '#F6F8FB';
const GRAY = '#5B6B7B';
const LINE = '#E3E8EF';
const RED = '#C2410C';
const GREEN = '#15803D';
const PAGE_WIDTH = 532;

function money(value: number, decimals = 2): string {
  const text = Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${value < 0 ? '−' : ''}$${text}`;
}

function percent(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function delta(value: number | null, against: string): { text: string; color: string } {
  if (value == null) return { text: `Sin datos de ${against} para comparar`, color: GRAY };
  return { text: `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(0)}% vs ${against}`, color: value >= 0 ? GREEN : RED };
}

function heading(text: string, subtitle?: string): Content {
  return {
    margin: [0, 18, 0, 8],
    stack: [
      { text, fontSize: 13, bold: true, color: NAVY },
      ...(subtitle ? [{ text: subtitle, fontSize: 8.5, color: GRAY, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
      { canvas: [{ type: 'line', x1: 0, y1: 4, x2: PAGE_WIDTH, y2: 4, lineWidth: 1.5, lineColor: TEAL }] },
    ],
  };
}

function tile(label: string, value: string, note: { text: string; color: string }): Content {
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            fillColor: SLATE_LIGHT,
            margin: [10, 9, 10, 9],
            stack: [
              { text: label.toUpperCase(), fontSize: 7, bold: true, color: GRAY, characterSpacing: 0.4 },
              { text: value, fontSize: 15, bold: true, color: NAVY, margin: [0, 4, 0, 2] },
              { text: note.text, fontSize: 7.5, color: note.color },
            ],
          },
        ],
      ],
    },
    layout: 'noBorders',
  };
}

const tableLayout = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => LINE,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  paddingLeft: () => 6,
  paddingRight: () => 6,
};

function th(text: string, alignment: 'left' | 'right' = 'left'): TableCell {
  return { text, bold: true, fontSize: 7.5, color: GRAY, alignment, fillColor: SLATE_LIGHT };
}

/** Bars of the monthly revenue, with the month and amount under each one; print has no hover, so the numbers stay. */
function revenueChart(report: PartnerReport): Content {
  const height = 130;
  const n = report.months.length || 1;
  const slot = PAGE_WIDTH / n;
  const max = Math.max(1, ...report.months.map((m) => m.revenue));
  const barWidth = Math.min(28, slot * 0.6);
  const grid = [0.25, 0.5, 0.75, 1].map((f) => ({
    type: 'line' as const,
    x1: 0,
    y1: height - height * f,
    x2: PAGE_WIDTH,
    y2: height - height * f,
    lineWidth: 0.5,
    lineColor: LINE,
  }));
  const bars = report.months.map((m, i) => {
    const h = ((Number(m.revenue) || 0) / max) * (height - 6);
    return { type: 'rect' as const, x: slot * i + (slot - barWidth) / 2, y: height - h, w: barWidth, h: Math.max(h, 0.01), r: 2, color: TEAL };
  });
  return {
    stack: [
      { canvas: [...grid, ...bars, { type: 'line', x1: 0, y1: height, x2: PAGE_WIDTH, y2: height, lineWidth: 1, lineColor: GRAY }] },
      {
        columns: report.months.map((m) => ({
          width: slot,
          stack: [
            { text: m.label, fontSize: 7, color: GRAY, alignment: 'center', margin: [0, 3, 0, 0] },
            { text: money(m.revenue, 0), fontSize: 6.5, color: NAVY, alignment: 'center' },
          ],
        })),
        columnGap: 0,
      },
    ],
  };
}

function bullets(report: PartnerReport): string[] {
  const out: string[] = [];
  const rev = report.revenueChange;
  out.push(
    rev == null
      ? `Ingresos netos de ${money(report.netRevenue)} (sin IVA) en el periodo.`
      : `Ingresos netos de ${money(report.netRevenue)} (sin IVA), ${rev >= 0 ? 'un crecimiento' : 'una caída'} de ${Math.abs(rev).toFixed(0)}% contra el periodo anterior.`,
  );
  if (report.mrr) out.push(`Ingreso recurrente mensual (MRR) de ${money(report.mrr)} en ${report.mrrMonth}; a ese ritmo, ${money(report.arr, 0)} al año (ARR).`);
  out.push(
    `Se sumaron ${report.newClients} cliente(s) en el periodo (${report.previousNewClients} en el periodo anterior); hoy hay ${report.status.active} suscripciones activas y ${report.status.trial} en prueba.`,
  );
  if (report.outstanding > 0) {
    const share = (report.overdue / report.outstanding) * 100;
    out.push(`Por cobrar: ${money(report.outstanding)}, de los cuales ${money(report.overdue)} (${share.toFixed(0)}%) ya está vencido.`);
  }
  if (report.top.length >= 2 && report.topShare > 0) {
    out.push(`Los ${report.top.length} principales clientes concentran el ${report.topShare.toFixed(0)}% de lo cobrado${report.topShare >= 60 ? ': riesgo de concentración alto' : ''}.`);
  }
  if (report.hasExpenses) {
    const margin = report.netRevenue ? (report.operatingIncome / report.netRevenue) * 100 : null;
    out.push(`${report.operatingIncome >= 0 ? 'Utilidad' : 'Pérdida'} de operación de ${money(Math.abs(report.operatingIncome))}${margin == null ? '' : ` (margen ${margin.toFixed(0)}%)`}.`);
  }
  if (report.runwayMonths != null) out.push(`Con la caja actual y el gasto neto promedio, el runway es de ${report.runwayMonths.toFixed(1)} meses.`);
  return out;
}

function statement(report: PartnerReport): Content {
  const pct = (amount: number) => (report.netRevenue ? percent((amount / report.netRevenue) * 100, 1) : '—');
  /** Lines are indented under their subtotal; subtotals and totals are shaded. */
  const row = (label: string, amount: number, style: 'line' | 'subtotal' | 'total' = 'line'): TableCell[] => {
    const bold = style !== 'line';
    const fillColor = style === 'total' ? TEAL_LIGHT : style === 'subtotal' ? SLATE_LIGHT : undefined;
    return [
      { text: label, bold, fontSize: bold ? 9 : 8.5, margin: [bold ? 0 : 10, 0, 0, 0], fillColor, color: NAVY },
      { text: money(amount), bold, alignment: 'right', fontSize: 9, fillColor, color: amount < 0 ? RED : NAVY },
      { text: pct(amount), alignment: 'right', fontSize: 8, fillColor, color: GRAY },
    ];
  };
  const body: TableCell[][] = [[th('Concepto'), th('Importe', 'right'), th('% de ingresos', 'right')]];
  report.revenueLines.forEach((l: AmountRow) => body.push(row(l.label, l.amount)));
  if (report.discounts) {
    body.push(row('Ingresos brutos', report.grossRevenue, 'subtotal'));
    body.push(row('Descuentos negociados', report.discounts));
  }
  body.push(row('Ingresos netos', report.netRevenue, 'total'));

  if (report.hasExpenses) {
    report.costOfService.forEach((l) => body.push(row(l.label, -l.amount)));
    body.push(row('Utilidad bruta', report.grossProfit, 'subtotal'));
    report.operatingExpenses.forEach((l) => body.push(row(l.label, -l.amount)));
    body.push(row(report.operatingIncome >= 0 ? 'Utilidad de operación (EBITDA aprox.)' : 'Pérdida de operación (EBITDA aprox.)', report.operatingIncome, 'total'));
  }

  return {
    stack: [
      { table: { widths: ['*', 110, 70], body, headerRows: 1 }, layout: tableLayout },
      ...(report.hasExpenses
        ? []
        : [
            {
              text: 'Costos y gastos no capturados: el estado muestra solo ingresos. Captúralos al generar el reporte para ver utilidad bruta y de operación.',
              fontSize: 7.5,
              italics: true,
              color: GRAY,
              margin: [0, 6, 0, 0] as [number, number, number, number],
            },
          ]),
    ],
  };
}

function monthsTable(report: PartnerReport): Content {
  const body: TableCell[][] = [
    [th('Mes'), th('Ingresos (sin IVA)', 'right'), th('IVA', 'right'), th('Cobrado', 'right'), th('Clientes nuevos', 'right'), th('Clientes al cierre', 'right')],
  ];
  for (const m of report.months) {
    body.push([
      { text: m.label, fontSize: 8.5 },
      { text: money(m.revenue), alignment: 'right', fontSize: 8.5 },
      { text: money(m.tax), alignment: 'right', fontSize: 8.5, color: GRAY },
      { text: money(m.collected), alignment: 'right', fontSize: 8.5 },
      { text: String(m.newClients), alignment: 'right', fontSize: 8.5 },
      { text: String(m.totalClients), alignment: 'right', fontSize: 8.5 },
    ]);
  }
  const totals = report.months.reduce((a, m) => ({ revenue: a.revenue + m.revenue, tax: a.tax + m.tax, collected: a.collected + m.collected, added: a.added + m.newClients }), {
    revenue: 0,
    tax: 0,
    collected: 0,
    added: 0,
  });
  body.push([
    { text: 'Total', bold: true, fontSize: 8.5, fillColor: TEAL_LIGHT },
    { text: money(totals.revenue), bold: true, alignment: 'right', fontSize: 8.5, fillColor: TEAL_LIGHT },
    { text: money(totals.tax), bold: true, alignment: 'right', fontSize: 8.5, fillColor: TEAL_LIGHT },
    { text: money(totals.collected), bold: true, alignment: 'right', fontSize: 8.5, fillColor: TEAL_LIGHT },
    { text: String(totals.added), bold: true, alignment: 'right', fontSize: 8.5, fillColor: TEAL_LIGHT },
    { text: String(report.months.at(-1)?.totalClients ?? 0), bold: true, alignment: 'right', fontSize: 8.5, fillColor: TEAL_LIGHT },
  ]);
  return { table: { widths: ['*', 90, 70, 90, 60, 60], body, headerRows: 1 }, layout: tableLayout };
}

function keyValue(rows: [string, string][]): Content {
  return {
    table: { widths: ['*', 'auto'], body: rows.map(([k, v]) => [{ text: k, fontSize: 8.5, color: GRAY }, { text: v, fontSize: 9, bold: true, alignment: 'right', color: NAVY }]) },
    layout: tableLayout,
  };
}

function clientsSection(report: PartnerReport): Content {
  const topBody: TableCell[][] = [[th('Cliente'), th('Cobrado', 'right'), th('% del total', 'right')]];
  report.top.forEach((c) => topBody.push([{ text: c.name, fontSize: 8.5 }, { text: money(c.amount), alignment: 'right', fontSize: 8.5 }, { text: percent(c.share, 1), alignment: 'right', fontSize: 8.5 }]));
  if (!report.top.length) topBody.push([{ text: 'Sin pagos en el periodo.', colSpan: 3, fontSize: 8.5, color: GRAY }, {}, {}]);

  return {
    columns: [
      {
        width: '*',
        stack: [
          { text: 'Base de clientes (hoy)', bold: true, fontSize: 9.5, color: NAVY, margin: [0, 0, 0, 4] },
          keyValue([
            ['Clientes registrados', String(report.totalClients)],
            ['Al inicio del periodo', String(report.clientsAtStart)],
            ['Nuevos en el periodo', `${report.newClients}  (${report.clientGrowth == null ? '—' : (report.clientGrowth >= 0 ? '+' : '') + report.clientGrowth.toFixed(0) + '%'})`],
            ['Suscripciones activas', String(report.status.active)],
            ['En prueba', String(report.status.trial)],
            ['Suspendidas', String(report.status.suspended)],
            ['Canceladas', String(report.status.cancelled)],
            ['Conversión de prueba a pago', percent(report.conversion)],
            ['Ingreso promedio por cliente (ARPA)', report.arpa == null ? '—' : money(report.arpa)],
            ...report.plans.map((p) => [`Plan ${p.label}`, String(p.count)] as [string, string]),
          ]),
        ],
      },
      {
        width: '*',
        stack: [
          { text: 'Principales clientes (cobrado en el periodo)', bold: true, fontSize: 9.5, color: NAVY, margin: [0, 0, 0, 4] },
          { table: { widths: ['*', 75, 50], body: topBody, headerRows: 1 }, layout: tableLayout },
        ],
      },
    ],
    columnGap: 20,
  };
}

function collectionsSection(report: PartnerReport): Content {
  const agingBody: TableCell[][] = [[th('Antigüedad'), th('Prefacturas', 'right'), th('Importe', 'right')]];
  report.aging.forEach((a, i) =>
    agingBody.push([
      { text: a.label, fontSize: 8.5, color: i >= 2 && a.amount ? RED : NAVY },
      { text: String(a.count), alignment: 'right', fontSize: 8.5 },
      { text: money(a.amount), alignment: 'right', fontSize: 8.5, color: i >= 2 && a.amount ? RED : NAVY },
    ]),
  );
  const overdueBody: TableCell[][] = [[th('Cliente con adeudo vencido'), th('Días', 'right'), th('Importe', 'right')]];
  report.overdueClients.forEach((c) => overdueBody.push([{ text: c.name, fontSize: 8.5 }, { text: String(c.days), alignment: 'right', fontSize: 8.5 }, { text: money(c.amount), alignment: 'right', fontSize: 8.5 }]));
  if (!report.overdueClients.length) overdueBody.push([{ text: 'Ningún cliente con adeudo vencido.', colSpan: 3, fontSize: 8.5, color: GRAY }, {}, {}]);

  return {
    stack: [
      {
        columns: [
          { width: '*', stack: [{ table: { widths: ['*', 60, 80], body: agingBody, headerRows: 1 }, layout: tableLayout }] },
          {
            width: 200,
            stack: [
              keyValue([
                ['Por cobrar (con IVA)', money(report.outstanding)],
                ['Vencido', money(report.overdue)],
                ['Pagos a tiempo', percent(report.onTime)],
                ['Días promedio de cobro', report.daysToCollect == null ? '—' : report.daysToCollect.toFixed(1)],
              ]),
            ],
          },
        ],
        columnGap: 20,
      },
      { margin: [0, 10, 0, 0], table: { widths: ['*', 50, 90], body: overdueBody, headerRows: 1 }, layout: tableLayout },
    ],
  };
}

function commentary(report: PartnerReport): Content[] {
  const blocks: [string, string][] = [
    ['Logros del periodo', report.inputs.highlights],
    ['Retos y riesgos', report.inputs.challenges],
    ['Próximos pasos y prioridades', report.inputs.nextSteps],
  ];
  const filled = blocks.filter(([, text]) => text.trim());
  if (!filled.length) return [];
  return [
    heading('Comentarios de la dirección'),
    ...filled.map(
      ([title, text]): Content => ({
        margin: [0, 0, 0, 10],
        stack: [
          { text: title, bold: true, fontSize: 9.5, color: NAVY, margin: [0, 0, 0, 3] },
          { ul: text.split('\n').map((l) => l.replace(/^\s*[-•*]\s*/, '').trim()).filter(Boolean), fontSize: 9, color: '#1F2937' },
        ],
      }),
    ),
  ];
}

export function buildPartnerReportDocument(report: PartnerReport, logo: string | null): TDocumentDefinitions {
  const generated = report.generatedAt.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const operating = report.hasExpenses
    ? tile(report.operatingIncome >= 0 ? 'Utilidad de operación' : 'Pérdida de operación', money(report.operatingIncome, 0), {
        text: report.netRevenue ? `Margen ${percent((report.operatingIncome / report.netRevenue) * 100)}` : '—',
        color: report.operatingIncome >= 0 ? GREEN : RED,
      })
    : tile('Ingreso promedio por cliente', report.arpa == null ? '—' : money(report.arpa, 0), { text: 'MRR / clientes facturados', color: GRAY });

  const header: Content = {
    columns: [
      logo ? { image: logo, width: 46 } : { text: '', width: 0 },
      {
        width: '*',
        margin: [logo ? 10 : 0, 2, 0, 0],
        stack: [
          { text: 'Reporte para socios', fontSize: 20, bold: true, color: NAVY },
          { text: `${ISSUER.product} · ${ISSUER.legalName}`, fontSize: 9, color: GRAY, margin: [0, 2, 0, 0] },
        ],
      },
      {
        width: 'auto',
        alignment: 'right',
        stack: [
          { text: 'PERIODO', fontSize: 7, bold: true, color: GRAY },
          { text: report.periodLabel, fontSize: 12, bold: true, color: TEAL },
          { text: `Emitido el ${generated}`, fontSize: 7.5, color: GRAY, margin: [0, 3, 0, 0] },
        ],
      },
    ],
  };

  return {
    pageSize: 'LETTER',
    pageMargins: [40, 40, 40, 46],
    info: { title: `Reporte para socios — ${report.periodLabel}`, author: ISSUER.legalName },
    defaultStyle: { fontSize: 9, color: '#1F2937' },
    footer: (currentPage: number, pageCount: number): Content => ({
      margin: [40, 12, 40, 0],
      columns: [
        { text: `Confidencial · Solo para socios de ${ISSUER.legalName}`, fontSize: 7, color: GRAY },
        { text: `Página ${currentPage} de ${pageCount}`, fontSize: 7, color: GRAY, alignment: 'right' },
      ],
    }),
    content: [
      header,
      heading('Resumen ejecutivo'),
      {
        columns: [
          tile('Ingresos netos (sin IVA)', money(report.netRevenue, 0), delta(report.revenueChange, 'periodo anterior')),
          tile('Cobrado (con IVA)', money(report.collected, 0), delta(report.collectedChange, 'periodo anterior')),
          tile('MRR', money(report.mrr, 0), { text: `ARR ${money(report.arr, 0)}${report.mrrMonth ? ' · ' + report.mrrMonth : ''}`, color: GRAY }),
        ],
        columnGap: 8,
      },
      {
        margin: [0, 8, 0, 0],
        columns: [
          tile('Clientes', String(report.totalClients), { text: `+${report.newClients} en el periodo · ${report.status.active} activos`, color: GRAY }),
          tile('Por cobrar', money(report.outstanding, 0), { text: report.overdue ? `${money(report.overdue, 0)} vencido` : 'Nada vencido', color: report.overdue ? RED : GREEN }),
          operating,
        ],
        columnGap: 8,
      },
      { text: 'Lo más importante', bold: true, fontSize: 9.5, color: NAVY, margin: [0, 14, 0, 4] },
      { ul: bullets(report), fontSize: 9, lineHeight: 1.25 },

      heading('Ingresos por mes', 'Prefacturas emitidas o pagadas, sin IVA, por el mes de servicio que cobran.'),
      revenueChart(report),

      { text: '', pageBreak: 'before' },
      heading('Estado de resultados', `Base devengada: ingresos por mes de servicio, sin IVA. ${report.periodLabel}.`),
      statement(report),

      heading('Detalle mensual'),
      monthsTable(report),

      heading('Clientes'),
      clientsSection(report),

      heading('Cartera y cobranza', 'Situación a la fecha de emisión; los indicadores de cobro miden los pagos del periodo.'),
      collectionsSection(report),

      ...commentary(report),

      heading('Notas'),
      {
        ul: [
          'Ingresos netos: subtotal (sin IVA) de las prefacturas emitidas o pagadas, asignado al mes de servicio que cobran. Borradores y canceladas no cuentan.',
          'Cobrado: total con IVA de las prefacturas pagadas, por la fecha del pago (flujo de efectivo).',
          'MRR: ingresos netos del último mes del periodo con facturación. ARR = MRR × 12.',
          'Costos y gastos: capturados manualmente al generar el reporte; no provienen del sistema.',
          'Runway: caja disponible entre la pérdida de operación promedio mensual del periodo.',
          'Cifras preliminares de gestión, no auditadas. No sustituyen los estados financieros contables.',
        ],
        fontSize: 7.5,
        color: GRAY,
      },
    ],
  };
}

function fileName(report: PartnerReport): string {
  return `Reporte_Socios_${report.periodLabel.replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
}

/**
 * Resolves once the file is saved. pdfmake's download() returns before the PDF exists and reports neither the end
 * nor a failure, so this waits on getBlob's callback and saves the file itself.
 */
export async function downloadPartnerReport(report: PartnerReport): Promise<void> {
  const [pdfMake, logo] = await Promise.all([loadPdfMake(), loadIssuerLogo()]);
  const blob = await new Promise<Blob>((resolve, reject) => {
    // A failure inside pdfmake's callbacks never calls back; give up rather than wait forever.
    setTimeout(() => reject(new Error('PDF generation timed out')), 60_000);
    try {
      pdfMake.createPdf(buildPartnerReportDocument(report, logo)).getBlob(resolve);
    } catch (error) {
      reject(error);
    }
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(report);
  link.click();
  // Revoked later: Safari cancels the download if the URL goes away in the same task.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
