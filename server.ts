import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { R2StorageEngine } from './server/r2Engine';
import { BucketsTelemetry } from './server/telemetry';
import { AppApiError, createTraceId, expressErrorMiddleware } from './server/errors';
import type {
  CloudflareCredentials,
  ConnectionMode,
  LogSinkId,
  R2OperationName,
} from './src/shared/types';

const PORT = 3000;

function extractConnectionContext(req: Request): {
  mode: ConnectionMode;
  creds?: CloudflareCredentials;
} {
  const modeHeader = req.header('x-buckets-mode');
  if (modeHeader === 'cloudflare') {
    const creds: CloudflareCredentials = {
      accountId: req.header('x-cf-account-id') ?? '',
      apiToken: req.header('x-cf-api-token') ?? '',
      accessKeyId: req.header('x-r2-access-key') ?? '',
      secretAccessKey: req.header('x-r2-secret-key') ?? '',
    };
    return { mode: 'cloudflare', creds };
  }
  return { mode: 'sandbox' };
}

async function startServer() {
  const app = express();
  const engine = new R2StorageEngine();
  const telemetry = new BucketsTelemetry();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
  });

  app.use(express.json({ limit: '5mb' }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const traceId = req.header('x-trace-id') || createTraceId();
    res.locals.traceId = traceId;
    res.setHeader('X-Trace-Id', traceId);
    next();
  });

  const instrument = <T>(
    req: Request,
    res: Response,
    operation: R2OperationName,
    fn: () => Promise<{ payload: T; bytes?: number; bucket?: string; objectKey?: string; message: string }>,
  ): Promise<void> => {
    const started = performance.now();
    const traceId = res.locals.traceId as string;
    return fn()
      .then((result) => {
        const durationMs = Math.max(1, Math.round(performance.now() - started));
        telemetry.recordOperation({
          operation,
          durationMs,
          bytes: result.bytes,
          statusCode: 200,
          source: 'ExpressGateway',
          traceId,
          bucket: result.bucket,
          objectKey: result.objectKey,
          message: result.message,
        });
        res.setHeader('Server-Timing', `r2-op;dur=${durationMs};desc="${operation}"`);
        res.json(result.payload);
      })
      .catch((err) => {
        const durationMs = Math.max(1, Math.round(performance.now() - started));
        const statusCode = err instanceof AppApiError ? err.status : 500;
        const errorCode = err instanceof AppApiError ? err.errorCode : 'INTERNAL_SERVER_ERROR';
        telemetry.recordOperation({
          operation,
          durationMs,
          statusCode,
          source: 'ExpressGateway',
          traceId,
          errorCode,
          message: err instanceof Error ? err.message : 'Operation failed',
        });
        throw err;
      });
  };

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      system: 'Cloudflare Buckets',
      shortName: 'Buckets',
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/buckets', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      await instrument(req, res, 'ListBuckets', async () => {
        const buckets = await engine.listBuckets(mode, creds);
        return {
          payload: buckets,
          bytes: JSON.stringify(buckets).length,
          message: `Listed ${buckets.length} R2 buckets in ${mode} mode.`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/buckets', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      await instrument(req, res, 'CreateBucket', async () => {
        const bucket = await engine.createBucket(req.body, mode, creds);
        return {
          payload: bucket,
          bucket: bucket.name,
          message: `Created bucket "${bucket.name}" (${bucket.locationHint} · ${bucket.storageClass}).`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/buckets/:bucket', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      const bucketName = req.params.bucket;
      await instrument(req, res, 'DeleteBucket', async () => {
        await engine.deleteBucket(bucketName, mode, creds);
        return {
          payload: { deleted: true, bucket: bucketName },
          bucket: bucketName,
          message: `Deleted bucket "${bucketName}".`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/buckets/:bucket/objects', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      const bucketName = req.params.bucket;
      const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : '';
      await instrument(req, res, 'ListObjectsV2', async () => {
        const listing = await engine.listDirectory(bucketName, prefix, mode, creds);
        return {
          payload: listing,
          bucket: bucketName,
          bytes: JSON.stringify(listing).length,
          message: `Listed directory "${prefix || '/'}" in "${bucketName}" (${listing.folders.length} folders, ${listing.objects.length} files).`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/buckets/:bucket/folders', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      const bucketName = req.params.bucket;
      const { prefix, createMarkerObject = true } = req.body ?? {};
      await instrument(req, res, 'CreateFolderMarker', async () => {
        const folder = await engine.createFolder(bucketName, prefix, createMarkerObject, mode, creds);
        return {
          payload: folder,
          bucket: bucketName,
          objectKey: folder.prefix,
          message: `Created virtual directory "${folder.prefix}" in "${bucketName}".`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/buckets/:bucket/objects/upload', upload.single('file'), async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      const bucketName = req.params.bucket;
      const file = req.file;
      if (!file) {
        throw new AppApiError({
          status: 400,
          errorCode: 'UPLOAD_FILE_REQUIRED',
          title: 'File Required',
          detail: 'Attach a file under the "file" multipart field to upload.',
        });
      }

      const prefix = typeof req.body.prefix === 'string' ? req.body.prefix : '';
      const rawMetadata = typeof req.body.metadata === 'string' ? req.body.metadata : '{}';
      let metadata: Record<string, string> = {};
      try {
        metadata = JSON.parse(rawMetadata);
      } catch {
        metadata = {};
      }

      const cleanPrefix = prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : '';
      const objectKey = `${cleanPrefix}${file.originalname}`;

      await instrument(req, res, 'PutObject', async () => {
        const created = await engine.putObject(
          bucketName,
          objectKey,
          file.buffer,
          file.mimetype || 'application/octet-stream',
          metadata,
          mode,
          creds,
        );
        return {
          payload: created,
          bucket: bucketName,
          objectKey: created.key,
          bytes: created.size,
          message: `Uploaded "${created.key}" (${created.size} bytes) to "${bucketName}".`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/buckets/:bucket/objects/preview', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      const bucketName = req.params.bucket;
      const key = typeof req.query.key === 'string' ? req.query.key : '';
      await instrument(req, res, 'GetObject', async () => {
        const preview = await engine.getObjectPreview(bucketName, key, mode, creds);
        return {
          payload: preview,
          bucket: bucketName,
          objectKey: key,
          bytes: preview.size,
          message: `Previewed "${key}" from "${bucketName}".`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/buckets/:bucket/objects/download', async (req, res, next) => {
    const started = performance.now();
    const traceId = res.locals.traceId as string;
    try {
      const { mode, creds } = extractConnectionContext(req);
      const bucketName = req.params.bucket;
      const key = typeof req.query.key === 'string' ? req.query.key : '';
      const file = await engine.getObjectBuffer(bucketName, key, mode, creds);
      const durationMs = Math.max(1, Math.round(performance.now() - started));
      telemetry.recordOperation({
        operation: 'GetObject',
        durationMs,
        bytes: file.buffer.byteLength,
        statusCode: 200,
        source: 'ExpressGateway',
        traceId,
        bucket: bucketName,
        objectKey: key,
        message: `Downloaded "${key}" (${file.buffer.byteLength} bytes).`,
      });
      res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
      res.type(file.contentType).send(file.buffer);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/buckets/:bucket/objects/presign', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      const bucketName = req.params.bucket;
      const { key, expiresInSeconds = 900 } = req.body ?? {};
      await instrument(req, res, 'PresignUrl', async () => {
        const result = await engine.presignUrl(bucketName, key, expiresInSeconds, mode, creds);
        return {
          payload: result,
          bucket: bucketName,
          objectKey: key,
          message: `Generated presigned URL for "${key}" (TTL ${result.expiresInSeconds}s).`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/search', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      const searchReq = {
        query: typeof req.query.q === 'string' ? req.query.q : undefined,
        bucket: typeof req.query.bucket === 'string' && req.query.bucket ? req.query.bucket : undefined,
        tagKey: typeof req.query.tagKey === 'string' ? req.query.tagKey : undefined,
        tagValue: typeof req.query.tagValue === 'string' ? req.query.tagValue : undefined,
        contentType: typeof req.query.contentType === 'string' ? req.query.contentType : undefined,
      };
      await instrument(req, res, 'SearchObjects', async () => {
        const result = await engine.searchObjects(searchReq, mode, creds);
        return {
          payload: result,
          bucket: searchReq.bucket,
          bytes: JSON.stringify(result).length,
          message: `Search across ${result.bucketsScanned} bucket(s) returned ${result.totalMatches} match(es).`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/objects/bulk-delete', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      await instrument(req, res, 'BulkDelete', async () => {
        const result = await engine.bulkDelete(req.body, mode, creds);
        return {
          payload: result,
          bucket: req.body?.bucket,
          message: `Bulk delete: ${result.succeededCount} succeeded, ${result.failedCount} failed.`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/objects/bulk-move', async (req, res, next) => {
    try {
      const { mode, creds } = extractConnectionContext(req);
      await instrument(req, res, 'BulkMove', async () => {
        const result = await engine.bulkMove(req.body, mode, creds);
        return {
          payload: result,
          bucket: req.body?.destinationBucket,
          message: `Bulk move (${req.body?.sourceBucket} -> ${req.body?.destinationBucket}): ${result.succeededCount} moved, ${result.failedCount} failed.`,
        };
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/telemetry/metrics', (_req, res) => {
    res.json(telemetry.getMetricsSnapshot());
  });

  app.get('/api/telemetry/logs', (req, res) => {
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;
    const operation = typeof req.query.operation === 'string' ? req.query.operation : undefined;
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    res.json(telemetry.getLogs({ level, operation, q }));
  });

  app.post('/api/telemetry/sinks', (req, res) => {
    const { id, enabled, workerForwardingEnabled, endpointOrPath } = req.body ?? {};
    const updated = telemetry.updateSink(id as LogSinkId, {
      enabled,
      workerForwardingEnabled,
      endpointOrPath,
    });
    res.json(updated);
  });

  app.use('/api/*', (req, _res, next) => {
    next(
      new AppApiError({
        status: 404,
        errorCode: 'ENDPOINT_NOT_FOUND',
        title: 'API Route Not Found',
        detail: `No route matched ${req.method} ${req.originalUrl}.`,
      }),
    );
  });

  app.use(expressErrorMiddleware);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cloudflare Buckets server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
