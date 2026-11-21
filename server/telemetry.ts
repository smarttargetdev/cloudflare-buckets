import crypto from 'node:crypto';
import type {
  BucketSummary,
  BucketTelemetrySummary,
  LogSinkConfig,
  LogSinkId,
  OperationMetricSummary,
  PerformanceMetricsSnapshot,
  R2OperationName,
  StructuredLogEntry,
} from '../src/shared/types';

interface OpSample {
  durations: number[];
  errorCount: number;
  totalBytes: number;
}

interface BucketUsageCounter {
  requestCount: number;
  egressBytes: number;
}

const ALL_OPERATIONS: R2OperationName[] = [
  'ListBuckets',
  'CreateBucket',
  'DeleteBucket',
  'ListObjectsV2',
  'CreateFolderMarker',
  'PutObject',
  'GetObject',
  'PresignUrl',
  'SearchObjects',
  'BulkDelete',
  'BulkMove',
];

export class BucketsTelemetry {
  private readonly startedAt = Date.now();
  private readonly samples = new Map<R2OperationName, OpSample>();
  private readonly bucketUsage = new Map<string, BucketUsageCounter>();
  private readonly logs: StructuredLogEntry[] = [];
  private readonly maxLogs = 250;
  private sinks: LogSinkConfig[] = [
    {
      id: 'RollingFile',
      label: 'Serilog Rolling File (.NET 10)',
      enabled: true,
      endpointOrPath: '/var/log/buckets/api-.log (daily, 30d retention)',
      protocol: 'CLEF / JSON Lines',
      workerForwardingEnabled: false,
    },
    {
      id: 'Seq',
      label: 'Datalust Seq (Centralized Logs)',
      enabled: true,
      endpointOrPath: 'https://seq.internal.buckets.dev/ingest/clef',
      protocol: 'HTTP CLEF Batch',
      workerForwardingEnabled: true,
    },
    {
      id: 'ApplicationInsights',
      label: 'Azure Application Insights',
      enabled: true,
      endpointOrPath: 'InstrumentationKey=***;IngestionEndpoint=https://eastus.in.applicationinsights.azure.com',
      protocol: 'OpenTelemetry / TelemetryClient',
      workerForwardingEnabled: true,
    },
    {
      id: 'ElkStack',
      label: 'ELK Stack (Elasticsearch + Kibana)',
      enabled: false,
      endpointOrPath: 'https://elastic.internal.buckets.dev:9200/buckets-r2-logs-*',
      protocol: 'Elastic Bulk NDJSON',
      workerForwardingEnabled: true,
    },
  ];

  constructor() {
    for (const op of ALL_OPERATIONS) {
      this.samples.set(op, { durations: [], errorCount: 0, totalBytes: 0 });
    }
    this.seedInitialTelemetry();
  }

  private seedInitialTelemetry(): void {
    this.bucketUsage.set('buckets-prod-assets', { requestCount: 1420, egressBytes: 428 * 1024 * 1024 });
    this.bucketUsage.set('buckets-mobile-builds', { requestCount: 685, egressBytes: 1840 * 1024 * 1024 });
    this.bucketUsage.set('buckets-edge-logs', { requestCount: 312, egressBytes: 96 * 1024 * 1024 });

    this.recordOperation({
      operation: 'ListBuckets',
      durationMs: 18,
      bytes: 2048,
      statusCode: 200,
      source: 'DotNetApi',
      traceId: 'seed-trace-0001',
      message: 'Initialized R2 Bucket catalog via ListBuckets.',
    });
    this.recordOperation({
      operation: 'ListObjectsV2',
      durationMs: 24,
      bytes: 16384,
      statusCode: 200,
      source: 'CloudflareWorker',
      bucket: 'buckets-prod-assets',
      traceId: 'seed-trace-0002',
      message: 'Edge Worker listed root directory prefix with Delimiter="/".',
    });
    this.recordOperation({
      operation: 'PutObject',
      durationMs: 41,
      bytes: 524288,
      statusCode: 200,
      source: 'DotNetApi',
      bucket: 'buckets-mobile-builds',
      objectKey: 'releases/v2.4/app-universal.aab',
      traceId: 'seed-trace-0003',
      message: 'Uploaded object with DisablePayloadSigning=true and custom metadata tags.',
    });
  }

