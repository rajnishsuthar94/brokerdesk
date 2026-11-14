import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Client-side checks mirror the API's rules for instant feedback only.
 * The API always re-validates; never rely on these for security.
 */

/** Optional Indian mobile: empty is OK; otherwise 10 digits starting 6–9 (with optional +91/0). */
export const indianMobile: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (value === '') return null;
  if (!/^[+\d\s\-()]+$/.test(value)) return { indianMobile: true };
  const digits = value.replace(/\D/g, '');
  const national =
    digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/.test(national) ? null : { indianMobile: true };
};

/** Lead phone: Indian mobile (10 digits, optional 0/91 prefix), or an international "+" number (UX check; the API re-validates). */
export const leadPhone: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const v = typeof control.value === 'string' ? control.value.trim() : '';
  if (v === '') return null;
  if (!/^[+\d\s\-()]+$/.test(v)) return { leadPhone: true };
  const digits = v.replace(/\D/g, '');
  const national =
    digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
    : digits.length === 11 && digits.startsWith('0') ? digits.slice(1)
    : digits;
  if (/^[6-9]\d{9}$/.test(national)) return null;
  const international = v.startsWith('+') && !digits.startsWith('91') && digits.length >= 8 && digits.length <= 15;
  return international ? null : { leadPhone: true };
};

/** 8–128 characters with at least one letter and one digit (same as the API). */
export const strongPassword: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const v = typeof control.value === 'string' ? control.value : '';
  if (v === '') return null; // leave "required" to Validators.required
  return v.length >= 8 && v.length <= 128 && /[A-Za-z]/.test(v) && /\d/.test(v) ? null : { password: true };
};

/** Group validator: `password` and `confirmPassword` must match (error set on confirm). */
export function matchingPasswords(passwordKey = 'password', confirmKey = 'confirmPassword'): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const confirm = group.get(confirmKey);
    const mismatch = group.get(passwordKey)?.value !== confirm?.value;
    if (confirm) {
      const next: ValidationErrors = { ...confirm.errors };
      delete next['mismatch'];
      if (mismatch && confirm.value) next['mismatch'] = true;
      confirm.setErrors(Object.keys(next).length > 0 ? next : null);
    }
    return null;
  };
}
