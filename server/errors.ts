import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { ApiErrorResponse, BulkItemFailure } from '../source/shared/types';

export class AppApiError extends Error {
  public readonly status: number;
  public readonly errorCode: string;
  public readonly title: string;
  public readonly validationErrors?: Record<string, string[]>;
  public readonly partialFailures?: BulkItemFailure[];

  constructor(options: {
    status: number;
    errorCode: string;
    title: string;
    detail: string;
    validationErrors?: Record<string, string[]>;
    partialFailures?: BulkItemFailure[];
  }) {
    super(options.detail);
    this.status = options.status;
    this.errorCode = options.errorCode;
    this.title = options.title;
    this.validationErrors = options.validationErrors;
    this.partialFailures = options.partialFailures;
  }
}

export function createTraceId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

export function toProblemDetails(
  err: unknown,
  instancePath?: string,
  traceId = createTraceId(),
): ApiErrorResponse {
  const timestamp = new Date().toISOString();

  if (err instanceof AppApiError) {
    return {
      type: `https://buckets.cloudflare.dev/errors/${err.errorCode.toLowerCase()}`,
      title: err.title,
      status: err.status,
      detail: err.message,
      errorCode: err.errorCode,
      traceId,
      timestamp,
      instance: instancePath,
      validationErrors: err.validationErrors,
      partialFailures: err.partialFailures,
    };
  }

  const message = err instanceof Error ? err.message : 'Unexpected server failure';
  return {
    type: 'https://buckets.cloudflare.dev/errors/internal_server_error',
    title: 'Internal Server Error',
    status: 500,
    detail: message,
    errorCode: 'INTERNAL_SERVER_ERROR',
    traceId,
    timestamp,
    instance: instancePath,
  };
}

export function expressErrorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const traceId = (res.locals.traceId as string | undefined) || createTraceId();
  const problem = toProblemDetails(err, req.originalUrl, traceId);
  res.status(problem.status).type('application/problem+json').json(problem);
}
