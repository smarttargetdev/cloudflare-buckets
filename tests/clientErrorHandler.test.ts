import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBreadcrumbs,
  formatBytes,
  normalizePrefix,
  parseApiError,
} from '../src/shared/errorHandler';

describe('Frontend Client Error Handler & Path Utilities', () => {
  it('maps RFC 7807 API error payloads to localized user guidance', () => {
    const parsed = parseApiError({
      type: 'https://buckets.cloudflare.dev/errors/bucket_not_empty',
      title: 'Bucket Not Empty',
      status: 409,
      detail: 'Raw server detail',
      errorCode: 'BUCKET_NOT_EMPTY',
      traceId: 'trace-9988',
      timestamp: new Date().toISOString(),
    });

    assert.equal(parsed.errorCode, 'BUCKET_NOT_EMPTY');
    assert.equal(parsed.traceId, 'trace-9988');
    assert.match(parsed.userMessage, /vazio/i);
  });

  it('normalizes prefixes and builds hierarchical breadcrumbs', () => {
    assert.equal(normalizePrefix('releases/v2.4'), 'releases/v2.4/');
    assert.equal(normalizePrefix('///'), '');

    const crumbs = buildBreadcrumbs('releases/v2.4/android');
    assert.deepEqual(crumbs, [
      { label: 'releases', prefix: 'releases/' },
      { label: 'v2.4', prefix: 'releases/v2.4/' },
      { label: 'android', prefix: 'releases/v2.4/android/' },
    ]);
  });

  it('formats byte sizes cleanly', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(1536), '1.5 KB');
    assert.equal(formatBytes(1048576), '1.0 MB');
  });
});
