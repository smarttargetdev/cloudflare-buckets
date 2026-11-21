import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  R2StorageEngine,
  resolveSafeLocalRoot,
  validateBucketName,
  validateFolderPrefix,
} from '../server/r2Engine';
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

  it('guards non-empty buckets and recursively deletes all contents when force=true', async () => {
    const engine = new R2StorageEngine();
    await assert.rejects(
      () => engine.deleteBucket('buckets-prod-assets', 'sandbox', undefined, { force: false }),
      (err: unknown) => err instanceof AppApiError && err.status === 409 && err.errorCode === 'BUCKET_NOT_EMPTY',
    );

    const forceRes = await engine.deleteBucket('buckets-prod-assets', 'sandbox', undefined, { force: true });
    assert.ok(forceRes.deletedCount >= 4);

    const remaining = await engine.listBuckets('sandbox');
    assert.ok(!remaining.some((b) => b.name === 'buckets-prod-assets'));
  });

  it('guards non-empty virtual folders and deletes nested contents recursively when confirmed', async () => {
    const engine = new R2StorageEngine();
    await engine.createFolder('buckets-prod-assets', 'empty-dir', true, 'sandbox');
    const emptyDel = await engine.deleteFolder('buckets-prod-assets', 'empty-dir/', 'sandbox', undefined, { recursive: false });
    assert.equal(emptyDel.deletedCount, 1);

    await assert.rejects(
      () => engine.deleteFolder('buckets-prod-assets', 'branding/', 'sandbox', undefined, { recursive: false }),
      (err: unknown) => err instanceof AppApiError && err.status === 409 && err.errorCode === 'FOLDER_NOT_EMPTY',
    );

    const recDel = await engine.deleteFolder('buckets-prod-assets', 'branding/', 'sandbox', undefined, { recursive: true });
    assert.equal(recDel.deletedCount, 3);

    const rootAfter = await engine.listDirectory('buckets-prod-assets', '', 'sandbox');
    assert.ok(!rootAfter.folders.some((f) => f.prefix === 'branding/'));
  });

  it('rejects restricted system directories and invalid host folder paths', () => {
    assert.throws(
      () => resolveSafeLocalRoot(''),
      (err: unknown) => err instanceof AppApiError && err.errorCode === 'LOCAL_FOLDER_INVALID',
    );
    assert.throws(
      () => resolveSafeLocalRoot('/etc'),
      (err: unknown) => err instanceof AppApiError && err.errorCode === 'LOCAL_FOLDER_SYSTEM_RESTRICTED',
    );
    assert.throws(
      () => resolveSafeLocalRoot('/'),
      (err: unknown) => err instanceof AppApiError && err.errorCode === 'LOCAL_FOLDER_SYSTEM_RESTRICTED',
    );
  });

  it('persists buckets, folders, files, metadata, search, bulk move, and safe deletes in a host local folder', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'buckets-local-test-'));
    const engine = new R2StorageEngine();

    try {
      const inspected = await engine.inspectLocalFolder(tempRoot, true);
      assert.equal(inspected.valid, true);
      assert.equal(inspected.writable, true);
      assert.equal(inspected.bucketCount, 0);

      await engine.createBucket(
        { name: 'local-assets', locationHint: 'ENAM', storageClass: 'Standard' },
        'local',
        undefined,
        tempRoot,
      );
      await engine.createBucket(
        { name: 'local-archive', locationHint: 'WNAM', storageClass: 'InfrequentAccess' },
        'local',
        undefined,
        tempRoot,
      );

      await engine.createFolder('local-assets', 'configs/edge', true, 'local', undefined, tempRoot);
      await engine.putObject(
        'local-assets',
        'configs/edge/worker.json',
        Buffer.from('{"route":"*"}', 'utf-8'),
        'application/json',
        { env: 'host-local', owner: 'cli' },
        'local',
        undefined,
        tempRoot,
      );

      // Verify real file exists on host filesystem
      const diskFile = await fs.readFile(path.join(tempRoot, 'local-assets', 'configs/edge/worker.json'), 'utf-8');
      assert.equal(diskFile, '{"route":"*"}');

      // List buckets reflects real file count and bytes (ignoring sidecar manifest)
      const buckets = await engine.listBuckets('local', undefined, tempRoot);
      const assetsBucket = buckets.find((b) => b.name === 'local-assets');
      assert.ok(assetsBucket);
      assert.equal(assetsBucket.objectCount, 1);
      assert.equal(assetsBucket.totalBytes, Buffer.byteLength('{"route":"*"}'));

      // Preview & search by metadata tag
      const preview = await engine.getObjectPreview('local-assets', 'configs/edge/worker.json', 'local', undefined, tempRoot);
      assert.equal(preview.textContent, '{"route":"*"}');
      assert.equal(preview.metadata.owner, 'cli');

      const search = await engine.searchObjects({ tagKey: 'env', tagValue: 'host-local' }, 'local', undefined, tempRoot);
      assert.equal(search.totalMatches, 1);
      assert.equal(search.results[0].bucket, 'local-assets');

      // Path traversal rejection on object key
      await assert.rejects(
        () =>
          engine.putObject(
            'local-assets',
            '../../escape.txt',
            Buffer.from('bad'),
            'text/plain',
            {},
            'local',
            undefined,
            tempRoot,
          ),
        (err: unknown) => err instanceof AppApiError && err.errorCode === 'OBJECT_KEY_INVALID',
      );

      // Bulk move across buckets on disk
      const moveRes = await engine.bulkMove(
        {
          sourceBucket: 'local-assets',
          destinationBucket: 'local-archive',
          destinationPrefix: '2026/',
          keys: ['configs/edge/worker.json'],
          overwrite: false,
        },
        'local',
        undefined,
        tempRoot,
      );
      assert.equal(moveRes.succeededCount, 1);
      const archivedListing = await engine.listDirectory('local-archive', '2026/', 'local', undefined, tempRoot);
      assert.equal(archivedListing.objects.length, 1);
      assert.equal(archivedListing.objects[0].fileName, 'worker.json');

      // Guard non-empty bucket delete vs force=true
      await assert.rejects(
        () => engine.deleteBucket('local-archive', 'local', undefined, { force: false }, tempRoot),
        (err: unknown) => err instanceof AppApiError && err.errorCode === 'BUCKET_NOT_EMPTY',
      );
      await engine.deleteBucket('local-archive', 'local', undefined, { force: true }, tempRoot);

      // Force-delete remaining bucket leaves zero buckets cleanly
      await engine.deleteBucket('local-assets', 'local', undefined, { force: true }, tempRoot);
      const afterAllDeleted = await engine.listBuckets('local', undefined, tempRoot);
      assert.equal(afterAllDeleted.length, 0);
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});

