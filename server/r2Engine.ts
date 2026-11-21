import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
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
import { normalizePrefix } from '../manager/shared/errorHandler';
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
  LocalFolderInspectResponse,
  ObjectPreviewResponse,
  PresignedUrlResponse,
  R2LocationHint,
  R2ObjectItem,
  R2StorageClass,
  SearchRequest,
  SearchResponse,
  SearchResultItem,
} from '../manager/shared/types';

const LOCAL_META_FILENAME = '.buckets-meta.json';

interface LocalBucketMeta {
  createdAt: string;
  locationHint: R2LocationHint;
  storageClass: R2StorageClass;
  publicDomain?: string;
  corsEnabled: boolean;
  folders: string[];
  objects: Record<
    string,
    {
      contentType: string;
      metadata: Record<string, string>;
      storageClass?: R2StorageClass;
    }
  >;
}

const BLOCKED_SYSTEM_ROOTS = [
  '/',
  '/etc',
  '/usr',
  '/bin',
  '/sbin',
  '/lib',
  '/lib64',
  '/boot',
  '/dev',
  '/proc',
  '/sys',
  '/root',
  '/var',
  '/run',
];

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
  if (!cleaned || cleaned.includes('..') || cleaned.includes('\\') || cleaned.includes('\0')) {
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
  const normalized = normalizePrefix(cleaned);
  const segments = normalized.split('/').filter(Boolean);
  if (segments.some((s) => s === '.' || s === '..' || s === LOCAL_META_FILENAME)) {
    throw new AppApiError({
      status: 400,
      errorCode: 'FOLDER_INVALID_NAME',
      title: 'Invalid Directory Prefix',
      detail: 'Folder paths cannot reference reserved or relative path segments.',
    });
  }
  return normalized;
}

export function resolveSafeLocalRoot(rawPath?: string): string {
  const trimmed = (rawPath ?? '').trim();
  if (!trimmed || trimmed.includes('\0') || trimmed.includes('\n') || trimmed.includes('\r')) {
    throw new AppApiError({
      status: 400,
      errorCode: 'LOCAL_FOLDER_INVALID',
      title: 'Invalid Local Folder Path',
      detail: 'Provide a valid non-empty host folder path (e.g. "./data/buckets").',
    });
  }

  const resolved = path.resolve(trimmed);
  const normalizedLower = resolved.toLowerCase();

  for (const sysRoot of BLOCKED_SYSTEM_ROOTS) {
    if (resolved === sysRoot) {
      throw new AppApiError({
        status: 400,
        errorCode: 'LOCAL_FOLDER_SYSTEM_RESTRICTED',
        title: 'Restricted System Path',
        detail: `Protected system root "${resolved}" cannot be used for bucket storage.`,
      });
    }
    if (
      sysRoot !== '/' &&
      sysRoot !== '/var' &&
      resolved.startsWith(sysRoot + path.sep)
    ) {
      throw new AppApiError({
        status: 400,
        errorCode: 'LOCAL_FOLDER_SYSTEM_RESTRICTED',
        title: 'Restricted System Path',
        detail: `System directory "${resolved}" cannot be used for bucket storage.`,
      });
    }
  }

  if (
    /^[a-z]:\\?$/i.test(resolved) ||
    normalizedLower === 'c:\\windows' ||
    normalizedLower.startsWith('c:\\windows\\') ||
    normalizedLower.startsWith('c:\\program files')
  ) {
    throw new AppApiError({
      status: 400,
      errorCode: 'LOCAL_FOLDER_SYSTEM_RESTRICTED',
      title: 'Restricted System Path',
      detail: `System directory "${resolved}" cannot be used for bucket storage.`,
    });
  }

  return resolved;
}

function assertStrictlyInside(targetPath: string, parentDir: string): void {
  const resolvedParent = path.resolve(parentDir);
  const resolvedTarget = path.resolve(targetPath);
  if (
    resolvedTarget === resolvedParent ||
    !resolvedTarget.startsWith(resolvedParent + path.sep)
  ) {
    throw new AppApiError({
      status: 400,
      errorCode: 'FOLDER_INVALID_NAME',
      title: 'Path Traversal Rejected',
      detail: 'Target path escapes the configured storage root.',
    });
  }
}

