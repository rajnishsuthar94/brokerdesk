import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, type VersionReadyEvent } from '@angular/service-worker';
import { filter, fromEvent, merge } from 'rxjs';

/** How often an open app checks for a new release. */
export const UPDATE_CHECK_MS = 6 * 60 * 60_000;

/**
 * App-level notices:
 * - offline: the app shell still opens (PWA), but data needs a connection;
 * - a new version is ready: one tap to reload.
 */
@Component({
  selector: 'bd-app-banners',
  template: `
    @if (!online()) {
      <div class="flex items-center gap-2 bg-slate-800 px-4 py-2 text-sm text-white" role="status" data-testid="offline-banner">
        <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 2l20 20M8.5 16.5a5 5 0 017 0M5 13a10 10 0 015.2-2.8M19 13a10 10 0 00-2.4-1.7M2 8.8a15 15 0 014.2-2.6M22 8.8A15 15 0 0011 5M12 20h.01"/></svg>
        You're offline. You can look around, but loading and saving need an internet connection.
      </div>
    }
    @if (updateReady()) {
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 bg-brand-800 px-4 py-2 text-sm text-white" role="status" data-testid="update-banner">
        A new version of BrokerDesk is ready.
        <button type="button" class="rounded-md bg-white px-3 py-1 font-semibold text-brand-800 hover:bg-brand-50" (click)="reload()">Reload</button>
      </div>
    }
  `,
})
export class AppBanners {
  private readonly document = inject(DOCUMENT);
  private readonly updates = inject(SwUpdate, { optional: true });

  protected readonly online = signal(this.document.defaultView?.navigator.onLine ?? true);
  protected readonly updateReady = signal(false);

  constructor() {
    const win = this.document.defaultView;
    if (win) {
      merge(fromEvent(win, 'online'), fromEvent(win, 'offline'))
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.online.set(win.navigator.onLine));
    }

    const sw = this.updates;
    if (sw?.isEnabled) {
      sw.versionUpdates
        .pipe(
          filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'),
          takeUntilDestroyed(),
        )
        .subscribe(() => this.updateReady.set(true));
      // A broken cache (e.g. after storage was cleared mid-update) can only be fixed by reloading.
      sw.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => this.updateReady.set(true));
      const timer = setInterval(() => void sw.checkForUpdate().catch(() => false), UPDATE_CHECK_MS);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  protected reload(): void {
    this.document.location.reload();
  }
}
