import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ImportDuplicateStrategy, LeadImportResult } from '@brokerdesk/shared-types';
import { firstValueFrom } from 'rxjs';
import { ToastService } from '../../../core/services/toast.service';
import { saveBlob } from '../../../shared/utils/download';
import { errorMessage } from '../../../shared/utils/http-error';
import { LeadsApiService } from '../services/leads-api.service';
import { LeadsListStore } from '../store/leads-list.store';

const MAX_BYTES = 1024 * 1024;
const UTF8_BOM = String.fromCharCode(0xfeff);

const TEMPLATE = [
  'Name,Phone,Email,Source,Budget Min,Budget Max,Location,BHK,Property Type,Sale or Rent,Status,Priority,Next Follow-up,Assigned To,Notes',
  'Amit Mehta,98250 12345,amit@example.com,99acres,75 L,90 L,Shela,3,Flat,Buy,New,High,20/11/2026,,Wants ready possession',
  'Priya Iyer,94260 55667,,WhatsApp,20000,30000,Prahlad Nagar,2,Apartment,Rent,Contacted,Medium,,,',
].join('\r\n');

/** Two-step Excel/CSV import: preview (nothing saved) → import. Owners/admins only (API-enforced). */
@Component({
  selector: 'bd-leads-import-page',
  imports: [RouterLink],
  templateUrl: './leads-import-page.html',
})
export class LeadsImportPage {
  private readonly api = inject(LeadsApiService);
  private readonly listStore = inject(LeadsListStore);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly file = signal<File | null>(null);
  protected readonly preview = signal<LeadImportResult | null>(null);
  protected readonly duplicates = signal<ImportDuplicateStrategy>('skip');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected downloadTemplate(): void {
    // The BOM makes Excel open the file as UTF-8 (₹, Gujarati/Hindi names).
    saveBlob(new Blob([UTF8_BOM + TEMPLATE + '\r\n'], { type: 'text/csv;charset=utf-8' }), 'brokerdesk-leads-template.csv');
  }

  protected async onFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.preview.set(null);
    this.error.set(null);
    this.file.set(file);
    if (!file) return;
    if (/\.xls$/i.test(file.name)) {
      this.error.set('Old Excel files (.xls) are not supported. In Excel use File → Save As → Excel Workbook (.xlsx).');
      return;
    }
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      this.error.set('Please choose an Excel (.xlsx) or CSV file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error.set('The file is larger than 1 MB. Split it into smaller files (up to 2,000 rows each).');
      return;
    }
    await this.runPreview();
  }

  protected async setDuplicates(strategy: ImportDuplicateStrategy): Promise<void> {
    this.duplicates.set(strategy);
    if (this.file()) await this.runPreview();
  }

  private async runPreview(): Promise<void> {
    const file = this.file();
    if (!file) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      this.preview.set(await firstValueFrom(this.api.import(file, 'preview', this.duplicates())));
    } catch (e: unknown) {
      this.preview.set(null);
      this.error.set(errorMessage(e, 'Could not read this file.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async commit(): Promise<void> {
    const file = this.file();
    if (!file) return;
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.api.import(file, 'commit', this.duplicates()));
      this.listStore.reload();
      this.toasts.success(`${result.created} lead${result.created === 1 ? '' : 's'} imported`);
      await this.router.navigateByUrl('/leads');
    } catch (e: unknown) {
      this.error.set(errorMessage(e, 'The import failed. No leads were added.'));
    } finally {
      this.busy.set(false);
    }
  }
}
