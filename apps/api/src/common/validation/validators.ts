import { Transform } from 'class-transformer';
import { registerDecorator, type ValidationOptions } from 'class-validator';
import { normalizeEmail, normalizeIndianMobile, normalizeText } from '../utils/normalize.js';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Password policy: 8–128 chars with at least one letter and one digit. */
export function isAcceptablePassword(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= PASSWORD_MIN_LENGTH &&
    value.length <= PASSWORD_MAX_LENGTH &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value)
  );
}

export function IsAcceptablePassword(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isAcceptablePassword',
      target: target.constructor,
      propertyName: String(propertyName),
      options: {
        message: `Password must be ${PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} characters and contain at least one letter and one number`,
        ...options,
      },
      validator: { validate: (value: unknown) => isAcceptablePassword(value) },
    });
  };
}

/**
 * Validates an Indian mobile number. Pair with `@ToIndianMobile()` so the stored
 * value is normalised to E.164.
 */
export function IsIndianMobile(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isIndianMobile',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: 'Enter a valid 10-digit Indian mobile number', ...options },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && /^\+91[6-9]\d{9}$/.test(value),
      },
    });
  };
}

/*
 * Input transforms. Each one maps a blank string to `emptyAs` (undefined by
 * default = "not provided"; pass null where a blank form field means "clear it").
 * Only one transform is used per property, so ordering never matters.
 */
type Blank = undefined | null;

function blankOr(value: unknown, emptyAs: Blank, map: (s: string) => unknown): unknown {
  if (typeof value !== 'string') return value;
  return value.trim() === '' ? emptyAs : map(value);
}

/** Normalises to E.164 when valid; invalid input is left for the validator to reject. */
export const ToIndianMobile = (emptyAs?: Blank): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    blankOr(value, emptyAs, (s) => normalizeIndianMobile(s) ?? s),
  );

export const ToNormalizedEmail = (emptyAs?: Blank): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => blankOr(value, emptyAs, normalizeEmail));

export const ToTrimmedText = (emptyAs?: Blank): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => blankOr(value, emptyAs, normalizeText));
