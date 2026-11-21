import { formatTemplate, getActiveLocale, getTranslation, type AppLocale } from './i18n';
import type { ApiErrorResponse } from './types';

export interface ParsedClientError {
  title: string;
  userMessage: string;
  errorCode: string;
  status: number;
  traceId?: string;
  validationDetails: string[];
  rawDetail?: string;
}

export function parseApiError(error: unknown, locale: AppLocale = getActiveLocale()): ParsedClientError {
  const errText = getTranslation(locale).errors;

  if (isApiErrorResponse(error)) {
    const validationDetails = error.validationErrors
      ? Object.entries(error.validationErrors).flatMap(([field, msgs]) =>
          msgs.map((m) => `${field}: ${m}`),
        )
      : [];

    const mapped = errText.codeMap[error.errorCode];
    return {
      title: error.title || errText.operationErrorTitle,
      userMessage: mapped ?? error.detail ?? errText.unexpectedError,
      errorCode: error.errorCode || `HTTP_${error.status}`,
      status: error.status,
      traceId: error.traceId,
      validationDetails,
      rawDetail: error.detail,
    };
  }

  if (error instanceof Error) {
    const isNetwork =
      error.message.includes('Failed to fetch') ||
      error.message.includes('NetworkError') ||
      error.message.includes('ECONNREFUSED');
    return {
      title: isNetwork ? errText.networkFailureTitle : errText.clientErrorTitle,
      userMessage: isNetwork
        ? formatTemplate(errText.codeMap.NETWORK_UNREACHABLE, {})
        : error.message,
      errorCode: isNetwork ? 'NETWORK_UNREACHABLE' : 'CLIENT_RUNTIME_ERROR',
      status: 0,
      validationDetails: [],
      rawDetail: error.message,
    };
  }

  return {
    title: errText.unknownErrorTitle,
    userMessage: errText.unknownErrorDetail,
    errorCode: 'UNKNOWN_ERROR',
    status: 500,
    validationDetails: [],
  };
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.errorCode === 'string' &&
    typeof record.status === 'number' &&
    typeof record.detail === 'string'
  );
}

export function logClientError(context: string, parsed: ParsedClientError): void {
  console.error('[CloudflareBuckets::ClientError]', {
    context,
    errorCode: parsed.errorCode,
    status: parsed.status,
    traceId: parsed.traceId,
    message: parsed.userMessage,
    rawDetail: parsed.rawDetail,
    timestamp: new Date().toISOString(),
  });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value >= 10 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

export function normalizePrefix(prefix: string): string {
  const trimmed = prefix.replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export interface BreadcrumbSegment {
  label: string;
  prefix: string;
}

export function buildBreadcrumbs(prefix: string): BreadcrumbSegment[] {
  const normalized = normalizePrefix(prefix);
  if (!normalized) return [];
  const parts = normalized.split('/').filter(Boolean);
  const crumbs: BreadcrumbSegment[] = [];
  let acc = '';
  for (const part of parts) {
    acc += `${part}/`;
    crumbs.push({ label: part, prefix: acc });
  }
  return crumbs;
}
