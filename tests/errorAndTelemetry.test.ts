import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AppApiError, toProblemDetails } from '../server/errors';
import { BucketsTelemetry } from '../server/telemetry';

describe('RFC 7807 Error Formatting & Telemetry Metrics', () => {
  it('formats AppApiError into RFC 7807 ProblemDetails with traceId', () => {
    const err = new AppApiError({
      status: 409,
      errorCode: 'BUCKET_NOT_EMPTY',
      title: 'Bucket Not Empty',
      detail: 'Delete objects first.',
    });

    const problem = toProblemDetails(err, '/api/buckets/prod', 'trace-abc-123');
    assert.equal(problem.status, 409);
    assert.equal(problem.errorCode, 'BUCKET_NOT_EMPTY');
    assert.equal(problem.traceId, 'trace-abc-123');
    assert.equal(problem.instance, '/api/buckets/prod');
  });

  it('aggregates R2 performance metrics (avg, p50, p95, bytes) and sink toggles', () => {
    const telemetry = new BucketsTelemetry();
    telemetry.recordOperation({
      operation: 'PutObject',
      durationMs: 120,
      bytes: 4096,
      statusCode: 200,
      traceId: 't-1',
      bucket: 'buckets-prod-assets',
      message: 'Put test object',
    });
    telemetry.recordOperation({
      operation: 'PutObject',
      durationMs: 60,
      bytes: 2048,
      statusCode: 500,
      traceId: 't-2',
      errorCode: 'R2_TIMEOUT',
      message: 'Simulated failure',
    });

    const snapshot = telemetry.getMetricsSnapshot();
    const putMetric = snapshot.operations.find((o) => o.operation === 'PutObject');
    assert.ok(putMetric);
    assert.ok(putMetric.count >= 3);
    assert.ok(putMetric.errorCount >= 1);
    assert.ok(putMetric.p95Ms >= putMetric.p50Ms);

    const updatedSinks = telemetry.updateSink('ElkStack', { enabled: true });
    assert.equal(updatedSinks.find((s) => s.id === 'ElkStack')?.enabled, true);
  });
});
