import { useCallback, useEffect, useState } from 'react';
import {
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

export function BucketsExplorer({
  selectedBucket,
  currentPrefix,
  onSelectBucket,
  onChangePrefix,
  onOpenEditor,
  connectionVersion,
}: BucketsExplorerProps) {
  const [buckets, setBuckets] = useState<BucketSummary[]>([]);
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loadingBuckets, setLoadingBuckets] = useState(true);
  const [loadingDir, setLoadingDir] = useState(false);
  const [error, setError] = useState<ParsedClientError | null>(null);
  const [bulkReport, setBulkReport] = useState<BulkOperationResult | null>(null);

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [showNewBucket, setShowNewBucket] = useState(false);
  const [newBucketName, setNewBucketName] = useState('');
  const [newBucketLocation, setNewBucketLocation] = useState<R2LocationHint>('ENAM');
  const [newBucketClass, setNewBucketClass] = useState<R2StorageClass>('Standard');

  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [createMarker, setCreateMarker] = useState(true);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [metaTagKey, setMetaTagKey] = useState('env');
  const [metaTagVal, setMetaTagVal] = useState('production');
  const [uploading, setUploading] = useState(false);

  const [showBulkMove, setShowBulkMove] = useState(false);
  const [moveDestBucket, setMoveDestBucket] = useState('');
  const [moveDestPrefix, setMoveDestPrefix] = useState('');
  const [moveOverwrite, setMoveOverwrite] = useState(false);

  const [preview, setPreview] = useState<ObjectPreviewResponse | null>(null);
  const [presigned, setPresigned] = useState<PresignedUrlResponse | null>(null);

  const loadBuckets = useCallback(async () => {
    setLoadingBuckets(true);
    setError(null);
    try {
      const list = await apiClient.listBuckets();
      setBuckets(list);
      if (list.length > 0 && !list.some((b) => b.name === selectedBucket)) {
        onSelectBucket(list[0].name);
      }
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setLoadingBuckets(false);
    }
  }, [selectedBucket, onSelectBucket]);

  const loadDirectory = useCallback(async () => {
    if (!selectedBucket) return;
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
  }, [selectedBucket, currentPrefix]);

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
      await apiClient.deleteBucket(bucketName);
      await loadBuckets();
    } catch (err) {
      setError(err as ParsedClientError);
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploading(true);
    setError(null);
    try {
      const metadata: Record<string, string> = {};
      if (metaTagKey.trim() && metaTagVal.trim()) {
        metadata[metaTagKey.trim()] = metaTagVal.trim();
      }
      await apiClient.uploadFile(selectedBucket, currentPrefix, uploadFile, metadata);
      setShowUpload(false);
      setUploadFile(null);
      await loadDirectory();
      await loadBuckets();
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setUploading(false);
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

  const handleBulkDelete = async () => {
    if (selectedKeys.size === 0) return;
    setError(null);
    try {
      const res = await apiClient.bulkDelete({
        bucket: selectedBucket,
        keys: Array.from(selectedKeys),
        recursiveFolders: true,
      });
      setBulkReport(res);
      setSelectedKeys(new Set());
      await loadDirectory();
      await loadBuckets();
    } catch (err) {
      setError(err as ParsedClientError);
    }
  };

  const handleBulkMove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedKeys.size === 0) return;
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

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {bulkReport && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-4 py-3 flex items-center justify-between gap-4 text-sm">
          <div className="space-y-0.5">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              Operação em lote ({bulkReport.operation === 'delete' ? 'Exclusão' : 'Movimentação'}) concluída em{' '}
              <span className="font-mono tabular-nums">{bulkReport.elapsedMs} ms</span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {bulkReport.succeededCount} processado(s) com sucesso · {bulkReport.failedCount} falha(s)
              {bulkReport.failures.length > 0 && ` · Primeiro erro: ${bulkReport.failures[0].key} (${bulkReport.failures[0].reason})`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBulkReport(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          >
            Dispensar
          </button>
        </div>
      )}

      {/* Buckets Strip */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Buckets Cloudflare R2
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Selecione um bucket para navegar diretórios virtuais e gerenciar objetos via SDK S3
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={loadBuckets}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setShowNewBucket(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Bucket
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800">
          {loadingBuckets ? (
            <div className="col-span-3 p-5 text-xs text-slate-500">Carregando buckets...</div>
          ) : buckets.length === 0 ? (
            <div className="col-span-3 p-6 text-center text-sm text-slate-500">
              Nenhum bucket encontrado. Crie o primeiro bucket para começar.
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
                      {b.locationHint} · {b.storageClass} · {b.objectCount} objetos · {formatBytes(b.totalBytes)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteBucket(b.name)}
                    title="Excluir bucket vazio"
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

      {/* Directory Explorer */}
      {selectedBucket && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            {/* Hierarchical Breadcrumbs */}
            <nav aria-label="Navegação de pastas" className="flex items-center flex-wrap gap-1 text-sm">
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
                Novo Arquivo
              </button>
              <button
                type="button"
                onClick={() => setShowNewFolder(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Nova Pasta
              </button>
              <button
                type="button"
                onClick={() => setShowUpload(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" />
                Enviar Arquivo
              </button>
            </div>
          </div>

          {/* Contextual Multi-Select Bulk Action Toolbar */}
          {selectedKeys.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                {selectedKeys.size} item(ns) selecionado(s) em {selectedBucket}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMoveDestBucket(selectedBucket);
                    setMoveDestPrefix('');
                    setShowBulkMove(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <MoveRight className="h-3.5 w-3.5" />
                  Mover em Lote
                </button>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir Selecionados
                </button>
              </div>
            </div>
          )}

          {/* High-Density Object & Folder Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4 w-10">
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos os itens"
                      checked={
                        Boolean(listing) &&
                        listing!.folders.length + listing!.objects.length > 0 &&
                        selectedKeys.size === listing!.folders.length + listing!.objects.length
                      }
                      onChange={toggleAllVisible}
                      className="rounded border-slate-300 dark:border-slate-600 accent-orange-600"
                    />
                  </th>
                  <th className="py-2.5 px-3">Nome / Prefixo</th>
                  <th className="py-2.5 px-3">Tipo / Tags de Metadados</th>
                  <th className="py-2.5 px-3 text-right">Tamanho</th>
                  <th className="py-2.5 px-3 text-right">Modificado</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
                {loadingDir ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                      Carregando objetos via Delimiter="/"...
                    </td>
                  </tr>
                ) : !listing || (listing.folders.length === 0 && listing.objects.length === 0) ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      Este diretório está vazio. Crie uma subpasta ou envie arquivos para {activeBucketMeta?.name}.
                    </td>
                  </tr>
                ) : (
                  <>
                    {listing.folders.map((folder) => (
                      <tr
                        key={folder.prefix}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-2.5 px-4">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar pasta ${folder.name}`}
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
                          Diretório virtual {folder.hasMarkerObject ? '· Marcador 0-byte' : '· Prefixo S3'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-500 tabular-nums">—</td>
                        <td className="py-2.5 px-3 text-right font-mono text-xs text-slate-500 tabular-nums">—</td>
                        <td className="py-2.5 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => onChangePrefix(folder.prefix)}
                            className="text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    ))}
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
                              aria-label={`Selecionar arquivo ${obj.fileName}`}
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
                            {new Date(obj.lastModified).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {isEditableExtension(obj.key) && (
                                <button
                                  type="button"
                                  onClick={() => onOpenEditor(selectedBucket, obj.key, false)}
                                  title="Editar no Editor de Código"
                                  className="p-1.5 rounded-md text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <FileCode2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handlePreview(obj.key)}
                                title="Inspecionar objeto"
                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePresign(obj.key)}
                                title="Gerar URL Pré-assinada"
                                className="p-1.5 rounded-md text-slate-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              >
                                <Link2 className="h-3.5 w-3.5" />
                              </button>
                              <a
                                href={apiClient.getDownloadUrl(selectedBucket, obj.key)}
                                title="Baixar arquivo"
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
                  Abrir no Editor
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
                Fechar Painel
              </button>
            </div>
          </div>

          {presigned && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 space-y-1.5">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
                URL Pré-assinada (expira em {presigned.expiresInSeconds}s · {new Date(presigned.expiresAt).toLocaleTimeString('pt-BR')})
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
                  ` · Tags: ${Object.entries(preview.metadata)
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
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Criar Bucket R2</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Nome do Bucket</label>
              <input
                type="text"
                required
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                placeholder="ex: buckets-media-cdn"
                className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Região Hint</label>
                <select
                  value={newBucketLocation}
                  onChange={(e) => setNewBucketLocation(e.target.value as R2LocationHint)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="ENAM">ENAM (América Leste)</option>
                  <option value="WNAM">WNAM (América Oeste)</option>
                  <option value="WEUR">WEUR (Europa Oeste)</option>
                  <option value="EEUR">EEUR (Europa Leste)</option>
                  <option value="APAC">APAC (Ásia-Pacífico)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Classe</label>
                <select
                  value={newBucketClass}
                  onChange={(e) => setNewBucketClass(e.target.value as R2StorageClass)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                >
                  <option value="Standard">Standard</option>
                  <option value="InfrequentAccess">Infrequent Access</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewBucket(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg">
                Criar Bucket
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
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nova Pasta Virtual</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Nome ou Caminho Relativo (em {currentPrefix || '/'})
              </label>
              <input
                type="text"
                required
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="ex: v2.5/android"
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
              Criar objeto marcador zero-byte (/) para persistir pasta vazia no R2
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewFolder(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg">
                Criar Pasta
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Upload File */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handleUpload}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Enviar Arquivo para {currentPrefix || '/'}
            </h3>
            <input
              type="file"
              required
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Tag Metadado (Key)</label>
                <input
                  type="text"
                  value={metaTagKey}
                  onChange={(e) => setMetaTagKey(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Valor da Tag</label>
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
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg disabled:opacity-50"
              >
                {uploading ? 'Enviando...' : 'Enviar para R2'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Bulk Move */}
      {showBulkMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <form
            onSubmit={handleBulkMove}
            className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Mover {selectedKeys.size} Item(ns) em Lote
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Bucket de Destino</label>
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
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Prefixo de Destino (Opcional)</label>
              <input
                type="text"
                value={moveDestPrefix}
                onChange={(e) => setMoveDestPrefix(e.target.value)}
                placeholder="ex: archive/2026/"
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
              Sobrescrever arquivos existentes no destino
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkMove(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg"
              >
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg">
                Confirmar Movimentação
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
