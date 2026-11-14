import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { canDeleteProperties, canEditProperty, type PropertyView } from '@brokerdesk/shared-types';
import { firstValueFrom, of } from 'rxjs';
import { AuthStore } from '../../../core/auth/auth.store';
import { ToastService } from '../../../core/services/toast.service';
import { ConfirmDialogService } from '../../../shared/components/confirm-dialog';
import {
  AREA_UNIT_LABELS,
  AVAILABILITY_LABELS,
  AVAILABILITY_STYLES,
  FURNISHING_LABELS,
  PROPERTY_TYPE_LABELS,
} from '../../../shared/models/real-estate-labels';
import { IndianPhonePipe, InrPipe, IstDatePipe } from '../../../shared/pipes/format.pipes';
import { errorMessage } from '../../../shared/utils/http-error';
import { shrinkImage } from '../../../shared/utils/image-shrink';
import { whatsappChatUrl } from '../../../shared/utils/whatsapp';
import { RelatedSiteVisits } from '../../activities/components/related-site-visits';
import { LeadMatches } from '../../matching/components/lead-matches';
import { PhotoManager, type PhotoUpload } from '../components/photo-manager';
import { PropertiesApiService } from '../services/properties-api.service';
import { PropertiesListStore } from '../store/properties-list.store';

@Component({
  selector: 'bd-property-detail-page',
  imports: [RouterLink, InrPipe, IstDatePipe, IndianPhonePipe, PhotoManager, LeadMatches, RelatedSiteVisits],
  templateUrl: './property-detail-page.html',
})
export class PropertyDetailPage {
  readonly id = input.required<string>();

  private readonly api = inject(PropertiesApiService);
  private readonly listStore = inject(PropertiesListStore);
  private readonly auth = inject(AuthStore);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly router = inject(Router);

  protected readonly typeLabels = PROPERTY_TYPE_LABELS;
  protected readonly availabilityLabels = AVAILABILITY_LABELS;
  protected readonly availabilityStyles = AVAILABILITY_STYLES;
  protected readonly furnishingLabels = FURNISHING_LABELS;
  protected readonly unitLabels = AREA_UNIT_LABELS;

  protected readonly property = rxResource({
    params: () => this.id(),
    stream: ({ params: id }) => (id ? this.api.get(id) : of(undefined)),
  });
  protected readonly notFound = computed(() => (this.property.error() as { status?: number } | undefined)?.status === 404);
  protected readonly loadError = computed(() => errorMessage(this.property.error(), 'Could not load this property.'));
  protected readonly photoBusy = signal(false);
  protected readonly activePhoto = signal(0);

  protected readonly canEdit = computed(() => {
    const p = this.property.value();
    const role = this.auth.role();
    const userId = this.auth.user()?.id;
    return !!p && role !== null && !!userId && canEditProperty(role, p.assignedUser?.id ?? null, userId);
  });
  protected readonly canDelete = computed(() => {
    const role = this.auth.role();
    return role !== null && canDeleteProperties(role);
  });
  protected readonly ownerWhatsapp = computed(() => {
    const phone = this.property.value()?.ownerPhone;
    return phone && phone.startsWith('+') ? whatsappChatUrl(phone) : null;
  });

  constructor() {
    // Keep the gallery index valid when photos change.
    effect(() => {
      const count = this.property.value()?.images.length ?? 0;
      if (this.activePhoto() >= count) this.activePhoto.set(Math.max(0, count - 1));
    });
  }

  private set(p: PropertyView): void {
    this.property.set(p);
    this.listStore.reload();
  }

  protected async upload(req: PhotoUpload): Promise<void> {
    this.photoBusy.set(true);
    try {
      const blobs = await Promise.all(req.files.map((f) => shrinkImage(f)));
      this.set(await firstValueFrom(this.api.uploadImages(this.id(), blobs, req.files.map((f) => f.name))));
      this.toasts.success(`${req.files.length} photo${req.files.length === 1 ? '' : 's'} added`);
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e, 'Could not upload the photos.'));
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected async removePhoto(imageId: string): Promise<void> {
    const ok = await this.confirm.ask({ title: 'Delete this photo?', message: 'It will be removed from the listing.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    this.photoBusy.set(true);
    try {
      this.set(await firstValueFrom(this.api.removeImage(this.id(), imageId)));
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected async movePhoto(event: { index: number; by: -1 | 1 }): Promise<void> {
    const ids = [...(this.property.value()?.images ?? [])].map((i) => i.id);
    const target = event.index + event.by;
    if (target < 0 || target >= ids.length) return;
    [ids[event.index], ids[target]] = [ids[target]!, ids[event.index]!];
    this.photoBusy.set(true);
    try {
      this.set(await firstValueFrom(this.api.reorderImages(this.id(), ids)));
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    } finally {
      this.photoBusy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const p = this.property.value();
    if (!p) return;
    const ok = await this.confirm.ask({
      title: `Delete "${p.title}"?`,
      message: 'It will be removed from your inventory and matches. To keep it for records, set it to Archived instead.',
      confirmText: 'Delete property',
      danger: true,
    });
    if (!ok) return;
    try {
      await firstValueFrom(this.api.remove(p.id));
      this.listStore.reload();
      this.toasts.success('Property deleted');
      await this.router.navigateByUrl('/properties');
    } catch (e: unknown) {
      this.toasts.error(errorMessage(e));
    }
  }
}
