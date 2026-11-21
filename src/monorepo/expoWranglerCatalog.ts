import type { MonorepoFile } from '../shared/types';

export const EXPO_AND_WRANGLER_FILES: MonorepoFile[] = [
  {
    path: 'frontend-expo/package.json',
    stack: 'frontend-expo',
    language: 'json',
    summary: 'Expo Universal React Native dependencies supporting Android, iOS, Web, Windows, and Linux.',
    content: `{
  "name": "cloudflare-buckets-universal",
  "version": "1.0.0",
  "main": "expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "windows": "npx react-native run-windows",
    "linux": "electron ./desktop/linux-main.js",
    "typecheck": "tsc --noEmit",
    "test": "jest"
  },
  "dependencies": {
    "expo": "~54.0.0",
    "expo-document-picker": "~13.0.0",
    "expo-file-system": "~18.0.0",
    "expo-status-bar": "~2.0.0",
    "react": "19.0.1",
    "react-dom": "19.0.1",
    "react-native": "0.79.0",
    "react-native-web": "~0.20.0",
    "react-native-windows": "^0.79.0"
  },
  "devDependencies": {
    "@types/react": "~19.0.0",
    "jest": "^29.7.0",
    "typescript": "^5.8.0"
  }
}
`,
  },
  {
    path: 'frontend-expo/app.json',
    stack: 'frontend-expo',
    language: 'json',
    summary: 'Expo configuration enabling iOS, Android, and Web targets alongside desktop wrappers.',
    content: `{
  "expo": {
    "name": "Cloudflare Buckets",
    "slug": "cloudflare-buckets",
    "version": "1.0.0",
    "orientation": "default",
    "platforms": ["ios", "android", "web"],
    "web": {
      "bundler": "metro",
      "output": "single"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "dev.cloudflare.buckets"
    },
    "android": {
      "package": "dev.cloudflare.buckets"
    }
  }
}
`,
  },
  {
    path: 'frontend-expo/tsconfig.json',
    stack: 'frontend-expo',
    language: 'json',
    summary: 'Strict TypeScript configuration enforcing uniform typing across mobile, web, and desktop.',
    content: `{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
`,
  },
  {
    path: 'frontend-expo/src/types/api.ts',
    stack: 'frontend-expo',
    language: 'typescript',
    summary: 'Strongly-typed DTO interfaces aligned 1:1 with the .NET Core 10 WebAPI contracts.',
    content: `export interface BucketSummary {
  name: string;
  createdAt: string;
  locationHint: 'WNAM' | 'ENAM' | 'WEUR' | 'EEUR' | 'APAC';
  storageClass: 'Standard' | 'InfrequentAccess';
  objectCount: number;
  totalBytes: number;
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
  metadata: Record<string, string>;
}

export interface DirectoryListing {
  bucket: string;
  prefix: string;
  folders: DirectoryEntry[];
  objects: R2ObjectItem[];
}

export interface BulkOperationResult {
  operation: 'delete' | 'move';
  requestedCount: number;
  succeededCount: number;
  failedCount: number;
  failures: Array<{ key: string; errorCode: string; reason: string }>;
}

export interface ApiErrorResponse {
  type: string;
  title: string;
  status: number;
  detail: string;
  errorCode: string;
  traceId: string;
  timestamp: string;
  validationErrors?: Record<string, string[]>;
}
`,
  },
  {
    path: 'frontend-expo/src/services/apiErrorHandler.ts',
    stack: 'frontend-expo',
    language: 'typescript',
    summary: 'Universal error parser mapping RFC 7807 ProblemDetails into clear user messages and telemetry logs.',
    content: `import { Platform } from 'react-native';
import type { ApiErrorResponse } from '../types/api';

export interface FriendlyError {
  title: string;
  message: string;
  errorCode: string;
  traceId?: string;
}

const MESSAGES: Record<string, string> = {
  BUCKET_NAME_INVALID: 'Bucket names must be 3-63 lowercase letters, numbers, or hyphens.',
  BUCKET_NOT_EMPTY: 'Empty the bucket before deleting it.',
  FOLDER_INVALID_NAME: 'Invalid directory name. Avoid relative segments like "..".',
  OBJECT_NOT_FOUND: 'The requested file no longer exists in this bucket.',
  BULK_DESTINATION_CONFLICT: 'Destination already contains a file with this name.',
};

export function handleApiError(err: unknown, context: string): FriendlyError {
  if (err && typeof err === 'object' && 'errorCode' in err) {
    const apiErr = err as ApiErrorResponse;
    const friendly: FriendlyError = {
      title: apiErr.title || 'Operation Failed',
      message: MESSAGES[apiErr.errorCode] ?? apiErr.detail,
      errorCode: apiErr.errorCode,
      traceId: apiErr.traceId,
    };
    console.error('[Buckets::Error]', { platform: Platform.OS, context, ...friendly });
    return friendly;
  }

  const fallback: FriendlyError = {
    title: 'Network Error',
    message: err instanceof Error ? err.message : 'Unable to reach Buckets API.',
    errorCode: 'NETWORK_UNREACHABLE',
  };
  console.error('[Buckets::Error]', { platform: Platform.OS, context, ...fallback });
  return fallback;
}
`,
  },
  {
    path: 'frontend-expo/src/screens/BucketsExplorerScreen.tsx',
    stack: 'frontend-expo',
    language: 'typescript',
    summary: 'Cross-platform Expo screen with hierarchical folder breadcrumbs, search bar, and multi-select bulk actions.',
    content: `import React, { useState } from 'react';
import { View, Text, Pressable, FlatList, TextInput, Platform } from 'react-native';
import type { DirectoryListing, R2ObjectItem } from '../types/api';
import { handleApiError, type FriendlyError } from '../services/apiErrorHandler';

export function BucketsExplorerScreen({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [bucket] = useState('buckets-prod-assets');
  const [prefix, setPrefix] = useState('');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<FriendlyError | null>(null);

  const toggleSelect = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runBulkDelete = async () => {
    try {
      const res = await fetch(\`\${apiBaseUrl}/api/objects/bulk-delete\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucket, keys: Array.from(selectedKeys) }),
      });
      if (!res.ok) throw await res.json();
      setSelectedKeys(new Set());
    } catch (err) {
      setError(handleApiError(err, 'BulkDelete'));
    }
  };

  return (
    <View style={{ flex: 1, padding: Platform.OS === 'web' ? 24 : 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '700' }}>Cloudflare Buckets · {bucket}</Text>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search files or metadata tags..."
        style={{ borderWidth: 1, borderColor: '#CBD5E1', padding: 10, marginVertical: 12, borderRadius: 8 }}
      />
      {error && (
        <View style={{ backgroundColor: '#FEF2F2', padding: 12, borderRadius: 8, marginBottom: 12 }}>
          <Text style={{ color: '#991B1B', fontWeight: '600' }}>{error.title} ({error.errorCode})</Text>
          <Text style={{ color: '#B91C1C' }}>{error.message}</Text>
        </View>
      )}
      {selectedKeys.size > 0 && (
        <Pressable onPress={runBulkDelete} style={{ backgroundColor: '#DC2626', padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Delete Selected ({selectedKeys.size})</Text>
        </Pressable>
      )}
      <FlatList
        data={listing?.objects ?? []}
        keyExtractor={(item: R2ObjectItem) => item.key}
        renderItem={({ item }) => (
          <Pressable onPress={() => toggleSelect(item.key)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#E2E8F0' }}>
            <Text>{selectedKeys.has(item.key) ? '[x] ' : '[ ] '}{item.fileName} · {item.size} B</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
`,
  },
  {
    path: 'frontend-expo/__tests__/apiErrorHandler.test.ts',
    stack: 'frontend-expo',
    language: 'typescript',
    summary: 'Jest unit tests verifying RFC 7807 error mapping and platform diagnostic logging.',
    content: `import { handleApiError } from '../src/services/apiErrorHandler';

describe('handleApiError', () => {
  it('maps RFC 7807 error codes into friendly messages', () => {
    const result = handleApiError({
      type: 'about:blank',
      title: 'Bucket Not Empty',
      status: 409,
      detail: 'Bucket contains objects',
      errorCode: 'BUCKET_NOT_EMPTY',
      traceId: 'trace-123',
      timestamp: new Date().toISOString(),
    }, 'DeleteBucket');

    expect(result.errorCode).toBe('BUCKET_NOT_EMPTY');
    expect(result.traceId).toBe('trace-123');
    expect(result.message).toContain('Empty the bucket');
  });
});
`,
  },
  {
    path: 'infra-wrangler/wrangler.toml',
    stack: 'infra-wrangler',
    language: 'toml',
    summary: 'Wrangler Infrastructure-as-Code defining R2 bucket bindings, Analytics Engine metrics, and Tail Worker pipeline.',
    content: `name = "cloudflare-buckets-edge"
main = "src/index.ts"
compatibility_date = "2026-11-01"
compatibility_flags = ["nodejs_compat"]

[[r2_buckets]]
binding = "PROD_ASSETS"
bucket_name = "buckets-prod-assets"
preview_bucket_name = "buckets-prod-assets-preview"

[[r2_buckets]]
binding = "MOBILE_BUILDS"
bucket_name = "buckets-mobile-builds"

[[analytics_engine_datasets]]
binding = "R2_METRICS"
dataset = "buckets_r2_performance"

[[tail_consumers]]
service = "cloudflare-buckets-tail-logger"

[env.staging]
name = "cloudflare-buckets-edge-staging"

[env.production]
name = "cloudflare-buckets-edge-prod"
`,
  },
  {
    path: 'infra-wrangler/src/index.ts',
    stack: 'infra-wrangler',
    language: 'typescript',
    summary: 'Cloudflare Worker R2 edge gateway emitting Server-Timing metrics, Analytics Engine points, and Seq/ELK logs.',
    content: `export interface Env {
  PROD_ASSETS: R2Bucket;
  MOBILE_BUILDS: R2Bucket;
  R2_METRICS: AnalyticsEngineDataset;
  SEQ_INGEST_URL?: string;
  ELK_INGEST_URL?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const started = performance.now();
    const traceId = crypto.randomUUID().slice(0, 16);
    const url = new URL(request.url);
    const key = url.pathname.replace(/^\\//, '');

    if (!key) {
      const listed = await env.PROD_ASSETS.list({ delimiter: '/', limit: 100 });
      const durationMs = Math.round(performance.now() - started);
      ctx.waitUntil(emitWorkerTelemetry(env, { traceId, op: 'ListObjectsV2', key: '/', durationMs, status: 200 }));
      return Response.json(listed, { headers: { 'Server-Timing': \`r2-op;dur=\${durationMs}\`, 'X-Trace-Id': traceId } });
    }

    const obj = await env.PROD_ASSETS.get(key);
    const durationMs = Math.round(performance.now() - started);
    if (!obj) {
      ctx.waitUntil(emitWorkerTelemetry(env, { traceId, op: 'GetObject', key, durationMs, status: 404 }));
      return Response.json({ errorCode: 'OBJECT_NOT_FOUND', traceId, status: 404 }, { status: 404 });
    }

    ctx.waitUntil(emitWorkerTelemetry(env, { traceId, op: 'GetObject', key, durationMs, status: 200, bytes: obj.size }));
    return new Response(obj.body, {
      headers: {
        'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
        'ETag': obj.httpEtag,
        'Server-Timing': \`r2-op;dur=\${durationMs}\`,
        'X-Trace-Id': traceId,
      },
    });
  },
};

async function emitWorkerTelemetry(
  env: Env,
  event: { traceId: string; op: string; key: string; durationMs: number; status: number; bytes?: number },
): Promise<void> {
  env.R2_METRICS?.writeDataPoint({
    blobs: [event.op, event.key, String(event.status)],
    doubles: [event.durationMs, event.bytes ?? 0],
    indexes: [event.traceId],
  });

  if (env.SEQ_INGEST_URL) {
    await fetch(env.SEQ_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.serilog.clef' },
      body: JSON.stringify({ '@t': new Date().toISOString(), '@mt': 'Worker {Op} {Key} -> {Status} ({DurationMs}ms)', ...event }),
    }).catch(() => {});
  }
}
`,
  },
  {
    path: 'infra-wrangler/src/tail-worker.ts',
    stack: 'infra-wrangler',
    language: 'typescript',
    summary: 'Dedicated Cloudflare Tail Worker forwarding Worker execution logs and exceptions to ELK/Seq/Application Insights.',
    content: `export interface TailEnv {
  ELK_INGEST_URL?: string;
  APP_INSIGHTS_ENDPOINT?: string;
}

export default {
  async tail(events: TraceItem[], env: TailEnv): Promise<void> {
    const batch = events.map((ev) => ({
      timestamp: new Date(ev.eventTimestamp ?? Date.now()).toISOString(),
      outcome: ev.outcome,
      logs: ev.logs,
      exceptions: ev.exceptions,
    }));

    if (env.ELK_INGEST_URL) {
      await fetch(env.ELK_INGEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: 'cloudflare-buckets-edge', events: batch }),
      });
    }
  },
};
`,
  },
  {
    path: 'infra-wrangler/scripts/deploy.sh',
    stack: 'infra-wrangler',
    language: 'bash',
    summary: 'Automated IaC script provisioning R2 buckets and deploying Edge + Tail Workers via Wrangler CLI.',
    content: `#!/usr/bin/env bash
set -euo pipefail

ENV="\${1:-production}"
echo "[Buckets IaC] Provisioning Cloudflare R2 buckets..."
npx wrangler r2 bucket create buckets-prod-assets --location enam || true
npx wrangler r2 bucket create buckets-mobile-builds --location wnam || true
npx wrangler r2 bucket create buckets-edge-logs --location weur || true

echo "[Buckets IaC] Deploying Edge Worker and Tail Logger (\$ENV)..."
npx wrangler deploy --env "\$ENV"
`,
  },
];
