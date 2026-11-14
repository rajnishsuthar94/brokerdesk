import { Component, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthStore } from '../../auth/auth.store';
import { RemindersStore } from '../../services/reminders.store';
import { SystemStatusStore } from '../../services/system-status.store';
import { ToastService } from '../../services/toast.service';
import { errorMessage } from '../../../shared/utils/http-error';
import { ROLE_LABELS } from '../../../shared/utils/labels';
import { NAV_ITEMS } from '../nav-items';

/**
 * Signed-in application frame: sidebar on desktop, top header with agency
 * switcher and profile menu, and a thumb-reachable bottom bar on mobile.
 */
@Component({
  selector: 'bd-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.html',
})
export class Shell {
  protected readonly auth = inject(AuthStore);
  protected readonly status = inject(SystemStatusStore);
  protected readonly reminders = inject(RemindersStore);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly roleLabels = ROLE_LABELS;
  /** Without an agency only onboarding/settings make sense, so agency features are hidden. */
  protected readonly navItems = computed(() =>
    this.auth.hasAgency() ? NAV_ITEMS : NAV_ITEMS.filter((i) => i.path === '/settings'),
  );
  protected readonly mobilePrimary = computed(() => this.navItems().filter((i) => i.mobilePrimary));
  protected readonly mobileMore = computed(() => this.navItems().filter((i) => !i.mobilePrimary));

  protected readonly mobileMoreOpen = signal(false);
  protected readonly menuOpen = signal(false);
  protected readonly switching = signal(false);

  protected readonly statusLabel = computed(() => {
    if (this.status.isHealthy()) return 'Online';
    return this.status.loadStatus() === 'loaded' || this.status.loadStatus() === 'error' ? 'Service issue' : 'Checking…';
  });

  protected readonly initials = computed(() =>
    (this.auth.user()?.name ?? '?')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join(''),
  );

  protected readonly bellLabel = computed(() => {
    const c = this.reminders.counts();
    if (!c || this.reminders.total() === 0) return 'Reminders: nothing due';
    const parts = [
      c.overdueFollowUps ? `${c.overdueFollowUps} overdue` : '',
      c.followUpsDueToday ? `${c.followUpsDueToday} due today` : '',
      c.siteVisitsToday ? `${c.siteVisitsToday} site visit${c.siteVisitsToday > 1 ? 's' : ''} today` : '',
    ].filter(Boolean);
    return `Reminders: ${parts.join(', ')}`;
  });

  constructor() {
    void this.status.refresh();
    // Side effect: poll reminder counts only while an agency is active (re-checks on agency switch).
    effect(() => {
      if (this.auth.hasAgency() && this.auth.activeAgencyId()) this.reminders.start();
      else this.reminders.stop();
    });
    // Close menus after any navigation.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.closeMenus());
  }

  protected toggleMore(): void {
    this.menuOpen.set(false);
    this.mobileMoreOpen.update((open) => !open);
  }

  protected toggleMenu(): void {
    this.mobileMoreOpen.set(false);
    this.menuOpen.update((open) => !open);
  }

  protected closeMenus(): void {
    this.mobileMoreOpen.set(false);
    this.menuOpen.set(false);
  }

  protected async switchAgency(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const agencyId = select.value;
    if (agencyId === this.auth.activeAgencyId()) return;
    this.switching.set(true);
    try {
      await this.auth.switchAgency(agencyId);
      this.toasts.success(`Switched to ${this.auth.activeMembership()?.agencyName ?? 'agency'}`);
      await this.router.navigateByUrl('/dashboard');
    } catch (e: unknown) {
      select.value = this.auth.activeAgencyId() ?? '';
      this.toasts.error(errorMessage(e));
    } finally {
      this.switching.set(false);
    }
  }

  protected async logout(): Promise<void> {
    this.closeMenus();
    await this.auth.logout();
  }
}
