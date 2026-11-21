export type R2LocationHint = 'WNAM' | 'ENAM' | 'WEUR' | 'EEUR' | 'APAC';
export type R2StorageClass = 'Standard' | 'InfrequentAccess';
export type ConnectionMode = 'sandbox' | 'cloudflare';
export type LogSinkId = 'RollingFile' | 'ApplicationInsights' | 'Seq' | 'ElkStack';

export interface CloudflareCredentials {
  accountId: string;
  apiToken: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface BucketSummary {
  name: string;
  createdAt: string;
  locationHint: R2LocationHint;
  storageClass: R2StorageClass;
  objectCount: number;
  totalBytes: number;
  publicDomain?: string;
  corsEnabled: boolean;
}

export interface DirectoryEntry {
  prefix: string;
  name: string;
  hasMarkerObject: boolean;
}

export interface R2ObjectItem {
  bucket: string;
  key: string;
  fileName: string;
  parentPrefix: string;
  size: number;
  lastModified: string;
  etag: string;
  contentType: string;
  storageClass: R2StorageClass;
  isFolderMarker: boolean;
  metadata: Record<string, string>;
}

export interface DirectoryListing {
  bucket: string;
  prefix: string;
  folders: DirectoryEntry[];
  objects: R2ObjectItem[];
  totalObjectsInPrefix: number;
  isTruncated: boolean;
  nextContinuationToken?: string;
}

export interface CreateBucketRequest {
  name: string;
  locationHint: R2LocationHint;
  storageClass: R2StorageClass;
}

export interface CreateFolderRequest {
  prefix: string;
  createMarkerObject: boolean;
}

export interface SaveObjectContentRequest {
  key: string;
  content: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface SearchRequest {
  query?: string;
  bucket?: string;
  tagKey?: string;
  tagValue?: string;
  contentType?: string;
}

export interface SearchResultItem extends R2ObjectItem {
  matchedOn: Array<'key' | 'fileName' | 'metadataKey' | 'metadataValue'>;
}

export interface SearchResponse {
  query: SearchRequest;
  totalMatches: number;
  bucketsScanned: number;
  elapsedMs: number;
  results: SearchResultItem[];
}

export interface BulkDeleteRequest {
  bucket: string;
  keys: string[];
  recursiveFolders?: boolean;
}

export interface BulkMoveRequest {
  sourceBucket: string;
  destinationBucket: string;
  destinationPrefix: string;
  keys: string[];
  overwrite?: boolean;
}

export interface BulkItemFailure {
  key: string;
  errorCode: string;
  reason: string;
}

export interface BulkOperationResult {
  operation: 'delete' | 'move';
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  succeededKeys: string[];
  failures: BulkItemFailure[];
  elapsedMs: number;
}

export interface PresignedUrlResponse {
  bucket: string;
  key: string;
  url: string;
  expiresAt: string;
  expiresInSeconds: number;
}

export interface ObjectPreviewResponse {
  bucket: string;
  key: string;
  contentType: string;
  size: number;
  isText: boolean;
  textContent?: string;
  dataUrl?: string;
  metadata: Record<string, string>;
}

export interface ApiErrorResponse {
  type: string;
  title: string;
  status: number;
  detail: string;
  errorCode: string;
  traceId: string;
  timestamp: string;
  instance?: string;
  validationErrors?: Record<string, string[]>;
  partialFailures?: BulkItemFailure[];
}

export type R2OperationName =
  | 'ListBuckets'
  | 'CreateBucket'
  | 'DeleteBucket'
  | 'ListObjectsV2'
  | 'CreateFolderMarker'
  | 'PutObject'
  | 'GetObject'
  | 'PresignUrl'
  | 'SearchObjects'
  | 'BulkDelete'
  | 'BulkMove';

export interface OperationMetricSummary {
  operation: R2OperationName;
  count: number;
  errorCount: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  totalBytes: number;
}

export interface LogSinkConfig {
  id: LogSinkId;
  label: string;
  enabled: boolean;
  endpointOrPath: string;
  protocol: string;
  workerForwardingEnabled: boolean;
}

export interface StructuredLogEntry {
  id: string;
  timestamp: string;
  level: 'Information' | 'Warning' | 'Error' | 'Debug';
  source: 'DotNetApi' | 'CloudflareWorker' | 'ExpressGateway';
  traceId: string;
  operation: string;
  message: string;
  durationMs: number;
  statusCode: number;
  bucket?: string;
  objectKey?: string;
  errorCode?: string;
  sinks: LogSinkId[];
}

export interface BucketTelemetrySummary {
  bucket: string;
  storageBytes: number;
  storageMb: number;
  objectCount: number;
  requestCount: number;
  egressBytes: number;
  egressMb: number;
  r2StorageCostUsd: number;
  r2EgressCostUsd: number;
  s3EquivalentEgressUsd: number;
}

export interface PerformanceMetricsSnapshot {
  uptimeSeconds: number;
  totalRequests: number;
  totalErrors: number;
  errorRatePercent: number;
  totalBytesTransferred: number;
  overallAvgMs: number;
  overallP95Ms: number;
  operations: OperationMetricSummary[];
  bucketMetrics: BucketTelemetrySummary[];
  sinks: LogSinkConfig[];
  recentWorkerTimingHeader: string;
}

export interface MonorepoFile {
  path: string;
  stack: 'backend-dotnet10' | 'frontend-expo' | 'infra-wrangler' | 'docs';
  language: 'csharp' | 'xml' | 'json' | 'typescript' | 'toml' | 'bash' | 'yaml' | 'markdown';
  summary: string;
  content: string;
}
