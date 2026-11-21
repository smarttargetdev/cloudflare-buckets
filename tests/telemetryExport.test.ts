import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BucketsTelemetry } from '../server/telemetry';
import { R2StorageEngine } from '../server/r2Engine';

describe('Telemetry Log Export & R2 Bucket Usage/Cost Metrics', () => {
  it('exports current session logs as RFC 4180 CSV and structured JSON', () => {
    const telemetry = new BucketsTelemetry();
    telemetry.recordOperation({
      operation: 'PutObject',
      durationMs: 32,
      bytes: 1024,
      statusCode: 200,
      traceId: 'exp-trace-1',
      bucket: 'buckets-prod-assets',
      message: 'Uploaded "hero,logo.svg" cleanly',
    });

    const csv = telemetry.exportLogs('csv');
    assert.equal(csv.extension, 'csv');
    assert.match(csv.mimeType, /text\/csv/);
    assert.match(csv.content, /^id,timestamp,level,source,traceId,operation/);
    assert.match(csv.content, /"Uploaded ""hero,logo\.svg"" cleanly"/);

    const json = telemetry.exportLogs('json');
    assert.equal(json.extension, 'json');
    const parsed = JSON.parse(json.content) as { totalEntries: number; logs: unknown[] };
    assert.ok(parsed.totalEntries >= 4);
    assert.equal(parsed.logs.length, parsed.totalEntries);
  });

  it('computes per-bucket storage usage, request counts, and R2 zero egress vs S3 cost', async () => {
    const engine = new R2StorageEngine();
    const telemetry = new BucketsTelemetry();
    const buckets = await engine.listBuckets('sandbox');

    const snapshot = telemetry.getMetricsSnapshot(buckets);
    assert.equal(snapshot.bucketMetrics.length, buckets.length);

    const prod = snapshot.bucketMetrics.find((b) => b.bucket === 'buckets-prod-assets');
    assert.ok(prod);
    assert.ok(prod.storageBytes > 0);
    assert.ok(prod.requestCount > 0);
    assert.equal(prod.r2EgressCostUsd, 0);
    assert.ok(prod.s3EquivalentEgressUsd > 0);
  });
});
