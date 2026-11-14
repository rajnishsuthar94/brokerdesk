import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
}

/** App-wide toast notifications (rendered by <bd-toaster> in the root component). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<readonly Toast[]>([]);
  readonly toasts = this.items.asReadonly();
  private nextId = 1;

  success(message: string): void {
    this.show('success', message);
  }
  error(message: string): void {
    this.show('error', message, 6000);
  }
  info(message: string): void {
    this.show('info', message);
  }

  dismiss(id: number): void {
    this.items.update((list) => list.filter((t) => t.id !== id));
  }

  private show(kind: ToastKind, message: string, durationMs = 4000): void {
    const id = this.nextId++;
    this.items.update((list) => [...list.slice(-2), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }
}
