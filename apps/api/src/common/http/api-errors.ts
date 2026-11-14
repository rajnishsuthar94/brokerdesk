import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ApiErrorCode } from '@brokerdesk/shared-types';

/** 403 with a machine-readable `code` (shape matches ApiErrorResponse). */
export function forbidden(code: ApiErrorCode, message: string): ForbiddenException {
  return new ForbiddenException({ statusCode: 403, error: 'Forbidden', message, code });
}

/** 401 with a machine-readable `code`. */
export function unauthorized(code: ApiErrorCode, message: string): UnauthorizedException {
  return new UnauthorizedException({ statusCode: 401, error: 'Unauthorized', message, code });
}
