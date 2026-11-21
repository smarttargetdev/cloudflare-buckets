import { logClientError, parseApiError, type ParsedClientError } from '../shared/errorHandler';
import type {
  BucketSummary,
  BulkDeleteRequest,
  BulkMoveRequest,
  BulkOperationResult,
  CloudflareCredentials,
  ConnectionMode,
  CreateBucketRequest,
  DirectoryEntry,
  DirectoryListing,
  LogSinkConfig,
  LogSinkId,
  ObjectPreviewResponse,
  PerformanceMetricsSnapshot,
  PresignedUrlResponse,
  R2ObjectItem,
  SearchRequest,
  SearchResponse,
  StructuredLogEntry,
} from '../shared/types';

export interface ApiConnectionConfig {
  mode: ConnectionMode;
  credentials: CloudflareCredentials;
}

class BucketsApiClient {
  private config: ApiConnectionConfig = {
    mode: 'sandbox',
    credentials: {
      accountId: '',
      apiToken: '',
      accessKeyId: '',
      secretAccessKey: '',
    },
  };

  public setConnectionConfig(config: ApiConnectionConfig): void {
    this.config = config;
  }

  public getConnectionConfig(): ApiConnectionConfig {
    return this.config;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      'x-buckets-mode': this.config.mode,
      ...extra,
    };
    if (this.config.mode === 'cloudflare') {
      headers['x-cf-account-id'] = this.config.credentials.accountId;
      headers['x-cf-api-token'] = this.config.credentials.apiToken;
      headers['x-r2-access-key'] = this.config.credentials.accessKeyId;
      headers['x-r2-secret-key'] = this.config.credentials.secretAccessKey;
    }
    return headers;
  }

  private async request<T>(url: string, init: RequestInit = {}, context = 'ApiCall'): Promise<T> {
    try {
      const headers = this.buildHeaders(init.headers as Record<string, string> | undefined);
      const res = await fetch(url, { ...init, headers });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          body = new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        const parsed = parseApiError(body);
        logClientError(context, parsed);
        throw parsed;
      }
      return (await res.json()) as T;
    } catch (err) {
      if (isParsedClientError(err)) {
        throw err;
      }
      const parsed = parseApiError(err);
      logClientError(context, parsed);
      throw parsed;
    }
  }

  public listBuckets(): Promise<BucketSummary[]> {
    return this.request<BucketSummary[]>('/api/buckets', {}, 'ListBuckets');
  }

  public createBucket(req: CreateBucketRequest): Promise<BucketSummary> {
    return this.request<BucketSummary>(
      '/api/buckets',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      'CreateBucket',
    );
  }

  public deleteBucket(bucket: string): Promise<{ deleted: boolean; bucket: string }> {
    return this.request(
      `/api/buckets/${encodeURIComponent(bucket)}`,
      { method: 'DELETE' },
      'DeleteBucket',
    );
  }

  public listDirectory(bucket: string, prefix = ''): Promise<DirectoryListing> {
    const qs = prefix ? `?prefix=${encodeURIComponent(prefix)}` : '';
    return this.request<DirectoryListing>(
      `/api/buckets/${encodeURIComponent(bucket)}/objects${qs}`,
      {},
      'ListDirectory',
    );
  }

  public createFolder(
    bucket: string,
    prefix: string,
    createMarkerObject = true,
  ): Promise<DirectoryEntry> {
    return this.request<DirectoryEntry>(
      `/api/buckets/${encodeURIComponent(bucket)}/folders`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix, createMarkerObject }),
      },
      'CreateFolder',
    );
  }

  public async uploadFile(
    bucket: string,
    prefix: string,
    file: File,
    metadata: Record<string, string>,
  ): Promise<R2ObjectItem> {
    const form = new FormData();
    form.append('file', file);
    form.append('prefix', prefix);
    form.append('metadata', JSON.stringify(metadata));

    try {
      const res = await fetch(`/api/buckets/${encodeURIComponent(bucket)}/objects/upload`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: form,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => new Error(`HTTP ${res.status}`));
        const parsed = parseApiError(body);
        logClientError('UploadFile', parsed);
        throw parsed;
      }
      return (await res.json()) as R2ObjectItem;
    } catch (err) {
      if (isParsedClientError(err)) throw err;
      const parsed = parseApiError(err);
      logClientError('UploadFile', parsed);
      throw parsed;
    }
  }

  public previewObject(bucket: string, key: string): Promise<ObjectPreviewResponse> {
    return this.request<ObjectPreviewResponse>(
      `/api/buckets/${encodeURIComponent(bucket)}/objects/preview?key=${encodeURIComponent(key)}`,
      {},
      'PreviewObject',
    );
  }

  public presignObject(
    bucket: string,
    key: string,
    expiresInSeconds = 900,
  ): Promise<PresignedUrlResponse> {
    return this.request<PresignedUrlResponse>(
      `/api/buckets/${encodeURIComponent(bucket)}/objects/presign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, expiresInSeconds }),
      },
      'PresignObject',
    );
  }

  public searchObjects(query: SearchRequest): Promise<SearchResponse> {
    const params = new URLSearchParams();
    if (query.query) params.set('q', query.query);
    if (query.bucket) params.set('bucket', query.bucket);
    if (query.tagKey) params.set('tagKey', query.tagKey);
    if (query.tagValue) params.set('tagValue', query.tagValue);
    if (query.contentType) params.set('contentType', query.contentType);
    return this.request<SearchResponse>(`/api/search?${params.toString()}`, {}, 'SearchObjects');
  }

  public bulkDelete(req: BulkDeleteRequest): Promise<BulkOperationResult> {
    return this.request<BulkOperationResult>(
      '/api/objects/bulk-delete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      'BulkDelete',
    );
  }

  public bulkMove(req: BulkMoveRequest): Promise<BulkOperationResult> {
    return this.request<BulkOperationResult>(
      '/api/objects/bulk-move',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      },
      'BulkMove',
    );
  }

  public getMetrics(): Promise<PerformanceMetricsSnapshot> {
    return this.request<PerformanceMetricsSnapshot>('/api/telemetry/metrics', {}, 'GetMetrics');
  }

  public getLogs(filter?: { level?: string; operation?: string; q?: string }): Promise<StructuredLogEntry[]> {
    const params = new URLSearchParams();
    if (filter?.level) params.set('level', filter.level);
    if (filter?.operation) params.set('operation', filter.operation);
    if (filter?.q) params.set('q', filter.q);
    return this.request<StructuredLogEntry[]>(`/api/telemetry/logs?${params.toString()}`, {}, 'GetLogs');
  }

  public updateSink(
    id: LogSinkId,
    patch: Partial<Pick<LogSinkConfig, 'enabled' | 'workerForwardingEnabled'>>,
  ): Promise<LogSinkConfig[]> {
    return this.request<LogSinkConfig[]>(
      '/api/telemetry/sinks',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...patch }),
      },
      'UpdateSink',
    );
  }

  public getDownloadUrl(bucket: string, key: string): string {
    return `/api/buckets/${encodeURIComponent(bucket)}/objects/download?key=${encodeURIComponent(key)}`;
  }
}

function isParsedClientError(err: unknown): err is ParsedClientError {
  return Boolean(err && typeof err === 'object' && 'errorCode' in err && 'userMessage' in err);
}

export const apiClient = new BucketsApiClient();