  public getEnabledSinkIds(): LogSinkId[] {
    return this.sinks.filter((s) => s.enabled).map((s) => s.id);
  }

  public updateSink(id: LogSinkId, patch: Partial<Pick<LogSinkConfig, 'enabled' | 'workerForwardingEnabled' | 'endpointOrPath'>>): LogSinkConfig[] {
    this.sinks = this.sinks.map((sink) => (sink.id === id ? { ...sink, ...patch } : sink));
    this.recordOperation({
      operation: 'ListBuckets',
      durationMs: 4,
      bytes: 0,
      statusCode: 200,
      source: 'ExpressGateway',
      traceId: crypto.randomUUID().slice(0, 12),
      message: `Updated centralized logging sink configuration for ${id}.`,
    });
    return this.sinks;
  }

  public recordOperation(input: {
    operation: R2OperationName;
    durationMs: number;
    bytes?: number;
    statusCode: number;
    source?: StructuredLogEntry['source'];
    traceId: string;
    bucket?: string;
    objectKey?: string;
    errorCode?: string;
    message: string;
  }): void {
    const sample = this.samples.get(input.operation) ?? {
      durations: [],
      errorCount: 0,
      totalBytes: 0,
    };

    const safeDuration = Math.max(1, Math.round(input.durationMs));
    sample.durations.push(safeDuration);
    if (sample.durations.length > 500) {
      sample.durations.shift();
    }
    if (input.statusCode >= 400) {
      sample.errorCount += 1;
    }
    if (input.bytes && input.bytes > 0) {
      sample.totalBytes += input.bytes;
    }
    this.samples.set(input.operation, sample);

    const level: StructuredLogEntry['level'] =
      input.statusCode >= 500 ? 'Error' : input.statusCode >= 400 ? 'Warning' : 'Information';

    const entry: StructuredLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      source: input.source ?? 'ExpressGateway',
      traceId: input.traceId,
      operation: input.operation,
      message: input.message,
      durationMs: safeDuration,
      statusCode: input.statusCode,
      bucket: input.bucket,
      objectKey: input.objectKey,
      errorCode: input.errorCode,
      sinks: this.getEnabledSinkIds(),
    };

