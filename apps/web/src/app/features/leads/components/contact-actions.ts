import { Component, computed, inject, input } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';
import { whatsappChatUrl } from '../../../shared/utils/whatsapp';

/**
 * One-tap Call / WhatsApp / Copy for a phone number. WhatsApp uses the official
 * click-to-chat link (opens the chat; nothing is sent automatically).
 */
@Component({
  selector: 'bd-contact-actions',
  template: `
    <div class="flex flex-wrap gap-2">
      <a class="bd-btn-secondary" [href]="telUrl()" [attr.aria-label]="'Call ' + name()">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z"/></svg>
        Call
      </a>
      <a class="bd-btn bg-[#25D366] text-white hover:bg-[#1ebe5b]" [href]="whatsappUrl()" target="_blank" rel="noopener"
         [attr.aria-label]="'WhatsApp ' + name()">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.9-1c.2-.3.4-.2.7-.1l1.9.9c.3.1.4.2.5.3.1.2.1.7-.1 1.3z"/></svg>
        WhatsApp
      </a>
      <button type="button" class="bd-btn-secondary" (click)="copy()">Copy number</button>
    </div>
  `,
})
export class ContactActions {
  readonly phone = input.required<string>();
  readonly name = input('');
  private readonly toasts = inject(ToastService);

  protected readonly telUrl = computed(() => `tel:${this.phone()}`);
  protected readonly whatsappUrl = computed(() => whatsappChatUrl(this.phone()));

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.phone());
      this.toasts.success('Number copied');
    } catch {
      this.toasts.error('Could not copy the number');
    }
  }
}
