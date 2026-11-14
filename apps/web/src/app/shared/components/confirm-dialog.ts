import { Component, ElementRef, Injectable, effect, inject, signal, viewChild } from '@angular/core';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmText?: string;
  readonly cancelText?: string;
  /** Red confirm button for destructive actions. */
  readonly danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  readonly resolve: (confirmed: boolean) => void;
}

/** `if (await confirm.ask({...})) { … }` — rendered by <bd-confirm-dialog-host>. */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly current = signal<PendingConfirm | null>(null);
  readonly pending = this.current.asReadonly();

  ask(options: ConfirmOptions): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise((resolve) => this.current.set({ ...options, resolve }));
  }

  answer(confirmed: boolean): void {
    this.current()?.resolve(confirmed);
    this.current.set(null);
  }
}

@Component({
  selector: 'bd-confirm-dialog-host',
  template: `
    @if (dialog.pending(); as p) {
      <div class="fixed inset-0 z-[55] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center" tabindex="-1"
           (click)="dialog.answer(false)" (keydown.escape)="dialog.answer(false)">
        <div class="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" role="alertdialog" aria-modal="true"
             aria-labelledby="bd-confirm-title" aria-describedby="bd-confirm-msg"
             (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation(); onKey($event)">
          <h2 id="bd-confirm-title" class="text-lg font-semibold">{{ p.title }}</h2>
          <p id="bd-confirm-msg" class="mt-2 text-sm text-slate-600">{{ p.message }}</p>
          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button #cancelBtn type="button" class="bd-btn-secondary" (click)="dialog.answer(false)">{{ p.cancelText ?? 'Cancel' }}</button>
            <button type="button" [class]="p.danger ? 'bd-btn-danger' : 'bd-btn-primary'" (click)="dialog.answer(true)">
              {{ p.confirmText ?? 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmDialogHost {
  protected readonly dialog = inject(ConfirmDialogService);
  private readonly cancelBtn = viewChild<ElementRef<HTMLButtonElement>>('cancelBtn');

  constructor() {
    // DOM side effect: move focus into the dialog when it opens (safe default = Cancel).
    effect(() => this.cancelBtn()?.nativeElement.focus());
  }

  protected onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.dialog.answer(false);
  }
}
