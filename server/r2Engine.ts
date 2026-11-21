import crypto from 'node:crypto';
import {
  S3Client,
  ListBucketsCommand,
  CreateBucketCommand,
  DeleteBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppApiError } from './errors';
import { normalizePrefix } from '../src/shared/errorHandler';
import type {
  BucketSummary,
  BulkDeleteRequest,
  BulkItemFailure,
  BulkMoveRequest,
  BulkOperationResult,
  CloudflareCredentials,
  ConnectionMode,
  CreateBucketRequest,
  DirectoryEntry,
  DirectoryListing,
  ObjectPreviewResponse,
  PresignedUrlResponse,
  R2LocationHint,
  R2ObjectItem,
  R2StorageClass,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
} from '../src/shared/types';

interface SandboxObjectRecord {
  key: string;
  content: Buffer;
  contentType: string;
  lastModified: string;
  etag: string;
  storageClass: R2StorageClass;
  metadata: Record<string, string>;
}

interface SandboxBucketRecord {
  name: string;
  createdAt: string;
  locationHint: R2LocationHint;
  storageClass: R2StorageClass;
  publicDomain?: string;
  corsEnabled: boolean;
  objects: Map<string, SandboxObjectRecord>;
}

const BUCKET_NAME_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export function validateBucketName(name: string): void {
  if (!name || !BUCKET_NAME_REGEX.test(name)) {
    throw new AppApiError({
      status: 400,
      errorCode: 'BUCKET_NAME_INVALID',
      title: 'Invalid Bucket Name',
      detail: 'Bucket names must be 3-63 characters long using lowercase letters, numbers, and hyphens.',
      validationErrors: {
        name: ['Use 3-63 lowercase alphanumeric characters or hyphens without leading/trailing hyphens.'],
      },
    });
  }
}

export function validateFolderPrefix(prefix: string): string {
  const cleaned = prefix.trim().replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..') || cleaned.includes('\\')) {
    throw new AppApiError({
      status: 400,
      errorCode: 'FOLDER_INVALID_NAME',
      title: 'Invalid Directory Prefix',
      detail: 'Folder paths cannot be empty or contain relative traversal segments (.. or \\).',
      validationErrors: {
        prefix: ['Provide a valid folder path such as "releases/v2.5/".'],
      },
    });
  }
  return normalizePrefix(cleaned);
}

export class R2StorageEngine {
  private readonly sandboxBuckets = new Map<string, SandboxBucketRecord>();

  constructor() {
    this.seedSandbox();
  }

