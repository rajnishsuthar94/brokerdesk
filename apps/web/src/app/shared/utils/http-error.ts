import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorResponse } from '@brokerdesk/shared-types';

function asApiError(body: unknown): Partial<ApiErrorResponse> | null {
  return typeof body === 'object' && body !== null ? (body as Partial<ApiErrorResponse>) : null;
}

/** Machine-readable error code from an API error, if any. */
export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse ? asApiError(error.error)?.code : undefined;
}

/**
 * A short, user-friendly message for any HTTP error. Server validation messages
 * are shown as-is (they are written for end users); transport errors get a
 * plain-language explanation.
 */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(error instanceof HttpErrorResponse)) return fallback;
  if (error.status === 0) return 'Cannot reach BrokerDesk. Check your internet connection and try again.';
  if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  const message = asApiError(error.error)?.message;
  if (Array.isArray(message) && message.length > 0) return String(message[0]);
  if (typeof message === 'string' && message.length > 0 && error.status < 500) return message;
  return fallback;
}
