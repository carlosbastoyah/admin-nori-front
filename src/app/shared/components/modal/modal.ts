import { Component, DOCUMENT, ElementRef, OnDestroy, OnInit, inject, input, output } from '@angular/core';

/**
 * Centered dialog over a dimmed page; Escape or the backdrop close it unless `busy`.
 * It moves itself to <body>: inside the layout's scrolling <main>, the wheel over the backdrop scrolled the page
 * behind it and the header could end up on top.
 */
@Component({
  selector: 'app-modal',
  standalone: true,
  host: { '(document:keydown.escape)': 'dismiss()' },
  template: `
    <div class="fixed inset-0 z-[1000] flex overscroll-contain items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" (click)="dismiss()">
      <div
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (click)="$event.stopPropagation()"
        class="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-e3 sm:rounded-2xl"
        [class]="widthClass[size()]"
      >
        <header class="flex items-start justify-between gap-4 border-b border-border-s px-6 py-4">
          <div>
            <h2 class="font-heading text-lg font-semibold text-type-1">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="mt-0.5 text-sm text-type-3">{{ subtitle() }}</p>
            }
          </div>
          <button type="button" (click)="dismiss()" [disabled]="busy()" class="-mr-2 rounded-lg p-2 text-type-3 hover:bg-surface-bg hover:text-type-1" aria-label="Cerrar">
            <svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>
        <div class="flex-1 overflow-y-auto overscroll-contain px-6 py-5"><ng-content /></div>
        <footer class="flex flex-wrap items-center justify-end gap-3 border-t border-border-s bg-surface-bg px-6 py-4">
          <ng-content select="[modal-footer]" />
        </footer>
      </div>
    </div>
  `,
})
export class Modal implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);

  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly busy = input(false);
  readonly closed = output<void>();

  protected readonly widthClass = { sm: 'sm:max-w-md', md: 'sm:max-w-2xl', lg: 'sm:max-w-5xl' } as const;

  /** Dialogs open right now; the page stays locked until the last one closes. */
  private static openCount = 0;

  ngOnInit(): void {
    this.document.body.appendChild(this.host.nativeElement);
    if (Modal.openCount++ === 0) this.document.body.classList.add('overflow-hidden');
  }

  ngOnDestroy(): void {
    // Angular only removes the host itself when it is a root node of the view being destroyed. A modal at the root of
    // another component's template (a dialog component) would stay behind in <body>, so it removes itself.
    this.host.nativeElement.remove();
    if (--Modal.openCount === 0) this.document.body.classList.remove('overflow-hidden');
  }

  dismiss(): void {
    if (!this.busy()) this.closed.emit();
  }
}