  private seedSandbox(): void {
    const now = new Date('2026-11-20T14:30:00.000Z').toISOString();

    const prodBucket: SandboxBucketRecord = {
      name: 'buckets-prod-assets',
      createdAt: '2026-09-12T10:15:00.000Z',
      locationHint: 'ENAM',
      storageClass: 'Standard',
      publicDomain: 'cdn.buckets.dev',
      corsEnabled: true,
      objects: new Map(),
    };

    const mobileBucket: SandboxBucketRecord = {
      name: 'buckets-mobile-builds',
      createdAt: '2026-10-03T08:00:00.000Z',
      locationHint: 'WNAM',
      storageClass: 'Standard',
      corsEnabled: true,
      objects: new Map(),
    };

    const logsBucket: SandboxBucketRecord = {
      name: 'buckets-edge-logs',
      createdAt: '2026-11-01T00:00:00.000Z',
      locationHint: 'WEUR',
      storageClass: 'InfrequentAccess',
      corsEnabled: false,
      objects: new Map(),
    };

    const seedFile = (
      bucket: SandboxBucketRecord,
      key: string,
      body: string,
      contentType: string,
      metadata: Record<string, string>,
      modified = now,
    ) => {
      const content = Buffer.from(body, 'utf-8');
      bucket.objects.set(key, {
        key,
        content,
        contentType,
        lastModified: modified,
        etag: `"${crypto.createHash('md5').update(content).digest('hex')}"`,
        storageClass: bucket.storageClass,
        metadata,
      });
    };

    // Hierarchical folder markers & nested assets in buckets-prod-assets
    seedFile(prodBucket, 'branding/', '', 'application/x-directory', { folder: 'true', team: 'design' });
    seedFile(
      prodBucket,
      'branding/palette.json',
      JSON.stringify(
        {
          system: 'Cloudflare Buckets',
          accent: '#EA580C',
          surfaceLight: '#FFFFFF',
          surfaceDark: '#111827',
        },
        null,
        2,
      ),
      'application/json',
      { env: 'production', team: 'design', tag: 'tokens' },
    );
    seedFile(
      prodBucket,
      'branding/icons/logo-mark.svg',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#EA580C"/><path d="M18 22h28l-4 24H22z" fill="#fff"/></svg>',
      'image/svg+xml',
      { env: 'production', team: 'design', format: 'vector' },
    );
    seedFile(
      prodBucket,
      'configs/wrangler/wrangler.prod.toml',
      'name = "buckets-edge-gateway"\nmain = "src/index.ts"\ncompatibility_date = "2026-11-01"\n\n[[r2_buckets]]\nbinding = "PROD_ASSETS"\nbucket_name = "buckets-prod-assets"\n',
      'application/toml',
      { env: 'production', iac: 'wrangler', owner: 'platform' },
    );
    seedFile(
      prodBucket,
      'README.md',
      '# Cloudflare Buckets Production Assets\n\nManaged via .NET Core 10 WebAPI + Official AWS S3 SDK for R2.\n',
      'text/markdown',
      { env: 'production', visibility: 'internal' },
    );

    // Mobile & Desktop builds bucket
    seedFile(mobileBucket, 'releases/', '', 'application/x-directory', { folder: 'true' });
    seedFile(
      mobileBucket,
      'releases/v2.4/manifest.json',
      JSON.stringify(
        {
          version: '2.4.0',
          expoSdk: '54.0.0',
          platforms: ['android', 'ios', 'web', 'windows', 'linux'],
          minDotNetApi: '10.0',
        },
        null,
        2,
      ),
      'application/json',
      { platform: 'universal', release: 'v2.4', channel: 'stable' },
    );
    seedFile(
      mobileBucket,
      'releases/v2.4/android/buckets-v2.4.aab.txt',
      'Simulated Android App Bundle artifact metadata for release v2.4.0 (SHA256 verified).',
      'text/plain',
      { platform: 'android', release: 'v2.4', arch: 'arm64-v8a' },
    );
    seedFile(
      mobileBucket,
      'releases/v2.4/windows/BucketsSetup.msix.txt',
      'Simulated Windows MSIX Universal Package manifest for react-native-windows.',
      'text/plain',
      { platform: 'windows', release: 'v2.4', arch: 'x64' },
    );
    seedFile(
      mobileBucket,
      'releases/v2.4/linux/buckets-linux-x86_64.AppImage.txt',
      'Simulated Linux AppImage desktop bundle metadata for Expo Universal.',
      'text/plain',
      { platform: 'linux', release: 'v2.4', arch: 'x86_64' },
    );

    // Logs bucket
    seedFile(
      logsBucket,
      '2026/11/21/api-telemetry.ndjson',
      '{"timestamp":"2026-11-21T12:00:00Z","level":"Information","service":"Buckets.Api","operation":"ListObjectsV2","durationMs":19}\n{"timestamp":"2026-11-21T12:01:12Z","level":"Information","service":"Buckets.Worker","operation":"PutObject","durationMs":34}\n',
      'application/x-ndjson',
      { sink: 'elk', retention: '30d', env: 'production' },
    );

    this.sandboxBuckets.set(prodBucket.name, prodBucket);
    this.sandboxBuckets.set(mobileBucket.name, mobileBucket);
    this.sandboxBuckets.set(logsBucket.name, logsBucket);
  }

