import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronRight,
  Database,
  Download,
  Eye,
  FileCode2,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  MoveRight,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { isEditableExtension } from '../shared/codeEditorUtils';
import { buildBreadcrumbs, formatBytes, type ParsedClientError } from '../shared/errorHandler';
import { formatTemplate } from '../shared/i18n';
import { useLocale } from '../shared/LocaleContext';
import type {
  BucketSummary,
  BulkOperationResult,
  DirectoryListing,
  ObjectPreviewResponse,
  PresignedUrlResponse,
  R2LocationHint,
  R2StorageClass,
} from '../shared/types';
import { ErrorBanner } from './ErrorBanner';

interface BucketsExplorerProps {
  selectedBucket: string;
  currentPrefix: string;
  onSelectBucket: (bucket: string) => void;
  onChangePrefix: (prefix: string) => void;
  onOpenEditor: (bucket: string, key: string, isNew: boolean) => void;
  connectionVersion: number;
}

function hasDragFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function BucketsExplorer({
  selectedBucket,
  currentPrefix,
  onSelectBucket,
  onChangePrefix,
  onOpenEditor,
  connectionVersion,
}: BucketsExplorerProps) {
  const { locale, t } = useLocale();
  const [buckets, setBuckets] = useState<BucketSummary[]>([]);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [loadingDir, setLoadingDir] = useState(false);
  const [error, setError] = useState<ParsedClientError | null>(null);
  const [bulkReport, setBulkReport] = useState<BulkOperationResult | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketLocation, setNewBucketLocation] = useState<R2LocationHint>('ENAM');
  const [newBucketClass, setNewBucketClass] = useState<R2StorageClass>('Standard');

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createMarker, setCreateMarker] = useState(true);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [modalDragActive, setModalDragActive] = useState(false);
  const [metaTagKey, setMetaTagKey] = useState('env');
  const [metaTagVal, setMetaTagVal] = useState('production');
  const [uploading, setUploading] = useState(false);
  const [dropUploadProgress, setDropUploadProgress] = useState<{
    completed: number;
    total: number;
    currentName: string;
  } | null>(null);

  const [isDraggingOverExplorer, setIsDraggingOverExplorer] = useState(false);
  const [dragOverFolderPrefix, setDragOverFolderPrefix] = useState<string | null>(null);
  const dragDepthRef = useRef(0);
  const quickDropInputRef = useRef<HTMLInputElement>(null);

  const [showBulkMove, setShowBulkMove] = useState(false);
  const [moveDestBucket, setMoveDestBucket] = useState('');
  const [moveDestPrefix, setMoveDestPrefix] = useState('');
  const [moveOverwrite, setMoveOverwrite] = useState(false);
  const [movingBulk, setMovingBulk] = useState(false);

  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);

  const [preview, setPreview] = useState<ObjectPreviewResponse | null>(null);
  const [presigned, setPresigned] = useState<PresignedUrlResponse | null>(null);

  const [forceDeleteTarget, setForceDeleteTarget] = useState<{
    kind: 'bucket' | 'folder' | 'bulk-folder';
    target: string;
    bulkKeys?: string[];
  } | null>(null);
  const [forceConfirmInput, setForceConfirmInput] = useState('');
  const [forceDeleting, setForceDeleting] = useState(false);

  const selectedBucketRef = useRef(selectedBucket);
  selectedBucketRef.current = selectedBucket;

  const loadBuckets = useCallback(async () => {
    setLoadingBuckets(true);
    setError(null);
    try {
      const list = await apiClient.listBuckets();
      setBuckets(list);
      const activeName = selectedBucketRef.current;
      if (list.length === 0) {
        onSelectBucket('');
        onChangePrefix('');
        setListing(null);
        setSelectedKeys(new Set());
        setPreview(null);
        setPresigned(null);
      } else if (!list.some((b) => b.name === activeName)) {
        onSelectBucket(list[0].name);
        onChangePrefix('');
        setListing(null);
        setSelectedKeys(new Set());
        setPreview(null);
        setPresigned(null);
      }
    } catch (err) {
      setBuckets([]);
      setListing(null);
      setError(err as ParsedClientError);
    } finally {
      setLoadingBuckets(false);
    }
  }, [onSelectBucket, onChangePrefix]);

  const loadDirectory = useCallback(async () => {
    if (!selectedBucket || buckets.length === 0 || !buckets.some((b) => b.name === selectedBucket)) {
      if (!selectedBucket || buckets.length === 0) {
        setListing(null);
        setSelectedKeys(new Set());
      }
      return;
    }
    setLoadingDir(true);
    setError(null);
    try {
      const data = await apiClient.listDirectory(selectedBucket, currentPrefix);
      setListing(data);
      setSelectedKeys(new Set());
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setLoadingDir(false);
    }
  }, [selectedBucket, currentPrefix, buckets]);

  const handleRefreshAll = async () => {
    await loadBuckets();
    await loadDirectory();
  };

  useEffect(() => {
    setListing(null);
    setSelectedKeys(new Set());
    setPreview(null);
    setPresigned(null);
    setUploadNotice(null);
    setBulkReport(null);
  }, [connectionVersion]);

  useEffect(() => {
    loadBuckets();
  }, [loadBuckets, connectionVersion]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory, connectionVersion]);

  const handleCreateBucket = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await apiClient.createBucket({
        name: newBucketName.trim(),
        locationHint: newBucketLocation,
        storageClass: newBucketClass,
      });
      setShowNewBucket(false);
      setNewBucketName('');
      await loadBuckets();
      onSelectBucket(created.name);
      onChangePrefix('');
    } catch (err) {
      setError(err as ParsedClientError);
    }
  };

  const handleDeleteBucket = async (bucketName: string) => {
    setError(null);
    try {
      await apiClient.deleteBucket(bucketName, false);
      if (selectedBucket === bucketName) {
        onChangePrefix('');
        setListing(null);
        setSelectedKeys(new Set());
        setPreview(null);
        setPresigned(null);
      }
      await loadBuckets();
    } catch (err) {
      const parsed = err as ParsedClientError;
      if (parsed.errorCode === 'BUCKET_NOT_EMPTY') {
        setForceConfirmInput('');
        setForceDeleteTarget({ kind: 'bucket', target: bucketName });
        return;
      }
      setError(parsed);
    }
  };

  const handleDeleteFolder = async (folderPrefix: string) => {
    setError(null);
    try {
      await apiClient.deleteFolder(selectedBucket, folderPrefix, false);
      await loadDirectory();
      await loadBuckets();
    } catch (err) {
      const parsed = err as ParsedClientError;
      if (parsed.errorCode === 'FOLDER_NOT_EMPTY') {
        setForceConfirmInput('');
        setForceDeleteTarget({ kind: 'folder', target: folderPrefix });
        return;
      }
      setError(parsed);
    }
  };

  const handleConfirmForceDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forceDeleteTarget) return;
    if (forceConfirmInput.trim() !== forceDeleteTarget.target) return;

    setForceDeleting(true);
    setError(null);
    try {
      if (forceDeleteTarget.kind === 'bucket') {
        await apiClient.deleteBucket(forceDeleteTarget.target, true);
        if (selectedBucket === forceDeleteTarget.target) {
          onChangePrefix('');
          setListing(null);
          setSelectedKeys(new Set());
          setPreview(null);
          setPresigned(null);
        }
        setForceDeleteTarget(null);
        setForceConfirmInput('');
        await loadBuckets();
      } else if (forceDeleteTarget.kind === 'folder') {
        await apiClient.deleteFolder(selectedBucket, forceDeleteTarget.target, true);
        setForceDeleteTarget(null);
        setForceConfirmInput('');
        await loadDirectory();
        await loadBuckets();
      } else {
        const res = await apiClient.bulkDelete({
          bucket: selectedBucket,
          keys: forceDeleteTarget.bulkKeys ?? [],
          recursiveFolders: true,
        });
        setBulkReport(res);
        setSelectedKeys(new Set());
        setForceDeleteTarget(null);
        setForceConfirmInput('');
        await loadDirectory();
        await loadBuckets();
      }
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setForceDeleting(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const targetPrefix = `${currentPrefix}${newFolderName.trim().replace(/^\/+|\/+$/g, '')}/`;
      await apiClient.createFolder(selectedBucket, targetPrefix, createMarker);
      setShowNewFolder(false);
      setNewFolderName('');
      await loadDirectory();
    } catch (err) {
      setError(err as ParsedClientError);
    }
  };

  const uploadFilesToFolder = useCallback(
    async (
      filesToUpload: File[],
      targetPrefix: string,
      metadata: Record<string, string> = {},
    ): Promise<boolean> => {
      if (!selectedBucket || filesToUpload.length === 0) return false;
      setUploading(true);
      setError(null);
      setUploadNotice(null);
      try {
        for (let i = 0; i < filesToUpload.length; i += 1) {
          const file = filesToUpload[i];
          setDropUploadProgress({
            completed: i,
            total: filesToUpload.length,
            currentName: file.name,
          });
          await apiClient.uploadFile(selectedBucket, targetPrefix, file, metadata);
        }
        setDropUploadProgress(null);
        const destTarget = `${selectedBucket}/${targetPrefix}`;
        setUploadNotice(
          formatTemplate(t.buckets.dropUploadDone, {
            count: filesToUpload.length,
            target: destTarget,
          }),
        );
        await loadDirectory();
        await loadBuckets();
        return true;
      } catch (err) {
        setDropUploadProgress(null);
        setError(err as ParsedClientError);
        return false;
      } finally {
        setUploading(false);
      }
    },
    [selectedBucket, t.buckets.dropUploadDone, loadDirectory, loadBuckets],
  );

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFiles.length === 0) return;
    const metadata: Record<string, string> = {};
    if (metaTagKey.trim() && metaTagVal.trim()) {
      metadata[metaTagKey.trim()] = metaTagVal.trim();
    }
    const ok = await uploadFilesToFolder(uploadFiles, currentPrefix, metadata);
    if (ok) {
      setShowUpload(false);
      setUploadFiles([]);
    }
  };

  const handleExplorerDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingOverExplorer(true);
  };

  const handleExplorerDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleExplorerDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingOverExplorer(false);
      setDragOverFolderPrefix(null);
    }
  };

  const handleExplorerDrop = async (e: React.DragEvent<HTMLElement>) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingOverExplorer(false);
    setDragOverFolderPrefix(null);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      await uploadFilesToFolder(dropped, currentPrefix);
    }
  };

  const handleFolderDragOver = (e: React.DragEvent<HTMLTableRowElement>, folderPrefix: string) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverFolderPrefix(folderPrefix);
  };

  const handleFolderDragLeave = (e: React.DragEvent<HTMLTableRowElement>, folderPrefix: string) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOverFolderPrefix((prev) => (prev === folderPrefix ? null : prev));
  };

  const handleFolderDrop = async (e: React.DragEvent<HTMLTableRowElement>, folderPrefix: string) => {
    if (!hasDragFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingOverExplorer(false);
    setDragOverFolderPrefix(null);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      await uploadFilesToFolder(dropped, folderPrefix);
    }
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (!listing) return;
    const allKeys = [
      ...listing.folders.map((f) => f.prefix),
      ...listing.objects.map((o) => o.key),
    ];
    if (selectedKeys.size === allKeys.length && allKeys.length > 0) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(allKeys));
    }
  };

  const executeBulkDelete = async () => {
    if (selectedKeys.size === 0) return;
    setDeletingBulk(true);
    setError(null);
    const keysArray = Array.from(selectedKeys);
    const selectedFolders = keysArray.filter((k) => k.endsWith('/'));

    try {
      if (selectedFolders.length === 1 && keysArray.length === 1) {
        setShowBulkDeleteConfirm(false);
        await handleDeleteFolder(selectedFolders[0]);
        return;
      }

      if (selectedFolders.length > 0) {
        for (const folderPrefix of selectedFolders) {
          try {
            await apiClient.deleteFolder(selectedBucket, folderPrefix, false);
          } catch (err) {
            const parsed = err as ParsedClientError;
            if (parsed.errorCode === 'FOLDER_NOT_EMPTY') {
              setShowBulkDeleteConfirm(false);
              setForceConfirmInput('');
              setForceDeleteTarget({
                kind: 'bulk-folder',
                target: folderPrefix,
                bulkKeys: keysArray,
              });
              return;
            }
            setError(parsed);
            return;
          }
        }
        const remainingFiles = keysArray.filter((k) => !k.endsWith('/'));
        if (remainingFiles.length === 0) {
          setShowBulkDeleteConfirm(false);
          setSelectedKeys(new Set());
          await loadDirectory();
          await loadBuckets();
          return;
        }
      }

      const res = await apiClient.bulkDelete({
        bucket: selectedBucket,
        keys: keysArray.filter((k) => !k.endsWith('/')),
        recursiveFolders: true,
      });
      setBulkReport(res);
      setShowBulkDeleteConfirm(false);
      setSelectedKeys(new Set());
      await loadDirectory();
      await loadBuckets();
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setDeletingBulk(false);
    }
  };

  const handleBulkMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedKeys.size === 0) return;
    setMovingBulk(true);
    setError(null);
    try {
      const res = await apiClient.bulkMove({
        sourceBucket: selectedBucket,
        destinationBucket: moveDestBucket || selectedBucket,
        destinationPrefix: moveDestPrefix,
        keys: Array.from(selectedKeys),
        overwrite: moveOverwrite,
      });
      setBulkReport(res);
      setShowBulkMove(false);
      setSelectedKeys(new Set());
      await loadDirectory();
      await loadBuckets();
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setMovingBulk(false);
    }
  };

  const handlePreview = async (key: string) => {
    setError(null);
    setPresigned(null);
    try {
      const data = await apiClient.previewObject(selectedBucket, key);
      setPreview(data);
    } catch (err) {
      setError(err as ParsedClientError);
    }
  };

  const handlePresign = async (key: string) => {
    setError(null);
    try {
      const data = await apiClient.presignObject(selectedBucket, key, 900);
      setPresigned(data);
    } catch (err) {
      setError(err as ParsedClientError);
    }
  };

  const breadcrumbs = buildBreadcrumbs(currentPrefix);
  const activeBucketMeta = buckets.find((b) => b.name === selectedBucket);
  const selectedList = Array.from(selectedKeys);

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {uploadNotice && (
        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-white dark:bg-[#111827] px-4 py-3 flex items-center justify-between gap-4 text-sm">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {uploadNotice}
          </p>
          <button
            type="button"
            onClick={() => setUploadNotice(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {t.buckets.dismiss}
          </button>
        </div>
      )}

      {bulkReport && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-4 py-3 flex items-center justify-between gap-4 text-sm">
          <div className="space-y-0.5">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {formatTemplate(t.buckets.bulkDone, {
                op: bulkReport.operation === 'delete' ? t.buckets.bulkDeleteOp : t.buckets.bulkMoveOp,
              })}{' '}
              <span className="font-mono tabular-nums">{bulkReport.elapsedMs} ms</span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {formatTemplate(t.buckets.bulkSummary, {
                succeeded: bulkReport.succeededCount,
                failed: bulkReport.failedCount,
              })}
              {bulkReport.failures.length > 0 &&
                formatTemplate(t.buckets.bulkFirstError, {
                  key: bulkReport.failures[0].key,
                  reason: bulkReport.failures[0].reason,
                })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBulkReport(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            {t.buckets.dismiss}
          </button>
        </div>
      )}

      {/* Buckets Strip */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.buckets.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.buckets.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleRefreshAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.buckets.refresh}
            </button>
            <button
              type="button"
              onClick={() => setShowNewBucket(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.buckets.newBucket}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          {loadingBuckets ? (
            <div className="col-span-3 p-5 text-xs text-slate-500">{t.buckets.loadingBuckets}</div>
          ) : buckets.length === 0 ? (
            <div className="col-span-3 p-6 text-center text-sm text-slate-500">
              {t.buckets.emptyBuckets}
            </div>
          ) : (
            buckets.map((b) => {
              const active = b.name === selectedBucket;
              return (
                <div
                  key={b.name}
                  className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                    active
                      ? 'bg-orange-50/60 dark:bg-orange-950/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBucket(b.name);
                      onChangePrefix('');
                    }}
                    className="text-left flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <Database
                        className={`h-4 w-4 shrink-0 ${
                          active ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'
                        }`}
                      />
                      <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {b.name}
                      </span>
                    </div>
                    <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {b.locationHint} · {b.storageClass} · {b.objectCount} {t.buckets.objectsUnit} · {formatBytes(b.totalBytes)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBucket(b.name)}
                    title={t.buckets.deleteEmptyBucketTitle}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Directory Explorer + OS Drag-and-Drop Support */}
      {selectedBucket && (
        <section
          onDragEnter={handleExplorerDragEnter}
          onDragOver={handleExplorerDragOver}
          onDragLeave={handleExplorerDragLeave}
          onDrop={handleExplorerDrop}
          className={`relative rounded-xl border bg-white dark:bg-[#111827] overflow-hidden transition-colors ${
            isDraggingOverExplorer && !dragOverFolderPrefix
              ? 'border-orange-500 ring-2 ring-orange-500/20'
              : 'border-slate-200 dark:border-slate-800'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <nav aria-label={t.buckets.folderBreadcrumbsAria} className="flex items-center flex-wrap gap-1 text-sm">
              <button
                type="button"
                onClick={() => onChangePrefix('')}
                className={`font-mono text-xs font-semibold px-2 py-1 rounded-md transition-colors ${
                  currentPrefix === ''
                    ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {selectedBucket}
              </button>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <div key={crumb.prefix} className="flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    <button
                      type="button"
                      onClick={() => onChangePrefix(crumb.prefix)}
                      className={`font-mono text-xs px-2 py-1 rounded-md transition-colors ${
                        isLast
                          ? 'font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {crumb.label}
                    </button>
                  </div>
                );
              })}
            </nav>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onOpenEditor(selectedBucket, `${currentPrefix}untitled.ts`, true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                {t.buckets.newFile}
              </button>
              <button
                type="button"
                onClick={() => setShowNewFolder(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                {t.buckets.newFolder}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadFiles([]);
                  setShowUpload(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                {t.buckets.uploadFile}
              </button>
            </div>
          </div>

          {/* Drag-and-drop overlay indicator for active folder */}
          {isDraggingOverExplorer && !dragOverFolderPrefix && (
            <div className="px-5 py-3 bg-orange-50/95 dark:bg-orange-950/50 border-b border-orange-200 dark:border-orange-900 flex items-center justify-center gap-2 text-xs font-medium text-orange-700 dark:text-orange-300">
              <Upload className="h-4 w-4 shrink-0" />
              <span>
                {formatTemplate(t.buckets.dropOverlayTitle, {
                  target: `${selectedBucket}/${currentPrefix}`,
                })}
              </span>
            </div>
          )}

          {/* Active drop upload progress bar */}
          {dropUploadProgress && (
            <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-700 dark:text-slate-200">
              <span className="font-mono truncate">
                {formatTemplate(t.buckets.uploadingProgress, {
                  completed: dropUploadProgress.completed + 1,
                  total: dropUploadProgress.total,
                  file: dropUploadProgress.currentName,
                })}
              </span>
              <span className="font-mono tabular-nums shrink-0">
                {Math.round(((dropUploadProgress.completed + 1) / dropUploadProgress.total) * 100)}%
              </span>
            </div>
          )}

          {selectedKeys.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                {formatTemplate(t.buckets.selectedItems, {
                  count: selectedKeys.size,
                  bucket: selectedBucket,
                })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMoveDestBucket(selectedBucket);
                    setMoveDestPrefix('');
                    setShowBulkMove(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  <MoveRight className="h-3.5 w-3.5" />
                  {t.buckets.bulkMove}
                </button>
                <button
                  type="button"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors whitespace-nowrap"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t.buckets.deleteSelected}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 w-10">
                    <input
                      type="checkbox"
                      aria-label={t.buckets.selectAllAria}
                      checked={
                        Boolean(listing) &&
                        listing!.folders.length + listing!.objects.length > 0 &&
                        selectedKeys.size === listing!.folders.length + listing!.objects.length
                      }
                      onChange={toggleAllVisible}
                      className="rounded border-slate-300 dark:border-slate-600 accent-orange-600"
                    />
                  </th>
                  <th className="py-2.5 px-3">{t.buckets.colNamePrefix}</th>
                  <th className="py-2.5 px-3">{t.buckets.colTypeMetadata}</th>
                  <th className="py-2.5 px-3 text-right">{t.buckets.colSize}</th>
                  <th className="py-2.5 px-3 text-right">{t.buckets.colModified}</th>
                  <th className="py-2.5 px-4 text-right">{t.buckets.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {loadingDir ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      {t.buckets.loadingDirectory}
                    </td>
                  </tr>
                ) : !listing || (listing.folders.length === 0 && listing.objects.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      {formatTemplate(t.buckets.emptyDirectory, {
                        bucket: activeBucketMeta?.name ?? selectedBucket,
                      })}
                    </td>
                  </tr>
                ) : (
                  <>
                    {listing.folders.map((folder) => {
                      const isDropTarget = dragOverFolderPrefix === folder.prefix;
                      return (
                        <tr
                          key={folder.prefix}
                          onDragOver={(e) => handleFolderDragOver(e, folder.prefix)}
                          onDragLeave={(e) => handleFolderDragLeave(e, folder.prefix)}
                          onDrop={(e) => handleFolderDrop(e, folder.prefix)}
                          className={`transition-colors ${
                            isDropTarget
                              ? 'bg-orange-50 dark:bg-orange-950/40 ring-1 ring-inset ring-orange-500'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2.5 px-4">
                            <input
                              type="checkbox"
                              aria-label={formatTemplate(t.buckets.selectFolderAria, { name: folder.name })}
                              checked={selectedKeys.has(folder.prefix)}
                              onChange={() => toggleKey(folder.prefix)}
                              className="rounded border-slate-300 dark:border-slate-600 accent-orange-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => onChangePrefix(folder.prefix)}
                              className="inline-flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                            >
                              <Folder className="h-4 w-4 text-orange-500 shrink-0" />
                              <span className="font-mono text-xs">{folder.name}/</span>
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-500 dark:text-slate-400">
                            {isDropTarget ? (
                              <span className="font-medium text-orange-600 dark:text-orange-400">
                                {formatTemplate(t.buckets.dropFolderHint, { folder: folder.name })}
                              </span>
                            ) : folder.hasMarkerObject ? (
                              t.buckets.virtualFolderMarker
                            ) : (
                              t.buckets.virtualFolderPrefix
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-500 tabular-nums">—</td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-500 tabular-nums">—</td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onChangePrefix(folder.prefix)}
                                className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
                              >
                                {t.buckets.openFolder}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteFolder(folder.prefix)}
                                title={t.buckets.deleteFolderTitle}
                                aria-label={t.buckets.deleteFolderTitle}
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {listing.objects.map((obj) => {
                      const tagText = Object.entries(obj.metadata)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' · ');
                      return (
                        <tr
                          key={obj.key}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="py-2.5 px-4">
                            <input
                              type="checkbox"
                              aria-label={formatTemplate(t.buckets.selectFileAria, { name: obj.fileName })}
                              checked={selectedKeys.has(obj.key)}
                              onChange={() => toggleKey(obj.key)}
                              className="rounded border-slate-300 dark:border-slate-600 accent-orange-600"
                            />
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                              <span className="font-mono text-xs text-slate-900 dark:text-slate-100">
                                {obj.fileName}
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                            {obj.contentType}
                            {tagText ? ` · ${tagText}` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                            {formatBytes(obj.size)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {new Date(obj.lastModified).toLocaleDateString(locale)}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {isEditableExtension(obj.key) && (
                                <button
                                  type="button"
                                  onClick={() => onOpenEditor(selectedBucket, obj.key, false)}
                                  title={t.buckets.editInCodeEditorTitle}
                                  className="p-1.5 rounded-md text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <FileCode2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePreview(obj.key)}
                                title={t.buckets.inspectObjectTitle}
                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePresign(obj.key)}
                                title={t.buckets.presignTitle}
                                className="p-1.5 rounded-md text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                              </button>
                              <a
                                href={apiClient.getDownloadUrl(selectedBucket, obj.key)}
                                title={t.buckets.downloadTitle}
                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Interactive OS Drag-and-Drop Footer Strip */}
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Upload className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
              <span>{t.buckets.dropZonePrompt}</span>
            </div>
            <input
              ref={quickDropInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (picked.length > 0) {
                  void uploadFilesToFolder(picked, currentPrefix);
                }
              }}
            />
            <button
              type="button"
              onClick={() => quickDropInputRef.current?.click()}
              disabled={uploading}
              className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? t.buckets.uploading : t.buckets.uploadSubmit}
            </button>
          </div>
        </section>
      )}

      {/* Preview & Presign Panel */}
      {(preview || presigned) && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 font-mono">
              {preview?.key ?? presigned?.key}
            </h3>
            <div className="flex items-center gap-3">
              {preview && isEditableExtension(preview.key) && (
                <button
                  type="button"
                  onClick={() => onOpenEditor(selectedBucket, preview.key, false)}
                  className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
                >
                  {t.buckets.openInEditor}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setPreview(null);
                  setPresigned(null);
                }}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              >
                {t.buckets.closePanel}
              </button>
            </div>
          </div>

          {presigned && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {formatTemplate(t.buckets.presignedTitle, {
                  seconds: presigned.expiresInSeconds,
                  time: new Date(presigned.expiresAt).toLocaleTimeString(locale),
                })}
              </div>
              <code className="block text-xs font-mono text-orange-700 dark:text-orange-400 break-all">
                {presigned.url}
              </code>
            </div>
          )}

          {preview && (
            <div className="space-y-3">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {preview.contentType} · {formatBytes(preview.size)}
                {Object.keys(preview.metadata).length > 0 &&
                  ` · ${t.buckets.tagsPrefix}: ${Object.entries(preview.metadata)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}`}
              </div>
              {preview.dataUrl && (
                <img
                  src={preview.dataUrl}
                  alt={preview.key}
                  referrerPolicy="no-referrer"
                  className="max-h-56 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-2"
                />
              )}
              {preview.isText && preview.textContent !== undefined && (
                <pre className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto max-h-72">
                  {preview.textContent}
                </pre>
              )}
            </div>
          )}
        </section>
      )}

      {/* Modal: Create Bucket */}
      {showNewBucket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handleCreateBucket}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.buckets.createBucketTitle}
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.buckets.bucketNameLabel}
              </label>
              <input
                type="text"
                required
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                placeholder={t.buckets.bucketNamePlaceholder}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t.buckets.locationHintLabel}
                </label>
                <select
                  value={newBucketLocation}
                  onChange={(e) => setNewBucketLocation(e.target.value as R2LocationHint)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="ENAM">{t.buckets.locations.ENAM}</option>
                  <option value="WNAM">{t.buckets.locations.WNAM}</option>
                  <option value="WEUR">{t.buckets.locations.WEUR}</option>
                  <option value="EEUR">{t.buckets.locations.EEUR}</option>
                  <option value="APAC">{t.buckets.locations.APAC}</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t.buckets.storageClassLabel}
                </label>
                <select
                  value={newBucketClass}
                  onChange={(e) => setNewBucketClass(e.target.value as R2StorageClass)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="Standard">{t.buckets.storageClasses.Standard}</option>
                  <option value="InfrequentAccess">{t.buckets.storageClasses.InfrequentAccess}</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewBucket(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {t.buckets.cancel}
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg">
                {t.buckets.createBucketSubmit}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Create Folder */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handleCreateFolder}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.buckets.createFolderTitle}
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {formatTemplate(t.buckets.folderPathLabel, { prefix: currentPrefix || '/' })}
              </label>
              <input
                type="text"
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={t.buckets.folderPathPlaceholder}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={createMarker}
                onChange={(e) => setCreateMarker(e.target.checked)}
                className="accent-orange-600"
              />
              {t.buckets.createMarkerLabel}
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewFolder(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {t.buckets.cancel}
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg">
                {t.buckets.createFolderSubmit}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Upload File(s) with Drag-and-Drop */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handleUpload}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {formatTemplate(t.buckets.uploadModalTitle, { prefix: currentPrefix || '/' })}
            </h3>

            <div
              onDragOver={(e) => {
                if (!hasDragFiles(e)) return;
                e.preventDefault();
                setModalDragActive(true);
              }}
              onDragLeave={(e) => {
                if (!hasDragFiles(e)) return;
                e.preventDefault();
                setModalDragActive(false);
              }}
              onDrop={(e) => {
                if (!hasDragFiles(e)) return;
                e.preventDefault();
                setModalDragActive(false);
                const dropped = Array.from(e.dataTransfer.files);
                if (dropped.length > 0) {
                  setUploadFiles(dropped);
                }
              }}
              className={`rounded-lg border border-dashed p-4 text-center space-y-2 transition-colors ${
                modalDragActive
                  ? 'border-orange-500 bg-orange-50/70 dark:bg-orange-950/30'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50'
              }`}
            >
              <Upload className="h-5 w-5 mx-auto text-orange-600 dark:text-orange-400" />
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {t.buckets.uploadModalDropHint}
              </p>
              <input
                type="file"
                multiple
                onChange={(e) => setUploadFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 dark:file:bg-orange-950/50 dark:file:text-orange-300"
              />
              {uploadFiles.length > 0 && (
                <p className="text-xs font-mono text-slate-700 dark:text-slate-200 tabular-nums">
                  {formatTemplate(t.buckets.uploadFilesSelected, { count: uploadFiles.length })}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t.buckets.metadataKeyLabel}
                </label>
                <input
                  type="text"
                  value={metaTagKey}
                  onChange={(e) => setMetaTagKey(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {t.buckets.metadataValLabel}
                </label>
                <input
                  type="text"
                  value={metaTagVal}
                  onChange={(e) => setMetaTagVal(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowUpload(false);
                  setUploadFiles([]);
                }}
                className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {t.buckets.cancel}
              </button>
              <button
                type="submit"
                disabled={uploading || uploadFiles.length === 0}
                className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50"
              >
                {uploading ? t.buckets.uploading : t.buckets.uploadSubmit}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Confirm Batch Delete Selected */}
      {showBulkDeleteConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3
                  id="bulk-delete-dialog-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  {t.buckets.bulkDeleteConfirmTitle}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {formatTemplate(t.buckets.bulkDeleteConfirmBody, {
                    count: selectedList.length,
                    bucket: selectedBucket,
                  })}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-1 max-h-36 overflow-y-auto">
              {selectedList.slice(0, 5).map((itemKey) => (
                <div
                  key={itemKey}
                  className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate"
                >
                  {itemKey}
                </div>
              ))}
              {selectedList.length > 5 && (
                <div className="text-xs text-slate-500 dark:text-slate-400 pt-0.5 tabular-nums">
                  {formatTemplate(t.buckets.moreItems, { count: selectedList.length - 5 })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t.buckets.cancel}
              </button>
              <button
                type="button"
                onClick={executeBulkDelete}
                disabled={deletingBulk}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg transition-colors"
              >
                {deletingBulk ? t.buckets.deleting : t.buckets.bulkDeleteConfirmButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Move Selected */}
      {showBulkMove && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-move-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
        >
          <form
            onSubmit={handleBulkMove}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4"
          >
            <h3
              id="bulk-move-dialog-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              {formatTemplate(t.buckets.bulkMoveModalTitle, { count: selectedKeys.size })}
            </h3>

            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-2.5 space-y-1 max-h-28 overflow-y-auto">
              {selectedList.slice(0, 4).map((itemKey) => (
                <div
                  key={itemKey}
                  className="font-mono text-xs text-slate-700 dark:text-slate-300 truncate"
                >
                  {itemKey}
                </div>
              ))}
              {selectedList.length > 4 && (
                <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {formatTemplate(t.buckets.moreItems, { count: selectedList.length - 4 })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.buckets.destBucketLabel}
              </label>
              <select
                value={moveDestBucket}
                onChange={(e) => setMoveDestBucket(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                {buckets.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {t.buckets.destPrefixLabel}
              </label>
              <input
                type="text"
                value={moveDestPrefix}
                onChange={(e) => setMoveDestPrefix(e.target.value)}
                placeholder={t.buckets.destPrefixPlaceholder}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={moveOverwrite}
                onChange={(e) => setMoveOverwrite(e.target.checked)}
                className="accent-orange-600"
              />
              {t.buckets.overwriteLabel}
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkMove(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                {t.buckets.cancel}
              </button>
              <button
                type="submit"
                disabled={movingBulk}
                className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded-lg"
              >
                {movingBulk ? t.buckets.moving : t.buckets.confirmMove}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Confirm Non-Empty Bucket or Folder Force Deletion */}
      {forceDeleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="force-delete-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <form
            onSubmit={handleConfirmForceDelete}
            className="w-full max-w-md rounded-xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-[#111827] p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3
                  id="force-delete-dialog-title"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  {forceDeleteTarget.kind === 'bucket'
                    ? t.buckets.forceDeleteBucketTitle
                    : t.buckets.forceDeleteFolderTitle}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {formatTemplate(
                    forceDeleteTarget.kind === 'bucket'
                      ? t.buckets.forceDeleteBucketWarning
                      : t.buckets.forceDeleteFolderWarning,
                    { target: forceDeleteTarget.target },
                  )}
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="force-delete-confirm-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                {forceDeleteTarget.kind === 'bucket'
                  ? t.buckets.forceDeleteBucketPrompt
                  : t.buckets.forceDeleteFolderPrompt}
              </label>
              <div className="px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-xs text-slate-900 dark:text-slate-100 select-all">
                {forceDeleteTarget.target}
              </div>
              <input
                id="force-delete-confirm-input"
                type="text"
                autoFocus
                required
                value={forceConfirmInput}
                onChange={(e) => setForceConfirmInput(e.target.value)}
                placeholder={formatTemplate(t.buckets.forceDeleteInputPlaceholder, {
                  target: forceDeleteTarget.target,
                })}
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500/40"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setForceDeleteTarget(null);
                  setForceConfirmInput('');
                }}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                {t.buckets.cancel}
              </button>
              <button
                type="submit"
                disabled={forceDeleting || forceConfirmInput.trim() !== forceDeleteTarget.target}
                className="px-4 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {forceDeleting ? t.buckets.deleting : t.buckets.forceDeleteConfirmButton}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
