import { Component, NgZone, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '@nori/core';
import { BillingOverview } from '../../billing-overview/billing-overview.service';
import { Period, periodLabel } from '../../billing-overview/billing-metrics';
import { Modal } from '../../shared/components/modal/modal';
import { formatMXN } from '../../shared/utils/format.util';
import { ExpenseLine, PartnerReportInputs, buildPartnerReport, emptyInputs } from './partner-report-data';
import { downloadPartnerReport } from './partner-report-pdf';

const DRAFT_KEY = 'nori-admin.partner-report.';

/** Costs and comments are typed per period and kept in this browser, so a report can be redone without retyping. */
function readDraft(period: Period): PartnerReportInputs {
  try {
    const saved = localStorage.getItem(DRAFT_KEY + period);
    if (saved) return { ...emptyInputs(), ...JSON.parse(saved) };
  } catch {
    // Storage blocked or a broken draft: start empty.
  }
  return emptyInputs();
}

function writeDraft(period: Period, inputs: PartnerReportInputs): void {
  try {
    localStorage.setItem(DRAFT_KEY + period, JSON.stringify(inputs));
  } catch {
    // Not saving the draft does not stop the report.
  }
}

/**
 * Asks what the system does not know (costs, cash, the direction's comments) and downloads the partners' report:
 * executive summary, income statement, monthly detail, clients and collections.
 */
@Component({
  selector: 'app-partner-report-dialog',
  standalone: true,
  imports: [FormsModule, Modal],
  templateUrl: './partner-report-dialog.html',
})
export class PartnerReportDialog implements OnInit {
  private readonly notificationService = inject(NotificationService);
  /** pdfmake finishes in its own callbacks; the result is brought back into Angular so the dialog updates. */
  private readonly zone = inject(NgZone);

  readonly overview = input.required<BillingOverview>();
  readonly years = input.required<number[]>();
  readonly initialPeriod = input<Period>('last12');
  readonly closed = output<void>();

  readonly formatMXN = formatMXN;
  readonly periodLabel = periodLabel;

  readonly period = signal<Period>('last12');
  readonly isGenerating = signal(false);
  inputs: PartnerReportInputs = emptyInputs();

  /** Ingresos of the chosen period, to show next to the costs being typed. */
  readonly preview = computed(() => buildPartnerReport(this.overview(), this.period(), emptyInputs()));

  ngOnInit(): void {
    this.selectPeriod(this.initialPeriod());
  }

  selectPeriod(value: Period | string): void {
    const period: Period = value === 'last12' ? 'last12' : Number(value);
    this.period.set(period);
    this.inputs = readDraft(period);
  }

  addLine(lines: ExpenseLine[]): void {
    lines.push({ label: '', amount: null });
  }

  removeLine(lines: ExpenseLine[], index: number): void {
    lines.splice(index, 1);
  }

  total(lines: ExpenseLine[]): number {
    return lines.reduce((a, l) => a + (Number(l.amount) || 0), 0);
  }

  async generate(): Promise<void> {
    if (this.isGenerating()) return;
    writeDraft(this.period(), this.inputs);
    this.isGenerating.set(true);
    // Building the PDF blocks the page for a moment; let "Generando…" paint first.
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await downloadPartnerReport(buildPartnerReport(this.overview(), this.period(), this.inputs));
      this.zone.run(() => {
        this.isGenerating.set(false);
        this.notificationService.success('Reporte descargado.', 'Listo');
        this.closed.emit();
      });
    } catch (error) {
      console.error('Partner report PDF failed', error);
      this.zone.run(() => {
        this.isGenerating.set(false);
        this.notificationService.error('No se pudo generar el PDF.');
      });
    }
  }
}
