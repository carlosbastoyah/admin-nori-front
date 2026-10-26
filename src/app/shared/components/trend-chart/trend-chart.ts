import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';

export interface TrendPoint {
  label: string;
  value: number;
  /** Second line of the tooltip. */
  hint?: string;
}

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 52 };
const TICKS = 4;

/** Rounds the top of the axis up to 1, 2, 2.5 or 5 times a power of ten, so the grid lines read cleanly. */
function niceMax(value: number): number {
  if (value <= 0) return 1;
  const raw = value / TICKS;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= raw)! * power;
  return step * TICKS;
}

/**
 * One series over time as bars or a line, drawn in SVG at the width of its box, with a tooltip on hover.
 * Single series by design: the card's title names it, so there is no legend.
 */
@Component({
  selector: 'app-trend-chart',
  standalone: true,
  host: { class: 'block' },
  template: `
    <div class="relative w-full" [style.height.px]="height" (mouseleave)="hover.set(null)">
      @if (width() > 0) {
        <svg [attr.width]="width()" [attr.height]="height" class="block" role="img" [attr.aria-label]="ariaLabel()">
          @for (tick of ticks(); track tick.value) {
            <line [attr.x1]="pad.left" [attr.x2]="width() - pad.right" [attr.y1]="tick.y" [attr.y2]="tick.y" stroke="var(--border-s)" stroke-width="1" />
            <text [attr.x]="pad.left - 8" [attr.y]="tick.y" text-anchor="end" dominant-baseline="middle" fill="var(--t3)" font-size="11">{{ tick.label }}</text>
          }

          @if (kind() === 'bar') {
            @for (bar of bars(); track $index) {
              <path [attr.d]="bar.path" [attr.fill]="hover() === $index ? 'var(--teal-700)' : 'var(--teal-500)'" />
            }
          } @else {
            <path [attr.d]="areaPath()" fill="var(--teal-500)" fill-opacity="0.12" />
            <path [attr.d]="linePath()" fill="none" stroke="var(--teal-600)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
            @if (hover() !== null) {
              <line [attr.x1]="xAt(hover()!)" [attr.x2]="xAt(hover()!)" [attr.y1]="pad.top" [attr.y2]="height - pad.bottom" stroke="var(--border-m)" stroke-dasharray="3 3" />
              <circle [attr.cx]="xAt(hover()!)" [attr.cy]="yAt(points()[hover()!].value)" r="5" fill="var(--teal-600)" stroke="white" stroke-width="2" />
            }
          }

          @for (point of points(); track $index) {
            @if (showLabel($index)) {
              <text [attr.x]="xAt($index)" [attr.y]="height - 8" text-anchor="middle" fill="var(--t3)" font-size="11">{{ point.label }}</text>
            }
            <!-- Hit area: the whole column, wider than the mark. -->
            <rect [attr.x]="xAt($index) - slot() / 2" [attr.y]="pad.top" [attr.width]="slot()" [attr.height]="plotHeight" fill="transparent" (mouseenter)="hover.set($index)" />
          }
        </svg>

        @if (hover() !== null) {
          <div
            class="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-navy-900 px-3 py-2 text-xs text-white shadow-e3"
            [style.left.px]="tooltipLeft()"
            [style.top.px]="0"
          >
            <p class="font-semibold">{{ points()[hover()!].label }}</p>
            <p class="mt-0.5 text-sm font-bold">{{ format()(points()[hover()!].value) }}</p>
            @if (points()[hover()!].hint) {
              <p class="mt-0.5 text-white/70">{{ points()[hover()!].hint }}</p>
            }
          </div>
        }
      }
    </div>
  `,
})
export class TrendChart {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly points = input.required<TrendPoint[]>();
  readonly kind = input<'bar' | 'line'>('bar');
  /** Full value in the tooltip. */
  readonly format = input<(value: number) => string>((v) => v.toLocaleString('es-MX'));
  /** Short value on the axis. */
  readonly axisFormat = input<(value: number) => string>((v) => v.toLocaleString('es-MX'));
  readonly ariaLabel = input('Gráfica');

  readonly height = HEIGHT;
  readonly pad = PAD;
  readonly plotHeight = HEIGHT - PAD.top - PAD.bottom;

  readonly width = signal(0);
  readonly hover = signal<number | null>(null);

  readonly max = computed(() => niceMax(Math.max(0, ...this.points().map((p) => p.value))));
  readonly slot = computed(() => (this.width() - PAD.left - PAD.right) / Math.max(1, this.points().length));

  readonly ticks = computed(() =>
    Array.from({ length: TICKS + 1 }, (_, i) => {
      const value = (this.max() / TICKS) * i;
      return { value, y: this.yAt(value), label: this.axisFormat()(value) };
    }),
  );

  readonly bars = computed(() => {
    const barWidth = Math.min(36, Math.max(4, this.slot() * 0.6));
    const base = HEIGHT - PAD.bottom;
    return this.points().map((p, i) => {
      const x = this.xAt(i) - barWidth / 2;
      const top = this.yAt(p.value);
      const h = base - top;
      if (h <= 0) return { path: '' };
      // Rounded top corners only; the bar sits flat on the baseline.
      const r = Math.min(4, h, barWidth / 2);
      return {
        path: `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barWidth - r} Q${x + barWidth},${top} ${x + barWidth},${top + r} V${base} Z`,
      };
    });
  });

  readonly linePath = computed(() => this.points().map((p, i) => `${i ? 'L' : 'M'}${this.xAt(i)},${this.yAt(p.value)}`).join(' '));
  readonly areaPath = computed(() => {
    const n = this.points().length;
    if (!n) return '';
    const base = HEIGHT - PAD.bottom;
    return `${this.linePath()} L${this.xAt(n - 1)},${base} L${this.xAt(0)},${base} Z`;
  });

  readonly tooltipLeft = computed(() => {
    const index = this.hover();
    if (index === null) return 0;
    // Kept inside the box so the first and last months do not overflow it.
    return Math.min(this.width() - 70, Math.max(70, this.xAt(index)));
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.host.nativeElement;
      const observer = new ResizeObserver(() => this.width.set(element.clientWidth));
      observer.observe(element);
      this.width.set(element.clientWidth);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  xAt(index: number): number {
    return PAD.left + this.slot() * (index + 0.5);
  }

  yAt(value: number): number {
    return PAD.top + this.plotHeight * (1 - value / this.max());
  }

  /** Every label when they fit, otherwise every other one (always the last). */
  showLabel(index: number): boolean {
    const n = this.points().length;
    if (this.slot() >= 44) return true;
    return (n - 1 - index) % 2 === 0;
  }
}
