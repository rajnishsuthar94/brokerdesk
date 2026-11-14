import { Pipe, type PipeTransform } from '@angular/core';
import { formatDate, formatDateTime, formatIndianPhone, formatInr } from '../utils/format';

/** `{{ price | inr }}` → ₹85,00,000 · `{{ price | inr: 'short' }}` → ₹85 L */
@Pipe({ name: 'inr' })
export class InrPipe implements PipeTransform {
  transform(value: number | string | null | undefined, style: 'full' | 'short' = 'full'): string {
    return formatInr(value, style);
  }
}

/** `{{ date | istDate }}` → 14/11/2026 · `{{ date | istDate: 'datetime' }}` → 14/11/2026, 5:00 PM */
@Pipe({ name: 'istDate' })
export class IstDatePipe implements PipeTransform {
  transform(value: Date | string | number | null | undefined, mode: 'date' | 'datetime' = 'date'): string {
    return mode === 'datetime' ? formatDateTime(value) : formatDate(value);
  }
}

/** `{{ phone | indianPhone }}` → +91 98765 43210 */
@Pipe({ name: 'indianPhone' })
export class IndianPhonePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return formatIndianPhone(value);
  }
}
