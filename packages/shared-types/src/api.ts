/** Error body returned by the API (NestJS HttpException format). */
export interface ApiErrorResponse {
  readonly statusCode: number;
  readonly message: string | readonly string[];
  readonly error?: string;
  /** Machine-readable code for errors the UI handles specially (see ApiErrorCode). */
  readonly code?: string;
}

/** Standard paginated list envelope. */
export interface Paginated<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export type HealthCheckStatus = 'ok' | 'degraded' | 'error' | 'shutting_down';
export type HealthIndicatorStatus = 'up' | 'degraded' | 'down';

export interface HealthIndicatorResult {
  readonly status: HealthIndicatorStatus;
  readonly [detail: string]: unknown;
}

/** Response body of `GET /api/v1/health` (Terminus format). */
export interface HealthResponse {
  readonly status: HealthCheckStatus;
  readonly info?: Readonly<Record<string, HealthIndicatorResult>>;
  readonly error?: Readonly<Record<string, HealthIndicatorResult>>;
  readonly details: Readonly<Record<string, HealthIndicatorResult>>;
}
