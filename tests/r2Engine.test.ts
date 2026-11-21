import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { R2StorageEngine, validateBucketName, validateFolderPrefix } from '../server/r2Engine';
import { AppApiError } from '../server/errors';

describe('R2StorageEngine — Buckets, Hierarchical Folders, Search & Bulk Ops', () => {
  it('validates Cloudflare R2 bucket naming rules and rejects invalid names', () => {
    assert.doesNotThrow(() => validateBucketName('buckets-prod-assets'));
    assert.throws(
      () => validateBucketName('Invalid_Upper_Bucket'),
      (err: unknown) => err instanceof AppApiError && err.errorCode === 'BUCKET_NAME_INVALID',
    );
  });

  it('prevents directory traversal in virtual folder prefixes', () => {
    assert.equal(validateFolderPrefix('/releases/v3.0'), 'releases/v3.0/');
    assert.throws(
      () => validateFolderPrefix('../../etc/passwd'),
      (err: unknown) => err instanceof AppApiError && err.errorCode === 'FOLDER_INVALID_NAME',
    );
  });

  it('creates virtual folder markers and navigates hierarchical prefixes', async () => {
    const engine = new R2StorageEngine();
    await engine.createFolder('buckets-prod-assets', 'exports/2026', true, 'sandbox');
    await engine.putObject(
      'buckets-prod-assets',
      'exports/2026/summary.json',
      Buffer.from('{"ok":true}'),
      'application/json',
      { env: 'qa', owner: 'data' },
      'sandbox',
    );

    const root = await engine.listDirectory('buckets-prod-assets', '', 'sandbox');
    assert.ok(root.folders.some((f) => f.prefix === 'exports/'));

    const level1 = await engine.listDirectory('buckets-prod-assets', 'exports/', 'sandbox');
    assert.ok(level1.folders.some((f) => f.prefix === 'exports/2026/' && f.hasMarkerObject));

    const level2 = await engine.listDirectory('buckets-prod-assets', 'exports/2026/', 'sandbox');
    assert.equal(level2.objects.length, 1);
    assert.equal(level2.objects[0].fileName, 'summary.json');
  });

  it('searches across buckets by filename and metadata tags', async () => {
    const engine = new R2StorageEngine();
    const byTag = await engine.searchObjects({ tagKey: 'iac', tagValue: 'wrangler' }, 'sandbox');
    assert.ok(byTag.totalMatches >= 1);
    assert.ok(byTag.results.some((r) => r.fileName === 'wrangler.prod.toml'));

    const byName = await engine.searchObjects({ query: 'manifest.json' }, 'sandbox');
    assert.ok(byName.results.some((r) => r.bucket === 'buckets-mobile-builds'));
  });

  it('executes bulk move and bulk delete with partial failure reporting', async () => {
    const engine = new R2StorageEngine();
    await engine.putObject(
      'buckets-prod-assets',
      'temp/a.txt',
      Buffer.from('alpha'),
      'text/plain',
      { batch: '1' },
      'sandbox',
    );

    const moveRes = await engine.bulkMove(
      {
        sourceBucket: 'buckets-prod-assets',
        destinationBucket: 'buckets-edge-logs',
        destinationPrefix: 'archived/',
        keys: ['temp/a.txt', 'temp/missing.txt'],
        overwrite: true,
      },
      'sandbox',
    );

    assert.equal(moveRes.succeededCount, 1);
    assert.equal(moveRes.failedCount, 1);
    assert.equal(moveRes.failures[0].errorCode, 'OBJECT_NOT_FOUND');

    const destListing = await engine.listDirectory('buckets-edge-logs', 'archived/', 'sandbox');
    assert.ok(destListing.objects.some((o) => o.fileName === 'a.txt'));

    const delRes = await engine.bulkDelete(
      { bucket: 'buckets-edge-logs', keys: ['archived/a.txt'] },
      'sandbox',
    );
    assert.equal(delRes.succeededCount, 1);
    assert.equal(delRes.failedCount, 0);
  });
});