function resolveSafeKeySegments(rawKey: string): string[] {
  const trimmed = rawKey.trim().replace(/^\/+/, '');
  if (!trimmed || trimmed.includes('\0') || trimmed.includes('\\')) {
    throw new AppApiError({
      status: 400,
      errorCode: 'OBJECT_KEY_INVALID',
      title: 'Invalid Object Key',
      detail: 'Object key cannot be empty or contain invalid characters.',
    });
  }
  const segments = trimmed.split('/').filter((s) => s.length > 0);
  if (
    segments.length === 0 ||
    segments.some((s) => s === '.' || s === '..' || s === LOCAL_META_FILENAME)
  ) {
    throw new AppApiError({
      status: 400,
      errorCode: 'OBJECT_KEY_INVALID',
      title: 'Invalid Object Key',
      detail: 'Object key contains disallowed path segments.',
    });
  }
  return segments;
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

  private async ensureLocalRoot(localRootPath?: string): Promise<string> {
    const rootDir = resolveSafeLocalRoot(localRootPath);
    try {
      const stat = await fs.stat(rootDir).catch(() => null);
      if (stat && !stat.isDirectory()) {
        throw new AppApiError({
          status: 400,
          errorCode: 'LOCAL_FOLDER_INVALID',
          title: 'Invalid Local Folder',
          detail: `Path "${rootDir}" exists and is not a directory.`,
        });
      }
      if (!stat) {
        await fs.mkdir(rootDir, { recursive: true });
      }
      await fs.access(rootDir, fsConstants.R_OK | fsConstants.W_OK);
      return await fs.realpath(rootDir);
    } catch (err) {
      if (err instanceof AppApiError) throw err;
      throw new AppApiError({
        status: 400,
        errorCode: 'LOCAL_FOLDER_UNREACHABLE',
        title: 'Local Folder Unreachable',
        detail: `Cannot access or write to host folder "${rootDir}": ${err instanceof Error ? err.message : 'permission error'}`,
      });
    }
  }

  private async resolveLocalBucketDir(
    bucketName: string,
    localRootPath?: string,
    mustExist = true,
  ): Promise<{ rootDir: string; bucketDir: string }> {
    validateBucketName(bucketName);
    const rootDir = await this.ensureLocalRoot(localRootPath);
    const bucketDir = path.resolve(rootDir, bucketName);
    assertStrictlyInside(bucketDir, rootDir);

    if (mustExist) {
      const stat = await fs.lstat(bucketDir).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        throw new AppApiError({
          status: 404,
          errorCode: 'BUCKET_NOT_FOUND',
          title: 'Bucket Not Found',
          detail: `Bucket "${bucketName}" was not found in "${rootDir}".`,
        });
      }
      const realBucket = await fs.realpath(bucketDir);
      assertStrictlyInside(realBucket, rootDir);
      return { rootDir, bucketDir: realBucket };
    }
    return { rootDir, bucketDir };
  }

  private async readLocalBucketMeta(bucketDir: string): Promise<LocalBucketMeta> {
    const metaPath = path.join(bucketDir, LOCAL_META_FILENAME);
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<LocalBucketMeta>;
      return {
        createdAt: parsed.createdAt || new Date().toISOString(),
        locationHint: parsed.locationHint || 'ENAM',
        storageClass: parsed.storageClass || 'Standard',
        publicDomain: parsed.publicDomain,
        corsEnabled: parsed.corsEnabled ?? true,
        folders: Array.isArray(parsed.folders) ? parsed.folders : [],
        objects: parsed.objects && typeof parsed.objects === 'object' ? parsed.objects : {},
      };
    } catch {
      const stat = await fs.stat(bucketDir).catch(() => null);
      return {
        createdAt: stat ? stat.birthtime.toISOString() : new Date().toISOString(),
        locationHint: 'ENAM',
        storageClass: 'Standard',
        corsEnabled: true,
        folders: [],
        objects: {},
      };
    }
  }

  private async writeLocalBucketMeta(bucketDir: string, meta: LocalBucketMeta): Promise<void> {
    const metaPath = path.join(bucketDir, LOCAL_META_FILENAME);
    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  }

  private async walkLocalFiles(
    baseDir: string,
    prefix = '',
  ): Promise<Array<{ key: string; fullPath: string; size: number; mtimeMs: number }>> {
    const results: Array<{ key: string; fullPath: string; size: number; mtimeMs: number }> = [];
    const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name === LOCAL_META_FILENAME) continue;
      const fullPath = path.join(baseDir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        const nested = await this.walkLocalFiles(fullPath, `${prefix}${entry.name}/`);
        results.push(...nested);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath).catch(() => null);
        if (stat) {
          results.push({
            key: `${prefix}${entry.name}`,
            fullPath,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          });
        }
      }
    }
    return results;
  }

  private async countLocalDirectChildren(dirPath: string): Promise<number> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
    return entries.filter((e) => e.name !== LOCAL_META_FILENAME).length;
  }

  private async computeLocalEtag(filePath: string, size: number, mtimeMs: number): Promise<string> {
    if (size <= 4 * 1024 * 1024) {
      const buf = await fs.readFile(filePath);
      return `"${crypto.createHash('md5').update(buf).digest('hex')}"`;
    }
    return `"${crypto.createHash('md5').update(`${size}:${mtimeMs}`).digest('hex')}"`;
  }

  public async inspectLocalFolder(
    localRootPath: string,
    createIfMissing = true,
  ): Promise<LocalFolderInspectResponse> {
    const resolved = resolveSafeLocalRoot(localRootPath);
    const stat = await fs.stat(resolved).catch(() => null);
    if (stat && !stat.isDirectory()) {
      throw new AppApiError({
        status: 400,
        errorCode: 'LOCAL_FOLDER_INVALID',
        title: 'Invalid Local Folder',
        detail: `Path "${resolved}" exists and is not a directory.`,
      });
    }

    if (!stat) {
      if (!createIfMissing) {
        return {
          valid: false,
          resolvedPath: resolved,
          exists: false,
          writable: false,
          bucketCount: 0,
        };
      }
      try {
        await fs.mkdir(resolved, { recursive: true });
      } catch (err) {
        throw new AppApiError({
          status: 400,
          errorCode: 'LOCAL_FOLDER_UNREACHABLE',
          title: 'Cannot Create Local Folder',
          detail: `Failed to initialize "${resolved}": ${err instanceof Error ? err.message : 'permission denied'}`,
        });
      }
    }

    try {
      await fs.access(resolved, fsConstants.R_OK | fsConstants.W_OK);
    } catch {
      throw new AppApiError({
        status: 400,
        errorCode: 'LOCAL_FOLDER_UNREACHABLE',
        title: 'Local Folder Not Writable',
        detail: `Host directory "${resolved}" is not readable/writable.`,
      });
    }

    const realRoot = await fs.realpath(resolved);
    const entries = await fs.readdir(realRoot, { withFileTypes: true });
    const bucketCount = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith('.') && BUCKET_NAME_REGEX.test(e.name),
    ).length;

    return {
      valid: true,
      resolvedPath: realRoot,
      exists: true,
      writable: true,
      bucketCount,
    };
  }

  public async listBuckets(
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
    localRootPath?: string,
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

    if (mode === 'local') {
      const rootDir = await this.ensureLocalRoot(localRootPath);
      const entries = await fs.readdir(rootDir, { withFileTypes: true });
      const summaries: BucketSummary[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.') || !BUCKET_NAME_REGEX.test(entry.name)) {
          continue;
        }
        const bucketDir = path.join(rootDir, entry.name);
        const meta = await this.readLocalBucketMeta(bucketDir);
        const files = await this.walkLocalFiles(bucketDir);
        const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
        summaries.push({
          name: entry.name,
          createdAt: meta.createdAt,
          locationHint: meta.locationHint,
          storageClass: meta.storageClass,
          objectCount: files.length,
          totalBytes,
          publicDomain: meta.publicDomain,
          corsEnabled: meta.corsEnabled,
        });
      }

      return summaries.sort((a, b) => a.name.localeCompare(b.name));
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
    localRootPath?: string,
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

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(req.name, localRootPath, false);
      const existing = await fs.stat(bucketDir).catch(() => null);
      if (existing) {
        throw new AppApiError({
          status: 409,
          errorCode: 'BUCKET_ALREADY_EXISTS',
          title: 'Bucket Already Exists',
          detail: `Bucket "${req.name}" already exists in the configured host folder.`,
        });
      }

      await fs.mkdir(bucketDir, { recursive: true });
      const meta: LocalBucketMeta = {
        createdAt: new Date().toISOString(),
        locationHint: req.locationHint || 'ENAM',
        storageClass: req.storageClass || 'Standard',
        corsEnabled: true,
        folders: [],
        objects: {},
      };
      await this.writeLocalBucketMeta(bucketDir, meta);

      return {
        name: req.name,
        createdAt: meta.createdAt,
        locationHint: meta.locationHint,
        storageClass: meta.storageClass,
        objectCount: 0,
        totalBytes: 0,
        corsEnabled: meta.corsEnabled,
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
    options?: { force?: boolean },
    localRootPath?: string,
  ): Promise<{ deletedCount: number }> {
    const force = Boolean(options?.force);

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      let deletedCount = 0;

      if (force) {
        let continuationToken: string | undefined;
        do {
          const listed = await s3.send(
            new ListObjectsV2Command({
              Bucket: bucketName,
              ContinuationToken: continuationToken,
              MaxKeys: 1000,
            }),
          );
          const keys = (listed.Contents ?? [])
            .map((o) => o.Key)
            .filter((k): k is string => Boolean(k));
          if (keys.length > 0) {
            await s3.send(
              new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: { Objects: keys.map((Key) => ({ Key })) },
              }),
            );
            deletedCount += keys.length;
          }
          continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
        } while (continuationToken);
      } else {
        const probe = await s3.send(new ListObjectsV2Command({ Bucket: bucketName, MaxKeys: 1 }));
        if ((probe.Contents?.length ?? 0) > 0) {
          throw new AppApiError({
            status: 409,
            errorCode: 'BUCKET_NOT_EMPTY',
            title: 'Bucket Not Empty',
            detail: `Bucket "${bucketName}" is not empty. Confirm its name to delete the bucket and all contents.`,
          });
        }
      }

      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
      return { deletedCount };
    }

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(bucketName, localRootPath, true);
      const files = await this.walkLocalFiles(bucketDir);
      const directChildren = await this.countLocalDirectChildren(bucketDir);
      const existingCount = Math.max(files.length, directChildren);

      if (directChildren > 0 && !force) {
        throw new AppApiError({
          status: 409,
          errorCode: 'BUCKET_NOT_EMPTY',
          title: 'Bucket Not Empty',
          detail: `Bucket "${bucketName}" is not empty on disk (${existingCount} item(s)). Confirm its name to delete all contents.`,
        });
      }

      await fs.rm(bucketDir, { recursive: true, force: true });
      return { deletedCount: files.length };
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

    const existingCount = bucket.objects.size;
    if (existingCount > 0 && !force) {
      throw new AppApiError({
        status: 409,
        errorCode: 'BUCKET_NOT_EMPTY',
        title: 'Bucket Not Empty',
        detail: `Bucket "${bucketName}" still contains ${existingCount} objects or folder markers. Confirm its name to delete all contents.`,
      });
    }

    bucket.objects.clear();
    this.sandboxBuckets.delete(bucketName);
    return { deletedCount: existingCount };
  }

  public async deleteFolder(
    bucketName: string,
    rawPrefix: string,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
    options?: { recursive?: boolean },
    localRootPath?: string,
  ): Promise<{ prefix: string; deletedCount: number }> {
    const folderPrefix = validateFolderPrefix(rawPrefix);
    const recursive = Boolean(options?.recursive);

    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const keysToDelete: string[] = [];
      let continuationToken: string | undefined;

      do {
        const listed = await s3.send(
          new ListObjectsV2Command({
            Bucket: bucketName,
            Prefix: folderPrefix,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          }),
        );
        for (const obj of listed.Contents ?? []) {
          if (obj.Key) keysToDelete.push(obj.Key);
        }
        continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (continuationToken);

      const hasNestedContent = keysToDelete.some((k) => k !== folderPrefix);
      if (hasNestedContent && !recursive) {
        throw new AppApiError({
          status: 409,
          errorCode: 'FOLDER_NOT_EMPTY',
          title: 'Folder Not Empty',
          detail: `Folder "${folderPrefix}" is not empty. Confirm its path to delete the folder and all nested contents.`,
        });
      }

      if (keysToDelete.length > 0) {
        for (let i = 0; i < keysToDelete.length; i += 1000) {
          const chunk = keysToDelete.slice(i, i + 1000);
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: { Objects: chunk.map((Key) => ({ Key })) },
            }),
          );
        }
      }

      return { prefix: folderPrefix, deletedCount: keysToDelete.length };
    }

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(bucketName, localRootPath, true);
      const segments = folderPrefix.split('/').filter(Boolean);
      const folderDir = path.resolve(bucketDir, ...segments);
      assertStrictlyInside(folderDir, bucketDir);

      const stat = await fs.lstat(folderDir).catch(() => null);
      let deletedCount = 0;
      if (stat && stat.isDirectory()) {
        const realFolder = await fs.realpath(folderDir);
        assertStrictlyInside(realFolder, bucketDir);
        const nestedFiles = await this.walkLocalFiles(realFolder, folderPrefix);
        const directChildren = await this.countLocalDirectChildren(realFolder);

        if (directChildren > 0 && !recursive) {
          throw new AppApiError({
            status: 409,
            errorCode: 'FOLDER_NOT_EMPTY',
            title: 'Folder Not Empty',
            detail: `Folder "${folderPrefix}" is not empty (${Math.max(nestedFiles.length, directChildren)} nested item(s)). Confirm its path to delete all contents.`,
          });
        }

        await fs.rm(realFolder, { recursive: true, force: true });
        deletedCount = nestedFiles.length || 1;
      }

      const meta = await this.readLocalBucketMeta(bucketDir);
      const hadMarker = meta.folders.includes(folderPrefix);
      meta.folders = meta.folders.filter((f) => !f.startsWith(folderPrefix));
      for (const k of Object.keys(meta.objects)) {
        if (k.startsWith(folderPrefix)) {
          delete meta.objects[k];
        }
      }
      await this.writeLocalBucketMeta(bucketDir, meta);

      return { prefix: folderPrefix, deletedCount: deletedCount || (hadMarker ? 1 : 0) };
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

    const matchingKeys = Array.from(bucket.objects.keys()).filter((k) => k.startsWith(folderPrefix));
    const hasNestedContent = matchingKeys.some((k) => k !== folderPrefix);

    if (hasNestedContent && !recursive) {
      throw new AppApiError({
        status: 409,
        errorCode: 'FOLDER_NOT_EMPTY',
        title: 'Folder Not Empty',
        detail: `Folder "${folderPrefix}" contains ${matchingKeys.filter((k) => k !== folderPrefix).length} nested item(s). Confirm its path to delete all contents.`,
      });
    }

    for (const key of matchingKeys) {
      bucket.objects.delete(key);
    }

    return { prefix: folderPrefix, deletedCount: matchingKeys.length };
  }

  public async listDirectory(
    bucketName: string,
    rawPrefix: string,
    mode: ConnectionMode,
    creds?: CloudflareCredentials,
    localRootPath?: string,
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

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(bucketName, localRootPath, true);
      const meta = await this.readLocalBucketMeta(bucketDir);
      let targetDir = bucketDir;
      if (prefix) {
        const segments = resolveSafeKeySegments(prefix);
        targetDir = path.resolve(bucketDir, ...segments);
        assertStrictlyInside(targetDir, bucketDir);
      }

      const dirStat = await fs.lstat(targetDir).catch(() => null);
      if (!dirStat || !dirStat.isDirectory()) {
        return {
          bucket: bucketName,
          prefix,
          folders: [],
          objects: [],
          totalObjectsInPrefix: 0,
          isTruncated: false,
        };
      }

      const realTarget = await fs.realpath(targetDir);
      if (realTarget !== bucketDir) {
        assertStrictlyInside(realTarget, bucketDir);
      }

      const entries = await fs.readdir(realTarget, { withFileTypes: true });
      const folders: DirectoryEntry[] = [];
      const objects: R2ObjectItem[] = [];

      for (const entry of entries) {
        if (entry.name === LOCAL_META_FILENAME || entry.isSymbolicLink()) continue;
        const fullPath = path.join(realTarget, entry.name);
        if (entry.isDirectory()) {
          const folderPrefix = `${prefix}${entry.name}/`;
          folders.push({
            prefix: folderPrefix,
            name: entry.name,
            hasMarkerObject: meta.folders.includes(folderPrefix),
          });
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath).catch(() => null);
          if (!stat) continue;
          const key = `${prefix}${entry.name}`;
          const objMeta = meta.objects[key];
          const contentType = objMeta?.contentType || inferMimeType(entry.name);
          const etag = await this.computeLocalEtag(fullPath, stat.size, stat.mtimeMs);
          objects.push({
            bucket: bucketName,
            key,
            fileName: entry.name,
            parentPrefix: prefix,
            size: stat.size,
            lastModified: stat.mtime.toISOString(),
            etag,
            contentType,
            storageClass: objMeta?.storageClass || meta.storageClass,
            isFolderMarker: false,
            metadata: { ...(objMeta?.metadata ?? {}) },
          });
        }
      }

      folders.sort((a, b) => a.name.localeCompare(b.name));
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
    localRootPath?: string,
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

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(bucketName, localRootPath, true);
      const folderDir = path.resolve(bucketDir, ...parts);
      assertStrictlyInside(folderDir, bucketDir);
      await fs.mkdir(folderDir, { recursive: true });
      const realFolder = await fs.realpath(folderDir);
      assertStrictlyInside(realFolder, bucketDir);

      if (createMarkerObject) {
        const meta = await this.readLocalBucketMeta(bucketDir);
        if (!meta.folders.includes(folderPrefix)) {
          meta.folders.push(folderPrefix);
          await this.writeLocalBucketMeta(bucketDir, meta);
        }
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
    localRootPath?: string,
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

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(bucketName, localRootPath, true);
      const segments = resolveSafeKeySegments(cleanKey);
      const targetPath = path.resolve(bucketDir, ...segments);
      assertStrictlyInside(targetPath, bucketDir);

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      const realParent = await fs.realpath(path.dirname(targetPath));
      if (realParent !== bucketDir) {
        assertStrictlyInside(realParent, bucketDir);
      }

      await fs.writeFile(targetPath, content);
      const meta = await this.readLocalBucketMeta(bucketDir);
      const resolvedMime =
        contentType && contentType !== 'application/octet-stream'
          ? contentType
          : inferMimeType(segments[segments.length - 1]);
      meta.objects[cleanKey] = {
        contentType: resolvedMime,
        metadata: { ...metadata },
        storageClass: meta.storageClass,
      };
      await this.writeLocalBucketMeta(bucketDir, meta);

      const stat = await fs.stat(targetPath);
      const etag = `"${crypto.createHash('md5').update(content).digest('hex')}"`;
      const lastSlash = cleanKey.lastIndexOf('/');
      return {
        bucket: bucketName,
        key: cleanKey,
        fileName: lastSlash >= 0 ? cleanKey.slice(lastSlash + 1) : cleanKey,
        parentPrefix: lastSlash >= 0 ? cleanKey.slice(0, lastSlash + 1) : '',
        size: content.byteLength,
        lastModified: stat.mtime.toISOString(),
        etag,
        contentType: resolvedMime,
        storageClass: meta.storageClass,
        isFolderMarker: false,
        metadata: { ...metadata },
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
    localRootPath?: string,
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

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(bucketName, localRootPath, true);
      const segments = resolveSafeKeySegments(key);
      const targetPath = path.resolve(bucketDir, ...segments);
      assertStrictlyInside(targetPath, bucketDir);

      const stat = await fs.lstat(targetPath).catch(() => null);
      if (!stat || !stat.isFile()) {
        throw new AppApiError({
          status: 404,
          errorCode: 'OBJECT_NOT_FOUND',
          title: 'Object Not Found',
          detail: `Object "${key}" was not found in bucket "${bucketName}".`,
        });
      }
      const realTarget = await fs.realpath(targetPath);
      assertStrictlyInside(realTarget, bucketDir);

      const bytes = await fs.readFile(realTarget);
      const meta = await this.readLocalBucketMeta(bucketDir);
      const objMeta = meta.objects[key];
      const contentType = objMeta?.contentType || inferMimeType(segments[segments.length - 1]);
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
        metadata: { ...(objMeta?.metadata ?? {}) },
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
    localRootPath?: string,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    if (mode === 'cloudflare' && creds) {
      const s3 = this.createS3Client(creds);
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
      const buffer = obj.Body ? Buffer.from(await obj.Body.transformToByteArray()) : Buffer.alloc(0);
      const fileName = key.split('/').pop() || 'download.bin';
      return { buffer, contentType: obj.ContentType || 'application/octet-stream', fileName };
    }

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(bucketName, localRootPath, true);
      const segments = resolveSafeKeySegments(key);
      const targetPath = path.resolve(bucketDir, ...segments);
      assertStrictlyInside(targetPath, bucketDir);

      const stat = await fs.lstat(targetPath).catch(() => null);
      if (!stat || !stat.isFile()) {
        throw new AppApiError({
          status: 404,
          errorCode: 'OBJECT_NOT_FOUND',
          title: 'Object Not Found',
          detail: `Object "${key}" does not exist in "${bucketName}".`,
        });
      }
      const realTarget = await fs.realpath(targetPath);
      assertStrictlyInside(realTarget, bucketDir);

      const buffer = await fs.readFile(realTarget);
      const meta = await this.readLocalBucketMeta(bucketDir);
      const fileName = segments[segments.length - 1] || 'download.bin';
      const contentType = meta.objects[key]?.contentType || inferMimeType(fileName);
      return { buffer, contentType, fileName };
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
    localRootPath?: string,
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

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(bucketName, localRootPath, true);
      const segments = resolveSafeKeySegments(key);
      const targetPath = path.resolve(bucketDir, ...segments);
      assertStrictlyInside(targetPath, bucketDir);

      const stat = await fs.lstat(targetPath).catch(() => null);
      if (!stat || !stat.isFile()) {
        throw new AppApiError({
          status: 404,
          errorCode: 'OBJECT_NOT_FOUND',
          title: 'Object Not Found',
          detail: `Cannot generate presigned URL: "${key}" not found in "${bucketName}".`,
        });
      }

      const sig = crypto.createHash('sha256').update(`local:${bucketName}:${key}:${expiresAt}`).digest('hex').slice(0, 32);
      const url = `https://local-host.r2.storage/${encodeURIComponent(bucketName)}/${key
        .split('/')
        .map(encodeURIComponent)
        .join('/')}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${safeTtl}&X-Amz-Signature=${sig}`;
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
    localRootPath?: string,
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

    if (mode === 'local') {
      const rootDir = await this.ensureLocalRoot(localRootPath);
      const bucketNames: string[] = [];
      if (request.bucket) {
        validateBucketName(request.bucket);
        const stat = await fs.lstat(path.join(rootDir, request.bucket)).catch(() => null);
        if (stat?.isDirectory()) bucketNames.push(request.bucket);
      } else {
        const entries = await fs.readdir(rootDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && BUCKET_NAME_REGEX.test(entry.name)) {
            bucketNames.push(entry.name);
          }
        }
      }

      for (const bName of bucketNames) {
        bucketsScanned += 1;
        const bucketDir = path.join(rootDir, bName);
        const meta = await this.readLocalBucketMeta(bucketDir);
        const files = await this.walkLocalFiles(bucketDir);

        for (const file of files) {
          const objMeta = meta.objects[file.key];
          const contentType = objMeta?.contentType || inferMimeType(file.key);
          const metadata = objMeta?.metadata ?? {};

          if (contentTypeFilter && !contentType.toLowerCase().includes(contentTypeFilter)) {
            continue;
          }

          const lastSlash = file.key.lastIndexOf('/');
          const fileName = lastSlash >= 0 ? file.key.slice(lastSlash + 1) : file.key;
          const matchedOn = new Set<SearchResultItem['matchedOn'][number]>();

          if (q) {
            if (fileName.toLowerCase().includes(q)) matchedOn.add('fileName');
            if (file.key.toLowerCase().includes(q)) matchedOn.add('key');
            for (const [mk, mv] of Object.entries(metadata)) {
              if (mk.toLowerCase().includes(q)) matchedOn.add('metadataKey');
              if (mv.toLowerCase().includes(q)) matchedOn.add('metadataValue');
            }
            if (matchedOn.size === 0) continue;
          }

          if (tagKey || tagValue) {
            let tagMatched = false;
            for (const [mk, mv] of Object.entries(metadata)) {
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
            bucket: bName,
            key: file.key,
            fileName,
            parentPrefix: lastSlash >= 0 ? file.key.slice(0, lastSlash + 1) : '',
            size: file.size,
            lastModified: new Date(file.mtimeMs).toISOString(),
            etag: await this.computeLocalEtag(file.fullPath, file.size, file.mtimeMs),
            contentType,
            storageClass: objMeta?.storageClass || meta.storageClass,
            isFolderMarker: false,
            metadata: { ...metadata },
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
    localRootPath?: string,
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

    if (mode === 'local') {
      const { bucketDir } = await this.resolveLocalBucketDir(req.bucket, localRootPath, true);
      const meta = await this.readLocalBucketMeta(bucketDir);
      const succeededKeys: string[] = [];
      const failures: BulkItemFailure[] = [];

      for (const rawKey of req.keys) {
        try {
          if (rawKey.endsWith('/') && req.recursiveFolders) {
            const folderPrefix = validateFolderPrefix(rawKey);
            const segments = folderPrefix.split('/').filter(Boolean);
            const folderDir = path.resolve(bucketDir, ...segments);
            assertStrictlyInside(folderDir, bucketDir);
            const stat = await fs.lstat(folderDir).catch(() => null);
            let deletedAny = false;
            if (stat?.isDirectory()) {
              const nested = await this.walkLocalFiles(folderDir, folderPrefix);
              await fs.rm(folderDir, { recursive: true, force: true });
              for (const nf of nested) succeededKeys.push(nf.key);
              if (nested.length === 0) succeededKeys.push(folderPrefix);
              deletedAny = true;
            }
            if (meta.folders.includes(folderPrefix)) {
              meta.folders = meta.folders.filter((f) => !f.startsWith(folderPrefix));
              deletedAny = true;
            }
            for (const mk of Object.keys(meta.objects)) {
              if (mk.startsWith(folderPrefix)) {
                delete meta.objects[mk];
              }
            }
            if (!deletedAny) {
              failures.push({
                key: rawKey,
                errorCode: 'OBJECT_NOT_FOUND',
                reason: `Folder prefix "${rawKey}" contained no matching objects.`,
              });
            }
          } else {
            const segments = resolveSafeKeySegments(rawKey);
            const targetPath = path.resolve(bucketDir, ...segments);
            assertStrictlyInside(targetPath, bucketDir);
            const stat = await fs.lstat(targetPath).catch(() => null);
            if (!stat || !stat.isFile()) {
              failures.push({
                key: rawKey,
                errorCode: 'OBJECT_NOT_FOUND',
                reason: `Key "${rawKey}" does not exist in "${req.bucket}".`,
              });
              continue;
            }
            await fs.unlink(targetPath);
            delete meta.objects[rawKey];
            succeededKeys.push(rawKey);
          }
        } catch (err) {
          failures.push({
            key: rawKey,
            errorCode: err instanceof AppApiError ? err.errorCode : 'LOCAL_DELETE_FAILED',
            reason: err instanceof Error ? err.message : 'Failed to delete local object.',
          });
        }
      }

      await this.writeLocalBucketMeta(bucketDir, meta);

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
    localRootPath?: string,
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

    if (mode === 'local') {
      const { bucketDir: srcBucketDir } = await this.resolveLocalBucketDir(
        req.sourceBucket,
        localRootPath,
        true,
      );
      const { bucketDir: dstBucketDir } = await this.resolveLocalBucketDir(
        req.destinationBucket,
        localRootPath,
        true,
      );
      const srcMeta = await this.readLocalBucketMeta(srcBucketDir);
      const dstMeta =
        srcBucketDir === dstBucketDir ? srcMeta : await this.readLocalBucketMeta(dstBucketDir);

      const succeededKeys: string[] = [];
      const failures: BulkItemFailure[] = [];

      for (const sourceKey of req.keys) {
        try {
          const srcSegments = resolveSafeKeySegments(sourceKey);
          const srcPath = path.resolve(srcBucketDir, ...srcSegments);
          assertStrictlyInside(srcPath, srcBucketDir);
          const srcStat = await fs.lstat(srcPath).catch(() => null);
          if (!srcStat || !srcStat.isFile()) {
            failures.push({
              key: sourceKey,
              errorCode: 'OBJECT_NOT_FOUND',
              reason: `Source key "${sourceKey}" not found in "${req.sourceBucket}".`,
            });
            continue;
          }

          const fileName = srcSegments[srcSegments.length - 1];
          const targetKey = `${destPrefix}${fileName}`;
          const dstSegments = resolveSafeKeySegments(targetKey);
          const dstPath = path.resolve(dstBucketDir, ...dstSegments);
          assertStrictlyInside(dstPath, dstBucketDir);

          if (targetKey === sourceKey && req.destinationBucket === req.sourceBucket) {
            failures.push({
              key: sourceKey,
              errorCode: 'BULK_SAME_LOCATION',
              reason: 'Source and destination keys are identical.',
            });
            continue;
          }

          const dstExists = await fs.stat(dstPath).catch(() => null);
          if (dstExists && !req.overwrite) {
            failures.push({
              key: sourceKey,
              errorCode: 'BULK_DESTINATION_CONFLICT',
              reason: `Target "${targetKey}" already exists and overwrite is disabled.`,
            });
            continue;
          }

          await fs.mkdir(path.dirname(dstPath), { recursive: true });
          const bytes = await fs.readFile(srcPath);
          await fs.writeFile(dstPath, bytes);
          await fs.unlink(srcPath);

          const srcEntryMeta = srcMeta.objects[sourceKey];
          dstMeta.objects[targetKey] = {
            contentType: srcEntryMeta?.contentType || inferMimeType(fileName),
            metadata: { ...(srcEntryMeta?.metadata ?? {}) },
            storageClass: dstMeta.storageClass,
          };
          delete srcMeta.objects[sourceKey];
          succeededKeys.push(targetKey);
        } catch (err) {
          failures.push({
            key: sourceKey,
            errorCode: err instanceof AppApiError ? err.errorCode : 'LOCAL_MOVE_FAILED',
            reason: err instanceof Error ? err.message : 'Local move failed.',
          });
        }
      }

      await this.writeLocalBucketMeta(srcBucketDir, srcMeta);
      if (dstBucketDir !== srcBucketDir) {
        await this.writeLocalBucketMeta(dstBucketDir, dstMeta);
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

function inferMimeType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.ndjson')) return 'application/x-ndjson';
  if (lower.endsWith('.toml')) return 'application/toml';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'application/yaml';
  if (lower.endsWith('.xml')) return 'application/xml';
  if (lower.endsWith('.md')) return 'text/markdown';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'application/javascript';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'text/typescript';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.txt') || lower.endsWith('.log') || lower.endsWith('.csv')) return 'text/plain';
  return 'application/octet-stream';
}

function isTextMime(contentType: string, key: string): boolean {
  if (
    contentType.startsWith('text/') ||
    contentType.includes('json') ||
    contentType.includes('xml') ||
    contentType.includes('yaml') ||
    contentType.includes('toml') ||
    contentType.includes('javascript') ||
    contentType.includes('ndjson')
  ) {
    return true;
  }
  return /\.(md|txt|json|toml|yml|yaml|cs|ts|tsx|js|jsx|htm|html|css|sh|xml|csv|log|ndjson)$/i.test(key);
}
