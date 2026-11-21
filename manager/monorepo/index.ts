import JSZip from 'jszip';
import { DOTNET_FILES } from './dotnetCatalog';
import { EXPO_AND_WRANGLER_FILES } from './expoWranglerCatalog';
import type { MonorepoFile, R2LocationHint } from '../shared/types';

export const MONOREPO_FILES: MonorepoFile[] = [
  ...DOTNET_FILES,
  ...EXPO_AND_WRANGLER_FILES,
];

export interface WranglerBindingConfig {
  binding: string;
  bucketName: string;
  locationHint: R2LocationHint;
}

export function generateWranglerToml(options: {
  workerName: string;
  environment: 'development' | 'staging' | 'production';
  bindings: WranglerBindingConfig[];
  enableAnalyticsEngine: boolean;
  enableTailWorker: boolean;
}): string {
  const lines: string[] = [
    `name = "${options.workerName}"`,
    'main = "src/index.ts"',
    'compatibility_date = "2026-11-01"',
    'compatibility_flags = ["nodejs_compat"]',
    '',
  ];

  for (const b of options.bindings) {
    lines.push('[[r2_buckets]]');
    lines.push(`binding = "${b.binding}"`);
    lines.push(`bucket_name = "${b.bucketName}"`);
    lines.push(`preview_bucket_name = "${b.bucketName}-preview"`);
    lines.push('');
  }

  if (options.enableAnalyticsEngine) {
    lines.push('[[analytics_engine_datasets]]');
    lines.push('binding = "R2_METRICS"');
    lines.push('dataset = "buckets_r2_performance"');
    lines.push('');
  }

  if (options.enableTailWorker) {
    lines.push('[[tail_consumers]]');
    lines.push('service = "cloudflare-buckets-tail-logger"');
    lines.push('');
  }

  lines.push(`[env.${options.environment}]`);
  lines.push(`name = "${options.workerName}-${options.environment}"`);
  lines.push('workers_dev = true');

  return lines.join('\n');
}

export async function exportMonorepoZip(customWranglerToml?: string): Promise<Blob> {
  const zip = new JSZip();
  for (const file of MONOREPO_FILES) {
    const content =
      file.path === 'infra-wrangler/wrangler.toml' && customWranglerToml
        ? customWranglerToml
        : file.content;
    zip.file(file.path, content);
  }
  return zip.generateAsync({ type: 'blob' });
}
