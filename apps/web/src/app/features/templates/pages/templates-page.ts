import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import {
  MAX_TEMPLATE_LENGTH,
  type MessageTemplateView,
  PLACEHOLDER_HELP,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_PLACEHOLDERS,
  type TemplateCategory,
  renderTemplate,
} from '@brokerdesk/shared-types';
import { firstValueFrom, type Observable } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { BusinessApiService } from '../../../core/services/business-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import { errorMessage } from '../../../shared/utils/http-error';

/** Example values for the live preview. */
const SAMPLE = {
  name: 'Amit', full_name: 'Amit Mehta', agent: 'Ramesh', agency: 'Shela Homes', property: 'Applewoods 3 BHK',
  location: 'Shela', price: '₹85 L', visit_time: 'Sun, 22 Nov, 11:00 AM',
} as const;

/** WhatsApp message templates: everyone can view; owners/admins add, edit and delete. */
@Component({
  selector: 'bd-templates-page',
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-4xl space-y-5">
      <a routerLink="/settings" class="bd-link text-sm">‹ Settings</a>
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">WhatsApp templates</h1>
          <p class="text-sm text-slate-600">Ready-made messages for leads. They open in WhatsApp for you to check and send — nothing is sent automatically.</p>
        </div>
        @if (canEdit() && !editing()) {
          <button type="button" class="bd-btn-primary" (click)="startNew()" data-testid="new-template">+ New template</button>
        }
      </header>

      @if (editing(); as e) {
        <form class="bd-card space-y-4" (submit)="$event.preventDefault(); save()" [attr.aria-label]="e === 'new' ? 'New template' : 'Edit template'">
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div class="sm:col-span-2">
              <label class="bd-label" for="tpl-title">Title</label>
              <input id="tpl-title" class="bd-input" maxlength="150" [value]="title()" (input)="title.set(valueOf($event))" />
            </div>
            <div>
              <label class="bd-label" for="tpl-category">Used for</label>
              <select id="tpl-category" class="bd-input" (change)="category.set(valueOf($event))">
                @for (c of categories; track c) { <option [value]="c" [selected]="c === category()">{{ categoryLabels[c] }}</option> }
              </select>
            </div>
          </div>
          <div>
            <label class="bd-label" for="tpl-message">Message</label>
            <textarea id="tpl-message" class="bd-input min-h-32 py-2" [attr.maxlength]="maxLength" [value]="message()" (input)="message.set(valueOf($event))"></textarea>
            <p class="bd-hint">{{ message().length }} / {{ maxLength }} · Any language. Tap to insert:</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              @for (p of placeholders; track p) {
                <button type="button" class="rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50" [title]="help[p]" (click)="insert(p)">{{ '{{' + p + '}}' }}</button>
              }
            </div>
          </div>
          <div>
            <p class="bd-label">Preview (example values)</p>
            <p class="whitespace-pre-line rounded-lg bg-emerald-50 p-3 text-sm text-slate-800" data-testid="template-preview">{{ preview() }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="submit" class="bd-btn-primary" [disabled]="busy()">{{ busy() ? 'Saving…' : 'Save template' }}</button>
            <button type="button" class="bd-btn-secondary" (click)="editing.set(null)">Cancel</button>
          </div>
        </form>
      }

      @if (list.error()) {
        <p class="bd-alert-error" role="alert">Could not load templates.</p>
      } @else if (list.isLoading() && !list.value()) {
        <div class="h-32 animate-pulse rounded-2xl bg-slate-100" aria-busy="true"></div>
      } @else if (templates().length === 0) {
        <div class="bd-card py-10 text-center">
          <p class="font-medium">No templates yet</p>
          @if (canEdit()) {
            <p class="mt-1 text-sm text-slate-600">Start with 5 ready-made messages (first contact, follow-up, site visit…) and edit them as you like.</p>
            <button type="button" class="bd-btn-primary mt-4" (click)="addDefaults()" [disabled]="busy()" data-testid="add-default-templates">Add starter templates</button>
          } @else {
            <p class="mt-1 text-sm text-slate-600">Ask your agency owner or admin to add some.</p>
          }
        </div>
      } @else {
        <ul class="space-y-3" aria-label="Templates">
          @for (t of templates(); track t.id) {
            <li class="bd-card" data-testid="template">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-semibold">{{ t.title }}</p>
                  <p class="text-xs text-slate-500">{{ categoryLabels[t.category] }}</p>
                </div>
                @if (canEdit()) {
                  <div class="flex gap-1">
                    <button type="button" class="bd-btn-secondary min-h-9 px-3 text-sm" (click)="startEdit(t)">Edit</button>
                    <button type="button" class="min-h-9 rounded-lg px-3 text-sm font-medium text-red-700 hover:bg-red-50" (click)="remove(t)">Delete</button>
                  </div>
                }
              </div>
              <p class="mt-2 whitespace-pre-line text-sm text-slate-700">{{ t.message }}</p>
            </li>
          }
        </ul>
        @if (canEdit()) {
          <button type="button" class="bd-link text-sm" (click)="addDefaults()" [disabled]="busy()">Add any missing starter templates</button>
        }
      }
    </section>
  `,
})
export class TemplatesPage {
  private readonly auth = inject(AuthStore);
  private readonly api = inject(BusinessApiService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);

  protected readonly categories = TEMPLATE_CATEGORIES;
  protected readonly categoryLabels = TEMPLATE_CATEGORY_LABELS;
  protected readonly placeholders = TEMPLATE_PLACEHOLDERS;
  protected readonly help = PLACEHOLDER_HELP;
  protected readonly maxLength = MAX_TEMPLATE_LENGTH;
  protected readonly canEdit = this.auth.canManageTeam;

  protected readonly list = rxResource({ params: () => this.auth.activeAgencyId(), stream: () => this.api.templates() });
  protected readonly templates = computed<readonly MessageTemplateView[]>(() => this.list.value() ?? []);

  /** 'new', a template id, or null (not editing). */
  protected readonly editing = signal<string | null>(null);
  protected readonly title = signal('');
  protected readonly message = signal('');
  protected readonly category = signal<string>('GENERAL');
  protected readonly busy = signal(false);
  protected readonly preview = computed(() => renderTemplate(this.message(), SAMPLE));

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected startNew(): void {
    this.title.set('');
    this.message.set('');
    this.category.set('GENERAL');
    this.editing.set('new');
  }

  protected startEdit(t: MessageTemplateView): void {
    this.title.set(t.title);
    this.message.set(t.message);
    this.category.set(t.category);
    this.editing.set(t.id);
  }

  protected insert(p: string): void {
    const text = this.message();
    this.message.set(`${text}${text && !text.endsWith(' ') ? ' ' : ''}{{${p}}}`);
  }

  protected async save(): Promise<void> {
    const id = this.editing();
    const title = this.title().trim();
    const message = this.message().trim();
    if (title.length < 2 || message.length < 2) {
      this.toasts.error('Add a title and a message.');
      return;
    }
    const body = { title, message, category: this.category() as TemplateCategory };
    if (await this.run(id === 'new' ? this.api.createTemplate(body) : this.api.updateTemplate(id ?? '', body), 'Template saved')) {
      this.editing.set(null);
    }
  }

  protected async remove(t: MessageTemplateView): Promise<void> {
    const ok = await this.confirm.ask({ title: `Delete "${t.title}"?`, message: 'Your team will no longer see this template.', confirmText: 'Delete', danger: true });
    if (ok) await this.run(this.api.deleteTemplate(t.id), 'Template deleted');
  }

  protected async addDefaults(): Promise<void> {
    await this.run(this.api.addDefaultTemplates(), 'Starter templates added');
  }

  /** Returns whether the call succeeded (errors are shown as a toast). */
  private async run(call: Observable<unknown>, message: string): Promise<boolean> {
    if (this.busy()) return false;
    this.busy.set(true);
    try {
      await firstValueFrom(call);
      this.toasts.success(message);
      this.list.reload();
      return true;
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