  private createS3Client(creds: CloudflareCredentials): S3Client {
    if (!creds.accountId || !creds.accessKeyId || !creds.secretAccessKey) {
      throw new AppApiError({
        status: 401,
        errorCode: 'CLOUDFLARE_AUTH_FAILED',
        title: 'Missing Cloudflare R2 Credentials',
        detail: 'Account ID, Access Key ID, and Secret Access Key are required for Live Cloudflare Mode.',
      });
    }
    return new S3Client({
      region: 'auto',
      endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
      },
    });
  }

  public async listBuckets(
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<BucketSummary[]> {
    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const response = await s3.send(new ListBucketsCommand({}));
      return (response.Buckets ?? []).map((b) => ({
        name: b.Name ?? 'unknown',
        createdAt: (b.CreationDate ?? new Date()).toISOString(),
        locationHint: 'ENAM',
        storageClass: 'Standard',
        objectCount: 0,
        totalBytes: 0,
        corsEnabled: true,
      }));
    }

    return Array.from(this.sandboxBuckets.values())
      .map((b) => {
        let totalBytes = 0;
        let objectCount = 0;
        for (const obj of b.objects.values()) {
          if (!obj.key.endsWith('/')) {
            objectCount += 1;
            totalBytes += obj.content.byteLength;
          }
        }
        return {
          name: b.name,
          createdAt: b.createdAt,
          locationHint: b.locationHint,
          storageClass: b.storageClass,
          objectCount,
          totalBytes,
          publicDomain: b.publicDomain,
          corsEnabled: b.corsEnabled,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  public async createBucket(
    req: CreateBucketRequest,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<BucketSummary> {
    validateBucketName(req.name);

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      await s3.send(new CreateBucketCommand({ Bucket: req.name }));
      return {
        name: req.name,
        createdAt: new Date().toISOString(),
        locationHint: req.locationHint,
        storageClass: req.storageClass,
        objectCount: 0,
        totalBytes: 0,
        corsEnabled: false,
      };
    }

    if (this.sandboxBuckets.has(req.name)) {
      throw new AppApiError({
        status: 409,
        errorCode: 'BUCKET_ALREADY_EXISTS',
        title: 'Bucket Already Exists',
        detail: `Bucket "${req.name}" already exists in the workspace.`,
      });
    }

    const record: SandboxBucketRecord = {
      name: req.name,
      createdAt: new Date().toISOString(),
      locationHint: req.locationHint || 'ENAM',
      storageClass: req.storageClass || 'Standard',
      corsEnabled: true,
      objects: new Map(),
    };
    this.sandboxBuckets.set(record.name, record);

    return {
      name: record.name,
      createdAt: record.createdAt,
      locationHint: record.locationHint,
      storageClass: record.storageClass,
      objectCount: 0,
      totalBytes: 0,
      corsEnabled: record.corsEnabled,
    };
  }

  public async deleteBucket(
    bucketName: string,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<void> {
    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
      return;
    }

    const bucket = this.sandboxBuckets.get(bucketName);
    if (!bucket) {
      throw new AppApiError({
        status: 404,
        errorCode: 'BUCKET_NOT_FOUND',
        title: 'Bucket Not Found',
        detail: `Bucket "${bucketName}" does not exist.`,
      });
    }

    if (bucket.objects.size > 0) {
      throw new AppApiError({
        status: 409,
        errorCode: 'BUCKET_NOT_EMPTY',
        title: 'Bucket Not Empty',
        detail: `Bucket "${bucketName}" still contains ${bucket.objects.size} objects or folder markers. Delete its contents first.`,
      });
    }

    this.sandboxBuckets.delete(bucketName);
  }

  public async listDirectory(
    bucketName: string,
    rawPrefix: string,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<DirectoryListing> {
    const prefix = rawPrefix ? normalizePrefix(rawPrefix) : '';

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const res = await s3.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: prefix,
          Delimiter: '/',
          MaxKeys: 500,
        }),
      );

      const folders: DirectoryEntry[] = (res.CommonPrefixes ?? [])
        .map((cp) => cp.Prefix ?? '')
        .filter(Boolean)
        .map((folderPrefix) => ({
          prefix: folderPrefix,
          name: folderPrefix.slice(prefix.length).replace(/\/$/, ''),
          hasMarkerObject: false,
        }));

      const objects: R2ObjectItem[] = (res.Contents ?? [])
        .filter((obj) => obj.Key && obj.Key !== prefix && !obj.Key.endsWith('/'))
        .map((obj) => {
          const key = obj.Key!;
          const fileName = key.slice(prefix.length);
          return {
            bucket: bucketName,
            key,
            fileName,
            parentPrefix: prefix,
            size: obj.Size ?? 0,
            lastModified: (obj.LastModified ?? new Date()).toISOString(),
            etag: obj.ETag ?? '',
            contentType: 'application/octet-stream',
            storageClass: 'Standard',
            isFolderMarker: false,
            metadata: {},
          };
        });

      return {
        bucket: bucketName,
        prefix,
        folders,
        objects,
        totalObjectsInPrefix: objects.length,
        isTruncated: Boolean(res.IsTruncated),
        nextContinuationToken: res.NextContinuationToken,
      };
    }

    const bucket = this.sandboxBuckets.get(bucketName);
    if (!bucket) {
      throw new AppApiError({
        status: 404,
        errorCode: 'BUCKET_NOT_FOUND',
        title: 'Bucket Not Found',
        detail: `Bucket "${bucketName}" was not found.`,
      });
    }

    const folderMap = new Map<string, DirectoryEntry>();
    const objects: R2ObjectItem[] = [];

    for (const obj of bucket.objects.values()) {
      if (!obj.key.startsWith(prefix)) continue;
      if (obj.key === prefix) continue; // skip self folder marker

      const remainder = obj.key.slice(prefix.length);
      const slashIdx = remainder.indexOf('/');

      if (slashIdx !== -1) {
        const folderName = remainder.slice(0, slashIdx);
        const folderPrefix = `${prefix}${folderName}/`;
        const isExactMarker = remainder === `${folderName}/` && obj.content.byteLength === 0;
        const existing = folderMap.get(folderPrefix);
        folderMap.set(folderPrefix, {
          prefix: folderPrefix,
          name: folderName,
          hasMarkerObject: Boolean(existing?.hasMarkerObject || isExactMarker),
        });
      } else if (!obj.key.endsWith('/')) {
        objects.push({
          bucket: bucketName,
          key: obj.key,
          fileName: remainder,
          parentPrefix: prefix,
          size: obj.content.byteLength,
          lastModified: obj.lastModified,
          etag: obj.etag,
          contentType: obj.contentType,
          storageClass: obj.storageClass,
          isFolderMarker: false,
          metadata: { ...obj.metadata },
        });
      }
    }

    const folders = Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    objects.sort((a, b) => a.fileName.localeCompare(b.fileName));

    return {
      bucket: bucketName,
      prefix,
      folders,
      objects,
      totalObjectsInPrefix: objects.length,
      isTruncated: false,
    };
  }

  public async createFolder(
    bucketName: string,
    rawPrefix: string,
    createMarkerObject: boolean,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<DirectoryEntry> {
    const folderPrefix = validateFolderPrefix(rawPrefix);
    const parts = folderPrefix.split('/').filter(Boolean);
    const name = parts[parts.length - 1];

    if (mode === 'cloudflare' && creds) {
      if (createMarkerObject) {
        const s3 = this.createS3Client(creds);
        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: folderPrefix,
            Body: new Uint8Array(0),
            ContentType: 'application/x-directory',
            Metadata: { folder: 'true' },
            DisablePayloadSigning: true,
          } as ConstructorParameters<typeof PutObjectCommand>[0]),
        );
      }
      return { prefix: folderPrefix, name, hasMarkerObject: createMarkerObject };
    }

    const bucket = this.sandboxBuckets.get(bucketName);
    if (!bucket) {
      throw new AppApiError({
        status: 404,
        errorCode: 'BUCKET_NOT_FOUND',
        title: 'Bucket Not Found',
        detail: `Bucket "${bucketName}" was not found.`,
      });
    }

    if (createMarkerObject) {
      const empty = Buffer.alloc(0);
      bucket.objects.set(folderPrefix, {
        key: folderPrefix,
        content: empty,
        contentType: 'application/x-directory',
        lastModified: new Date().toISOString(),
        etag: `"${crypto.createHash('md5').update(empty).digest('hex')}"`,
        storageClass: bucket.storageClass,
        metadata: { folder: 'true' },
      });
    }

    return { prefix: folderPrefix, name, hasMarkerObject: createMarkerObject };
  }

  public async putObject(
    bucketName: string,
    key: string,
    content: Buffer,
    contentType: string,
    metadata: Record<string, string>,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<R2ObjectItem> {
    const cleanKey = key.replace(/^\/+/, '');
    if (!cleanKey) {
      throw new AppApiError({
        status: 400,
        errorCode: 'OBJECT_KEY_INVALID',
        title: 'Invalid Object Key',
        detail: 'Object key cannot be empty.',
      });
    }

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const putRes = await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: cleanKey,
          Body: content,
          ContentType: contentType,
          Metadata: metadata,
        }),
      );
      const lastSlash = cleanKey.lastIndexOf('/');
      return {
        bucket: bucketName,
        key: cleanKey,
        fileName: lastSlash >= 0 ? cleanKey.slice(lastSlash + 1) : cleanKey,
        parentPrefix: lastSlash >= 0 ? cleanKey.slice(0, lastSlash + 1) : '',
        size: content.byteLength,
        lastModified: new Date().toISOString(),
        etag: putRes.ETag ?? '',
        contentType,
        storageClass: 'Standard',
        isFolderMarker: cleanKey.endsWith('/'),
        metadata,
      };
    }

    const bucket = this.sandboxBuckets.get(bucketName);
    if (!bucket) {
      throw new AppApiError({
        status: 404,
        errorCode: 'BUCKET_NOT_FOUND',
        title: 'Bucket Not Found',
        detail: `Bucket "${bucketName}" was not found.`,
      });
    }

    const now = new Date().toISOString();
    const etag = `"${crypto.createHash('md5').update(content).digest('hex')}"`;
    bucket.objects.set(cleanKey, {
      key: cleanKey,
      content,
      contentType,
      lastModified: now,
      etag,
      storageClass: bucket.storageClass,
      metadata: { ...metadata },
    });

    const lastSlash = cleanKey.lastIndexOf('/');
    return {
      bucket: bucketName,
      key: cleanKey,
      fileName: lastSlash >= 0 ? cleanKey.slice(lastSlash + 1) : cleanKey,
      parentPrefix: lastSlash >= 0 ? cleanKey.slice(0, lastSlash + 1) : '',
      size: content.byteLength,
      lastModified: now,
      etag,
      contentType,
      storageClass: bucket.storageClass,
      isFolderMarker: cleanKey.endsWith('/'),
      metadata: { ...metadata },
    };
  }

  public async getObjectPreview(
    bucketName: string,
    key: string,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<ObjectPreviewResponse> {
    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const head = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
      const bytes = obj.Body ? Buffer.from(await obj.Body.transformToByteArray()) : Buffer.alloc(0);
      const contentType = head.ContentType || 'application/octet-stream';
      const isText = isTextMime(contentType, key);
      return {
        bucket: bucketName,
        key,
        contentType,
        size: bytes.byteLength,
        isText,
        textContent: isText ? bytes.subarray(0, 64 * 1024).toString('utf-8') : undefined,
        dataUrl: contentType.startsWith('image/')
          ? `data:${contentType};base64,${bytes.toString('base64')}`
          : undefined,
        metadata: head.Metadata ?? {},
      };
    }

    const bucket = this.sandboxBuckets.get(bucketName);
    const obj = bucket?.objects.get(key);
    if (!bucket || !obj) {
      throw new AppApiError({
        status: 404,
        errorCode: 'OBJECT_NOT_FOUND',
        title: 'Object Not Found',
        detail: `Object "${key}" was not found in bucket "${bucketName}".`,
      });
    }

    const isText = isTextMime(obj.contentType, key);
    return {
      bucket: bucketName,
      key: obj.key,
      contentType: obj.contentType,
      size: obj.content.byteLength,
      isText,
      textContent: isText ? obj.content.subarray(0, 64 * 1024).toString('utf-8') : undefined,
      dataUrl: obj.contentType.startsWith('image/')
        ? `data:${obj.contentType};base64,${obj.content.toString('base64')}`
        : undefined,
      metadata: { ...obj.metadata },
    };
  }

  public async getObjectBuffer(
    bucketName: string,
    key: string,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
      const buffer = obj.Body ? Buffer.from(await obj.Body.transformToByteArray()) : Buffer.alloc(0);
      const fileName = key.split('/').pop() || 'download.bin';
      return { buffer, contentType: obj.ContentType || 'application/octet-stream', fileName };
    }

    const bucket = this.sandboxBuckets.get(bucketName);
    const obj = bucket?.objects.get(key);
    if (!bucket || !obj) {
      throw new AppApiError({
        status: 404,
        errorCode: 'OBJECT_NOT_FOUND',
        title: 'Object Not Found',
        detail: `Object "${key}" does not exist in "${bucketName}".`,
      });
    }
    const fileName = key.split('/').pop() || 'download.bin';
    return { buffer: obj.content, contentType: obj.contentType, fileName };
  }

  public async presignUrl(
    bucketName: string,
    key: string,
    expiresInSeconds: number,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<PresignedUrlResponse> {
    const safeTtl = Math.min(Math.max(expiresInSeconds || 900, 60), 604800);
    const expiresAt = new Date(Date.now() + safeTtl * 1000).toISOString();

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: bucketName, Key: key }),
        { expiresIn: safeTtl },
      );
      return { bucket: bucketName, key, url, expiresAt, expiresInSeconds: safeTtl };
    }

    const bucket = this.sandboxBuckets.get(bucketName);
    if (!bucket || !bucket.objects.has(key)) {
      throw new AppApiError({
        status: 404,
        errorCode: 'OBJECT_NOT_FOUND',
        title: 'Object Not Found',
        detail: `Cannot generate presigned URL: "${key}" not found in "${bucketName}".`,
      });
    }

    const sig = crypto.createHash('sha256').update(`${bucketName}:${key}:${expiresAt}`).digest('hex').slice(0, 32);
    const url = `https://sandbox.r2.cloudflarestorage.com/${encodeURIComponent(bucketName)}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${safeTtl}&X-Amz-Signature=${sig}`;

    return { bucket: bucketName, key, url, expiresAt, expiresInSeconds: safeTtl };
  }

  public async searchObjects(
    request: SearchRequest,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<SearchResponse> {
    const started = performance.now();
    const q = (request.query ?? '').trim().toLowerCase();
    const tagKey = (request.tagKey ?? '').trim().toLowerCase();
    const tagValue = (request.tagValue ?? '').trim().toLowerCase();
    const contentTypeFilter = (request.contentType ?? '').trim().toLowerCase();

    const results: SearchResultItem[] = [];
    let bucketsScanned = 0;

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const buckets = request.bucket
        ? [{ name: request.bucket }]
        : await this.listBuckets('cloudflare', creds);

      for (const b of buckets) {
        bucketsScanned += 1;
        const listed = await s3.send(new ListObjectsV2Command({ Bucket: b.name, MaxKeys: 250 }));
        for (const obj of listed.Contents ?? []) {
          if (!obj.Key || obj.Key.endsWith('/')) continue;
          const key = obj.Key;
          const lastSlash = key.lastIndexOf('/');
          const fileName = lastSlash >= 0 ? key.slice(lastSlash + 1) : key;
          const matchedOn: SearchResultItem['matchedOn'] = [];
          if (!q || fileName.toLowerCase().includes(q)) matchedOn.push('fileName');
          if (!q || key.toLowerCase().includes(q)) matchedOn.push('key');
          if (q && matchedOn.length === 0) continue;

          results.push({
            bucket: b.name,
            key,
            fileName,
            parentPrefix: lastSlash >= 0 ? key.slice(0, lastSlash + 1) : '',
            size: obj.Size ?? 0,
            lastModified: (obj.LastModified ?? new Date()).toISOString(),
            etag: obj.ETag ?? '',
            contentType: 'application/octet-stream',
            storageClass: 'Standard',
            isFolderMarker: false,
            metadata: {},
            matchedOn,
          });
        }
      }

      return {
        query: request,
        totalMatches: results.length,
        bucketsScanned,
        elapsedMs: Math.round(performance.now() - started),
        results,
      };
    }

    const targetBuckets = request.bucket
      ? [this.sandboxBuckets.get(request.bucket)].filter((b): b is SandboxBucketRecord => Boolean(b))
      : Array.from(this.sandboxBuckets.values());

    for (const bucket of targetBuckets) {
      bucketsScanned += 1;
      for (const obj of bucket.objects.values()) {
        if (obj.key.endsWith('/')) continue;
        if (contentTypeFilter && !obj.contentType.toLowerCase().includes(contentTypeFilter)) {
          continue;
        }

        const lastSlash = obj.key.lastIndexOf('/');
        const fileName = lastSlash >= 0 ? obj.key.slice(lastSlash + 1) : obj.key;
        const matchedOn = new Set<SearchResultItem['matchedOn'][number]>();

        if (q) {
          if (fileName.toLowerCase().includes(q)) matchedOn.add('fileName');
          if (obj.key.toLowerCase().includes(q)) matchedOn.add('key');
          for (const [mk, mv] of Object.entries(obj.metadata)) {
            if (mk.toLowerCase().includes(q)) matchedOn.add('metadataKey');
            if (mv.toLowerCase().includes(q)) matchedOn.add('metadataValue');
          }
          if (matchedOn.size === 0) continue;
        }

        if (tagKey || tagValue) {
          let tagMatched = false;
          for (const [mk, mv] of Object.entries(obj.metadata)) {
            const kMatch = !tagKey || mk.toLowerCase().includes(tagKey);
            const vMatch = !tagValue || mv.toLowerCase().includes(tagValue);
            if (kMatch && vMatch) {
              tagMatched = true;
              if (tagKey) matchedOn.add('metadataKey');
              if (tagValue) matchedOn.add('metadataValue');
            }
          }
          if (!tagMatched) continue;
        }

        if (!q && !tagKey && !tagValue) {
          matchedOn.add('key');
        }

        results.push({
          bucket: bucket.name,
          key: obj.key,
          fileName,
          parentPrefix: lastSlash >= 0 ? obj.key.slice(0, lastSlash + 1) : '',
          size: obj.content.byteLength,
          lastModified: obj.lastModified,
          etag: obj.etag,
          contentType: obj.contentType,
          storageClass: obj.storageClass,
          isFolderMarker: false,
          metadata: { ...obj.metadata },
          matchedOn: Array.from(matchedOn),
        });
      }
    }

    return {
      query: request,
      totalMatches: results.length,
      bucketsScanned,
      elapsedMs: Math.max(1, Math.round(performance.now() - started)),
      results: results.sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  public async bulkDelete(
    req: BulkDeleteRequest,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<BulkOperationResult> {
    const started = performance.now();
    if (!req.keys || req.keys.length === 0) {
      throw new AppApiError({
        status: 400,
        errorCode: 'BULK_KEYS_REQUIRED',
        title: 'No Keys Selected',
        detail: 'Select at least one object or folder key to delete.',
      });
    }

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const res = await s3.send(
        new DeleteObjectsCommand({
          Bucket: req.bucket,
          Delete: { Objects: req.keys.map((Key) => ({ Key })) },
        }),
      );
      const succeededKeys = (res.Deleted ?? []).map((d) => d.Key ?? '').filter(Boolean);
      const failures: BulkItemFailure[] = (res.Errors ?? []).map((e) => ({
        key: e.Key ?? 'unknown',
        errorCode: e.Code ?? 'S3_DELETE_ERROR',
        reason: e.Message ?? 'Failed to delete key',
      }));
      return {
        operation: 'delete',
        requestedCount: req.keys.length,
        succeededCount: succeededKeys.length,
        failedCount: failures.length,
        succeededKeys,
        failures,
        elapsedMs: Math.max(1, Math.round(performance.now() - started)),
      };
    }

    const bucket = this.sandboxBuckets.get(req.bucket);
    if (!bucket) {
      throw new AppApiError({
        status: 404,
        errorCode: 'BUCKET_NOT_FOUND',
        title: 'Bucket Not Found',
        detail: `Bucket "${req.bucket}" was not found.`,
      });
    }

    const succeededKeys: string[] = [];
    const failures: BulkItemFailure[] = [];

    for (const rawKey of req.keys) {
      if (rawKey.endsWith('/') && req.recursiveFolders) {
        let deletedAny = false;
        for (const existingKey of Array.from(bucket.objects.keys())) {
          if (existingKey.startsWith(rawKey)) {
            bucket.objects.delete(existingKey);
            succeededKeys.push(existingKey);
            deletedAny = true;
          }
        }
        if (!deletedAny) {
          failures.push({
            key: rawKey,
            errorCode: 'OBJECT_NOT_FOUND',
            reason: `Folder prefix "${rawKey}" contained no matching objects.`,
          });
        }
      } else if (bucket.objects.has(rawKey)) {
        bucket.objects.delete(rawKey);
        succeededKeys.push(rawKey);
      } else {
        failures.push({
          key: rawKey,
          errorCode: 'OBJECT_NOT_FOUND',
          reason: `Key "${rawKey}" does not exist in "${req.bucket}".`,
        });
      }
    }

    return {
      operation: 'delete',
      requestedCount: req.keys.length,
      succeededCount: succeededKeys.length,
      failedCount: failures.length,
      succeededKeys,
      failures,
      elapsedMs: Math.max(1, Math.round(performance.now() - started)),
    };
  }

  public async bulkMove(
    req: BulkMoveRequest,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
  ): Promise<BulkOperationResult> {
    const started = performance.now();
    if (!req.keys || req.keys.length === 0) {
      throw new AppApiError({
        status: 400,
        errorCode: 'BULK_KEYS_REQUIRED',
        title: 'No Keys Selected',
        detail: 'Select at least one object to move.',
      });
    }

    const destPrefix = req.destinationPrefix ? normalizePrefix(req.destinationPrefix) : '';

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const succeededKeys: string[] = [];
      const failures: BulkItemFailure[] = [];

      for (const sourceKey of req.keys) {
        const fileName = sourceKey.split('/').filter(Boolean).pop() ?? sourceKey;
        const targetKey = `${destPrefix}${fileName}`;
        try {
          await s3.send(
            new CopyObjectCommand({
              Bucket: req.destinationBucket,
              Key: targetKey,
              CopySource: `${req.sourceBucket}/${encodeURIComponent(sourceKey)}`,
            }),
          );
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: req.sourceBucket,
              Delete: { Objects: [{ Key: sourceKey }] },
            }),
          );
          succeededKeys.push(targetKey);
        } catch (err) {
          failures.push({
            key: sourceKey,
            errorCode: 'R2_MOVE_FAILED',
            reason: err instanceof Error ? err.message : 'Move failed',
          });
        }
      }

      return {
        operation: 'move',
        requestedCount: req.keys.length,
        succeededCount: succeededKeys.length,
        failedCount: failures.length,
        succeededKeys,
        failures,
        elapsedMs: Math.max(1, Math.round(performance.now() - started)),
      };
    }

    const srcBucket = this.sandboxBuckets.get(req.sourceBucket);
    const dstBucket = this.sandboxBuckets.get(req.destinationBucket);
    if (!srcBucket || !dstBucket) {
      throw new AppApiError({
        status: 404,
        errorCode: 'BUCKET_NOT_FOUND',
        title: 'Bucket Not Found',
        detail: `Source or destination bucket was not found.`,
      });
    }

    const succeededKeys: string[] = [];
    const failures: BulkItemFailure[] = [];

    for (const sourceKey of req.keys) {
      const srcObj = srcBucket.objects.get(sourceKey);
      if (!srcObj) {
        failures.push({
          key: sourceKey,
          errorCode: 'OBJECT_NOT_FOUND',
          reason: `Source key "${sourceKey}" not found in "${req.sourceBucket}".`,
        });
        continue;
      }

      const fileName = sourceKey.split('/').filter(Boolean).pop() ?? sourceKey;
      const targetKey = sourceKey.endsWith('/') ? `${destPrefix}${fileName}/` : `${destPrefix}${fileName}`;

      if (targetKey === sourceKey && req.destinationBucket === req.sourceBucket) {
        failures.push({
          key: sourceKey,
          errorCode: 'BULK_SAME_LOCATION',
          reason: 'Source and destination keys are identical.',
        });
        continue;
      }

      if (dstBucket.objects.has(targetKey) && !req.overwrite) {
        failures.push({
          key: sourceKey,
          errorCode: 'BULK_DESTINATION_CONFLICT',
          reason: `Target "${targetKey}" already exists and overwrite is disabled.`,
        });
        continue;
      }

      dstBucket.objects.set(targetKey, {
        ...srcObj,
        key: targetKey,
        lastModified: new Date().toISOString(),
        storageClass: dstBucket.storageClass,
      });
      srcBucket.objects.delete(sourceKey);
      succeededKeys.push(targetKey);
    }

    return {
      operation: 'move',
      requestedCount: req.keys.length,
      succeededCount: succeededKeys.length,
      failedCount: failures.length,
      succeededKeys,
      failures,
      elapsedMs: Math.max(1, Math.round(performance.now() - started)),
    };
  }
}

function isTextMime(contentType: string, key: string): boolean {
  if (
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('toml') ||
    contentType.includes('javascript') ||
    contentType.includes('ndjson')
  ) {
    return true;
  }
  return /\.(md|txt|json|toml|yml|yaml|cs|ts|tsx|js|sh|xml|csv|log|ndjson)$/i.test(key);
}
