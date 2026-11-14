import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import type { EnquiryChannel, EnquiryFormSettings } from '@brokerdesk/shared-types';
import { toDataURL } from 'qrcode';
import { firstValueFrom, from, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import { errorMessage } from '../../../shared/utils/http-error';
import { whatsappShareUrl } from '../../../shared/utils/whatsapp';
import { EnquiryFormApiService } from '../services/enquiry-form-api.service';

interface ChannelLink {
  readonly channel: EnquiryChannel;
  readonly label: string;
  readonly hint: string;
}

const CHANNEL_LINKS: readonly ChannelLink[] = [
  { channel: 'instagram', label: 'Instagram', hint: 'Paste in your Instagram bio or story' },
  { channel: 'facebook', label: 'Facebook', hint: 'Add to Facebook posts or your page' },
  { channel: 'website', label: 'Website', hint: 'Use as the "Enquire now" button on your website' },
];

export function withRef(url: string, channel: EnquiryChannel): string {
  return `${url}?ref=${channel}`;
}

/** "Get leads online": share the public enquiry form link / QR code. */
@Component({
  selector: 'bd-lead-capture-page',
  imports: [RouterLink],
  templateUrl: './lead-capture-page.html',
})
export class LeadCapturePage {
  private readonly api = inject(EnquiryFormApiService);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  protected readonly auth = inject(AuthStore);

  protected readonly settings = rxResource({ stream: () => this.api.get() });
  protected readonly loadError = computed(() => errorMessage(this.settings.error(), 'Could not load your enquiry form.'));
  protected readonly busy = signal(false);
  protected readonly channels = CHANNEL_LINKS;

  protected readonly whatsappUrl = computed(() => {
    const s = this.settings.value();
    if (!s) return '';
    const agency = this.auth.activeMembership()?.agencyName ?? 'us';
    return whatsappShareUrl(
      `Looking to buy or rent a property? Share your requirement with ${agency} here and we'll call you back: ${withRef(s.url, 'whatsapp')}`,
    );
  });

  /** QR code (PNG data URL) for the "?ref=qr" link. Regenerated when the link changes. */
  protected readonly qr = rxResource({
    params: () => this.settings.value()?.url,
    stream: ({ params: url }) =>
      url ? from(toDataURL(withRef(url, 'qr'), { width: 640, margin: 2, errorCorrectionLevel: 'M' })) : of(undefined),
  });

  protected link(channel: EnquiryChannel): string {
    const s = this.settings.value();
    return s ? withRef(s.url, channel) : '';
  }

  protected async copy(text: string, what = 'Link'): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toasts.success(`${what} copied`);
    } catch {
      this.toasts.error('Could not copy. Please select the link and copy it manually.');
    }
  }

  protected downloadQr(): void {
    const dataUrl = this.qr.value();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'brokerdesk-enquiry-qr.png';
    a.click();
  }

  protected async setEnabled(enabled: boolean): Promise<void> {
    await this.run(
      () => firstValueFrom(this.api.setEnabled(enabled)),
      enabled ? 'Enquiry form switched on' : 'Enquiry form switched off',
    );
  }

  protected async resetLink(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Create a new link?',
      message:
        'The current link and QR code will stop working immediately. Use this if you are getting spam. You will need to share the new link and reprint the QR code.',
      confirmText: 'Create new link',
      danger: true,
    });
    if (!ok) return;
    await this.run(() => firstValueFrom(this.api.resetLink()), 'New link created. The old link no longer works.');
  }

  private async run(work: () => Promise<EnquiryFormSettings>, success: string): Promise<void> {
    this.busy.set(true);
    try {
      this.settings.set(await work());
      this.toasts.success(success);
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
