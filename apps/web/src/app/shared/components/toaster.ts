import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'bd-toaster',
  template: `
    <div class="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 md:items-end md:pr-6"
         aria-live="polite" aria-atomic="false">
      @for (toast of toasts.toasts(); track toast.id) {
        <div class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm shadow-lg"
             [class]="toast.kind === 'error' ? 'bg-red-700 text-white' : toast.kind === 'success' ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-white'"
             [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
          <span class="flex-1">{{ toast.message }}</span>
          <button type="button" class="-m-1 p-1 opacity-80 hover:opacity-100" (click)="toasts.dismiss(toast.id)" aria-label="Dismiss">✕</button>
        </div>
      }
    </div>
  `,
})
export class Toaster {
  protected readonly toasts = inject(ToastService);
}
