import { Component, input, output, signal } from '@angular/core';
import { MAX_IMAGE_UPLOAD_BYTES, MAX_PROPERTY_IMAGES, type PropertyImageView } from '@brokerdesk/shared-types';

export interface PhotoUpload {
  readonly files: readonly File[];
}

/**
 * Presentational photo manager: add photos, reorder (first = cover), delete.
 * The page performs the API calls; this only validates and emits intents.
 */
@Component({
  selector: 'bd-photo-manager',
  template: `
    <div class="space-y-3">
      @if (images().length > 0) {
        <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Photos">
          @for (img of images(); track img.id; let i = $index; let last = $last) {
            <li class="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50" data-testid="photo">
              <img [src]="img.url" [alt]="'Photo ' + (i + 1)" class="aspect-[4/3] w-full object-cover" loading="lazy" />
              @if (i === 0) {
                <span class="absolute left-2 top-2 rounded-full bg-brand-700 px-2 py-0.5 text-xs font-semibold text-white">Cover</span>
              }
              @if (editable()) {
                <div class="flex items-center justify-between gap-1 p-1.5">
                  <div class="flex gap-1">
                    <button type="button" class="bd-btn-secondary min-h-9 px-2" [disabled]="busy() || i === 0" (click)="move.emit({ index: i, by: -1 })" [attr.aria-label]="'Move photo ' + (i + 1) + ' earlier'">←</button>
                    <button type="button" class="bd-btn-secondary min-h-9 px-2" [disabled]="busy() || last" (click)="move.emit({ index: i, by: 1 })" [attr.aria-label]="'Move photo ' + (i + 1) + ' later'">→</button>
                  </div>
                  <button type="button" class="bd-btn-secondary min-h-9 px-2 text-red-700" [disabled]="busy()" (click)="remove.emit(img.id)" [attr.aria-label]="'Delete photo ' + (i + 1)">Delete</button>
                </div>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">No photos yet. Listings with photos get more interest.</p>
      }

      @if (editable()) {
        <div>
          <label class="bd-btn-secondary cursor-pointer" [class.pointer-events-none]="busy() || remaining() === 0" [class.opacity-60]="busy() || remaining() === 0">
            <input type="file" class="sr-only" accept="image/jpeg,image/png,image/webp" multiple (change)="onFiles($event)" data-testid="photo-input"
                   [disabled]="busy() || remaining() === 0" />
            {{ busy() ? 'Uploading…' : '+ Add photos' }}
          </label>
          <p class="bd-hint mt-2">
            JPG, PNG or WebP, up to 8 MB each. {{ remaining() }} more allowed. The first photo is the cover.
            Location data in phone photos is removed automatically.
          </p>
          @if (error(); as message) { <p class="bd-error" role="alert">{{ message }}</p> }
        </div>
      }
    </div>
  `,
})
export class PhotoManager {
  readonly images = input.required<readonly PropertyImageView[]>();
  readonly editable = input(false);
  readonly busy = input(false);
  readonly upload = output<PhotoUpload>();
  readonly remove = output<string>();
  readonly move = output<{ index: number; by: -1 | 1 }>();

  protected readonly error = signal<string | null>(null);

  protected remaining(): number {
    return Math.max(0, MAX_PROPERTY_IMAGES - this.images().length);
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // allow choosing the same files again
    this.error.set(null);
    if (files.length === 0) return;
    if (files.length > this.remaining()) {
      this.error.set(`You can add ${this.remaining()} more photo${this.remaining() === 1 ? '' : 's'}.`);
      return;
    }
    const bad = files.find((f) => !/^image\/(jpeg|png|webp)$/.test(f.type));
    if (bad) {
      this.error.set(`"${bad.name}" is not a JPG, PNG or WebP photo.`);
      return;
    }
    const big = files.find((f) => f.size > MAX_IMAGE_UPLOAD_BYTES * 2.5);
    if (big) {
      this.error.set(`"${big.name}" is too large. Use a photo under 20 MB.`);
      return;
    }
    this.upload.emit({ files });
  }
}