    if (input.bucket && input.bucket !== '*') {
      const prev = this.bucketUsage.get(input.bucket) ?? { requestCount: 0, egressBytes: 0 };
      prev.requestCount += 1;
      if (
        input.bytes &&
        input.bytes > 0 &&
        (input.operation === 'GetObject' || input.operation === 'ListObjectsV2' || input.operation === 'SearchObjects')
      ) {
        prev.egressBytes += input.bytes;
      }
      this.bucketUsage.set(input.bucket, prev);
    }

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.length = this.maxLogs;
    }
  }

  public getLogs(filter?: { level?: string; operation?: string; q?: string }): StructuredLogEntry[] {
    return this.logs.filter((log) => {
      if (filter?.level && filter.level !== 'ALL' && log.level !== filter.level) return false;
      if (filter?.operation && filter.operation !== 'ALL' && log.operation !== filter.operation) return false;
      if (filter?.q) {
        const needle = filter.q.toLowerCase();
        const hay = `${log.message} ${log.traceId} ${log.bucket ?? ''} ${log.objectKey ?? ''} ${log.errorCode ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }

  public exportLogs(
    format: 'csv' | 'json',
    filter?: { level?: string; operation?: string; q?: string },
  ): { content: string; mimeType: string; extension: 'csv' | 'json' } {
    const entries = this.getLogs(filter);
    if (format === 'csv') {
      const header = [
        'id',
        'timestamp',
        'level',
        'source',
        'traceId',
        'operation',
        'statusCode',
        'durationMs',
        'bucket',
        'objectKey',
        'errorCode',
        'sinks',
        'message',
      ].join(',');

      const escapeCsv = (val: unknown): string => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = entries.map((e) =>
        [
          e.id,
          e.timestamp,
          e.level,
          e.source,
          e.traceId,
          e.operation,
          e.statusCode,
          e.durationMs,
          e.bucket ?? '',
          e.objectKey ?? '',
          e.errorCode ?? '',
          e.sinks.join('|'),
          e.message,
        ]
          .map(escapeCsv)
          .join(','),
      );
      return {
        content: [header, ...rows].join('\n'),
        mimeType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
    }

    return {
      content: JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          system: 'Cloudflare Buckets',
          totalEntries: entries.length,
          logs: entries,
        },
        null,
        2,
      ),
      mimeType: 'application/json; charset=utf-8',
      extension: 'json',
    };
  }

  public getMetricsSnapshot(buckets: BucketSummary[] = []): PerformanceMetricsSnapshot {
    let totalRequests = 0;
    let totalErrors = 0;
    let totalBytesTransferred = 0;
    const allDurations: number[] = [];

    const operations: OperationMetricSummary[] = ALL_OPERATIONS.map((op) => {
      const sample = this.samples.get(op)!;
      const count = sample.durations.length;
      totalRequests += count;
      totalErrors += sample.errorCount;
      totalBytesTransferred += sample.totalBytes;
      allDurations.push(...sample.durations);

      const sorted = [...sample.durations].sort((a, b) => a - b);
      const sum = sorted.reduce((acc, v) => acc + v, 0);
      const avgMs = count > 0 ? Math.round((sum / count) * 10) / 10 : 0;
      const p50Ms = count > 0 ? sorted[Math.floor(0.5 * (count - 1))] : 0;
      const p95Ms = count > 0 ? sorted[Math.floor(0.95 * (count - 1))] : 0;
      const maxMs = count > 0 ? sorted[count - 1] : 0;

      return {
        operation: op,
        count,
        errorCount: sample.errorCount,
        avgMs,
        p50Ms,
        p95Ms,
        maxMs,
        totalBytes: sample.totalBytes,
      };
    });

    const sortedAll = [...allDurations].sort((a, b) => a - b);
    const overallAvgMs =
      sortedAll.length > 0
        ? Math.round((sortedAll.reduce((a, b) => a + b, 0) / sortedAll.length) * 10) / 10
        : 0;
    const overallP95Ms =
      sortedAll.length > 0 ? sortedAll[Math.floor(0.95 * (sortedAll.length - 1))] : 0;

    const bucketMetrics: BucketTelemetrySummary[] = buckets.map((b) => {
      const usage = this.bucketUsage.get(b.name) ?? { requestCount: 0, egressBytes: 0 };
      const storageGb = b.totalBytes / (1024 * 1024 * 1024);
      const egressGb = usage.egressBytes / (1024 * 1024 * 1024);
      return {
        bucket: b.name,
        storageBytes: b.totalBytes,
        storageMb: Math.round((b.totalBytes / (1024 * 1024)) * 1000) / 1000,
        objectCount: b.objectCount,
        requestCount: usage.requestCount,
        egressBytes: usage.egressBytes,
        egressMb: Math.round((usage.egressBytes / (1024 * 1024)) * 100) / 100,
        r2StorageCostUsd: Math.round(storageGb * 0.015 * 10000) / 10000,
        r2EgressCostUsd: 0,
        s3EquivalentEgressUsd: Math.round(egressGb * 0.09 * 100) / 100,
      };
    });

    return {
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      totalRequests,
      totalErrors,
      errorRatePercent:
        totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 1000) / 10 : 0,
      totalBytesTransferred,
      overallAvgMs,
      overallP95Ms,
      operations,
      bucketMetrics,
      sinks: this.sinks,
      recentWorkerTimingHeader: `r2-op;dur=${overallAvgMs};desc="Cloudflare R2 Edge Proxy", api;dur=${overallP95Ms}`,
    };
  }
}
