import { Component, input, model } from '@angular/core';
import { timePresets } from '../../../shared/utils/ist-time';

/**
 * Date & time input in IST with one-tap quick picks ("Tomorrow 11 AM"…).
 * `value` is the datetime-local string in IST wall-clock time.
 */
@Component({
  selector: 'bd-time-field',
  template: `
    <label class="bd-label" [for]="inputId()">{{ label() }}</label>
    <div class="mb-2 flex flex-wrap gap-1.5" role="group" [attr.aria-label]="'Quick picks for ' + label()">
      @for (p of presets; track p.label) {
        <button type="button" class="min-h-9 rounded-full border px-3 text-xs font-medium"
                [class]="value() === p.value ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'"
                [attr.aria-pressed]="value() === p.value" (click)="value.set(p.value)">
          {{ p.label }}
        </button>
      }
    </div>
    <input [id]="inputId()" class="bd-input" type="datetime-local" [value]="value()" (input)="onInput($event)"
           [attr.aria-invalid]="invalid() || null" />
    @if (invalid()) {
      <p class="bd-error" role="alert">Choose a date and time.</p>
    }
  `,
})
export class TimeField {
  readonly label = input('Date & time (IST)');
  readonly inputId = input.required<string>();
  readonly invalid = input(false);
  readonly value = model('');

  protected readonly presets = timePresets();

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value);
  }
}
