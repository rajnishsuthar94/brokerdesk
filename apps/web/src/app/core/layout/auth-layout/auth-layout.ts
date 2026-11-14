import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** Centered single-card layout for login, registration and other public pages. */
@Component({
  selector: 'bd-auth-layout',
  imports: [RouterOutlet],
  template: `
    <div class="flex min-h-dvh flex-col items-center px-4 py-8 sm:justify-center">
      <div class="mb-6 flex items-center gap-2">
        <span class="grid h-10 w-10 place-items-center rounded-xl bg-brand-700 text-lg font-bold text-white" aria-hidden="true">B</span>
        <span class="text-xl font-semibold tracking-tight">BrokerDesk</span>
      </div>
      <main class="w-full max-w-md">
        <router-outlet />
      </main>
      <p class="mt-8 text-center text-xs text-slate-500">Simple CRM for real estate brokers</p>
    </div>
  `,
})
export class AuthLayout {}
