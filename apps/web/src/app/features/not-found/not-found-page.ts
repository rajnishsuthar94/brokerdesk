import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'bd-not-found-page',
  imports: [RouterLink],
  template: `
    <section class="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <p class="text-5xl font-bold text-brand-700">404</p>
      <h1 class="mt-4 text-xl font-semibold">Page not found</h1>
      <p class="mt-2 text-sm text-slate-600">The page you are looking for doesn't exist or has moved.</p>
      <a routerLink="/dashboard"
         class="mt-6 inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-5 text-sm font-medium text-white hover:bg-brand-800">
        Go to dashboard
      </a>
    </section>
  `,
})
export class NotFoundPage {}
