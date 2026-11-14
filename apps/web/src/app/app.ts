import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppBanners } from './core/layout/app-banners/app-banners';
import { ConfirmDialogHost } from './shared/components/confirm-dialog';
import { Toaster } from './shared/components/toaster';

@Component({
  selector: 'bd-root',
  imports: [RouterOutlet, AppBanners, Toaster, ConfirmDialogHost],
  template: `
    <!-- Offline / new-version notices on every page, signed in or not. -->
    <bd-app-banners class="sticky top-0 z-50 block" />
    <router-outlet />
    <bd-toaster />
    <bd-confirm-dialog-host />
  `,
})
export class App {}
