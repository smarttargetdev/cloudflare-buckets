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

const ERROR_CODE_MAP: Record<string, string> = {
  BUCKET_NAME_INVALID: 'O nome do bucket deve ter entre 3 e 63 caracteres minúsculos, números ou hífens.',
  BUCKET_ALREADY_EXISTS: 'Já existe um bucket com este nome na conta selecionada.',
  BUCKET_NOT_FOUND: 'O bucket solicitado não foi encontrado.',
  BUCKET_NOT_EMPTY: 'O bucket precisa estar vazio antes de ser removido.',
  FOLDER_INVALID_NAME: 'Nome de diretório inválido. Evite caracteres especiais ou caminhos relativos.',
  OBJECT_NOT_FOUND: 'O arquivo solicitado não foi localizado no bucket.',
  BULK_PARTIAL_FAILURE: 'Alguns itens não puderam ser processados na operação em lote.',
  BULK_DESTINATION_CONFLICT: 'Já existe um arquivo com o mesmo nome no destino e a sobrescrita está desativada.',
  CLOUDFLARE_AUTH_FAILED: 'Falha de autenticação com as credenciais Cloudflare R2 fornecidas.',
  CLOUDFLARE_ENDPOINT_ERROR: 'Não foi possível comunicar com o endpoint S3 do Cloudflare R2.',
  UPLOAD_FILE_REQUIRED: 'Selecione ou arraste pelo menos um arquivo para enviar.',
  NETWORK_UNREACHABLE: 'Falha de conexão com a API. Verifique se o servidor está acessível.',
};

export function parseApiError(error: unknown): ParsedClientError {
  if (isApiErrorResponse(error)) {
    const validationDetails = error.validationErrors
      ? Object.entries(error.validationErrors).flatMap(([field, msgs]) =>
          msgs.map((m) => `${field}: ${m}`),
        )
      : [];

    const mapped = ERROR_CODE_MAP[error.errorCode];
    return {
      title: error.title || 'Erro na operação',
      userMessage: mapped ?? error.detail ?? 'Ocorreu um erro inesperado ao processar a solicitação.',
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
      title: isNetwork ? 'Falha de Rede' : 'Erro do Cliente',
      userMessage: isNetwork ? ERROR_CODE_MAP.NETWORK_UNREACHABLE : error.message,
      errorCode: isNetwork ? 'NETWORK_UNREACHABLE' : 'CLIENT_RUNTIME_ERROR',
      status: 0,
      validationDetails: [],
      rawDetail: error.message,
    };
  }

  return {
    title: 'Erro Desconhecido',
    userMessage: 'Não foi possível concluir a operação solicitada.',
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
