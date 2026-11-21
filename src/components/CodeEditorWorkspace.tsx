import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Code2,
  Eye,
  FilePlus2,
  Save,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import {
  detectEditorLanguage,
  formatCodeContent,
  isEditableExtension,
  KNOWN_CODE_EXTENSIONS,
  parseMarkdownBlocks,
  validateSyntaxHint,
  type EditorLanguageId,
} from '../shared/codeEditorUtils';
import { formatBytes, type ParsedClientError } from '../shared/errorHandler';
import { formatTemplate } from '../shared/i18n';
import { useLocale } from '../shared/LocaleContext';
import {
  getPrismTokenClass,
  highlightCodeLinesWithPrism,
} from '../shared/prismHighlighter';
import type { BucketSummary, R2ObjectItem } from '../shared/types';
import { ErrorBanner } from './ErrorBanner';

export interface EditorTarget {
  bucket: string;
  key: string;
  isNew: boolean;
  nonce: number;
}

interface CodeEditorWorkspaceProps {
  target: EditorTarget | null;
  connectionVersion: number;
  onSaved?: (bucket: string, key: string) => void;
}

type ViewMode = 'edit' | 'split' | 'preview';
type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const AUTO_SAVE_DEBOUNCE_MS = 3000;

export function CodeEditorWorkspace({
  target,
  connectionVersion,
  onSaved,
}: CodeEditorWorkspaceProps) {
  const { locale, t } = useLocale();
  const [buckets, setBuckets] = useState<BucketSummary[]>([]);
  const [bucket, setBucket] = useState(target?.bucket ?? 'buckets-prod-assets');
  const [bucketObjects, setBucketObjects] = useState<R2ObjectItem[]>([]);
  const [fileKey, setFileKey] = useState(target?.key ?? 'scripts/example.ts');
  const [content, setContent] = useState(KNOWN_CODE_EXTENSIONS[0].defaultTemplate);
  const [metadata, setMetadata] = useState<Record<string, string>>({ editor: 'buckets-code' });
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(null);
  const [editRevision, setEditRevision] = useState(0);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<ParsedClientError | null>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const highlightPreRef = useRef<HTMLPreElement>(null);
  const editRevisionRef = useRef(0);
  const lastAutoSaveAttemptRef = useRef(0);

  const spec = useMemo(() => detectEditorLanguage(fileKey), [fileKey]);
  const displayLangLabel = spec.languageId === 'plaintext' ? t.editor.plainTextLabel : spec.label;
  const syntaxWarning = useMemo(
    () => validateSyntaxHint(spec.languageId, content, locale),
    [spec.languageId, content, locale],
  );
  const prismLines = useMemo(
    () => highlightCodeLinesWithPrism(spec.languageId, content),
    [spec.languageId, content],
  );

  const bumpEditRevision = useCallback(() => {
    editRevisionRef.current += 1;
    setEditRevision(editRevisionRef.current);
    setDirty(true);
    setSavedNotice(null);
  }, []);

  const loadBucketObjects = useCallback(async (targetBucket: string) => {
    try {
      const searchRes = await apiClient.searchObjects({ bucket: targetBucket });
      setBucketObjects(searchRes.results.filter((o) => isEditableExtension(o.key)));
    } catch {
      setBucketObjects([]);
    }
  }, []);

  useEffect(() => {
    apiClient
      .listBuckets()
      .then((list) => {
        setBuckets(list);
        if (list.length === 0) {
          setBucket('');
          setBucketObjects([]);
        } else if (!list.some((b) => b.name === bucket)) {
          setBucket(list[0].name);
        }
      })
      .catch(() => {
        setBuckets([]);
      });
  }, [connectionVersion, bucket]);

  useEffect(() => {
    if (bucket && buckets.some((b) => b.name === bucket)) {
      loadBucketObjects(bucket);
    } else {
      setBucketObjects([]);
    }
  }, [bucket, buckets, connectionVersion, loadBucketObjects]);

  useEffect(() => {
    if (!target) return;
    setBucket(target.bucket);
    setFileKey(target.key);
    setSavedNotice(null);
    setError(null);
    setAutoSaveStatus('idle');
    lastAutoSaveAttemptRef.current = editRevisionRef.current;

    if (target.isNew) {
      const extSpec = detectEditorLanguage(target.key);
      setContent(extSpec.defaultTemplate);
      setMetadata({ editor: 'buckets-code' });
      setDirty(true);
      return;
    }

    setLoading(true);
    apiClient
      .previewObject(target.bucket, target.key)
      .then((res) => {
        setContent(res.textContent ?? '');
        setMetadata(res.metadata ?? {});
        setDirty(false);
        lastAutoSaveAttemptRef.current = editRevisionRef.current;
      })
      .catch((err) => setError(err as ParsedClientError))
      .finally(() => setLoading(false));
  }, [target]);

  const handleOpenExisting = async (selectedKey: string) => {
    if (!selectedKey) return;
    setLoading(true);
    setError(null);
    setSavedNotice(null);
    setAutoSaveStatus('idle');
    try {
      const res = await apiClient.previewObject(bucket, selectedKey);
      setFileKey(selectedKey);
      setContent(res.textContent ?? '');
      setMetadata(res.metadata ?? {});
      setDirty(false);
      lastAutoSaveAttemptRef.current = editRevisionRef.current;
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setLoading(false);
    }
  };

  const handleNewWithExtension = (ext: string) => {
    const extSpec = KNOWN_CODE_EXTENSIONS.find((s) => s.ext === ext) ?? KNOWN_CODE_EXTENSIONS[0];
    const baseDir = fileKey.includes('/') ? fileKey.slice(0, fileKey.lastIndexOf('/') + 1) : '';
    setFileKey(`${baseDir}untitled.${extSpec.ext}`);
    setContent(extSpec.defaultTemplate);
    setMetadata({ editor: 'buckets-code', lang: extSpec.languageId });
    setDirty(true);
    setSavedNotice(null);
    setAutoSaveStatus('idle');
    lastAutoSaveAttemptRef.current = editRevisionRef.current;
  };

  const performSave = useCallback(
    async (options?: { isAutoSave?: boolean; revision?: number }) => {
      if (!bucket || !fileKey.trim()) return;
      const isAutoSave = options?.isAutoSave ?? false;
      const targetRevision = options?.revision ?? editRevisionRef.current;

      setSaving(true);
      if (isAutoSave) {
        setAutoSaveStatus('saving');
      }
      setError(null);
      if (!isAutoSave) {
        setSavedNotice(null);
      }

      try {
        const saved = await apiClient.saveObjectContent(bucket, {
          key: fileKey.trim(),
          content,
          contentType: spec.mimeType,
          metadata,
        });

        if (editRevisionRef.current === targetRevision) {
          setDirty(false);
        }
        lastAutoSaveAttemptRef.current = targetRevision;

        const timeLabel = new Date().toLocaleTimeString(locale, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        setAutoSaveStatus('saved');
        setLastAutoSavedAt(timeLabel);
        setSavedNotice(
          formatTemplate(isAutoSave ? t.editor.autoSavedNotice : t.editor.manualSavedNotice, {
            bucket: saved.bucket,
            key: saved.key,
            size: formatBytes(saved.size),
          }),
        );

        await loadBucketObjects(bucket);
        if (!isAutoSave) {
          onSaved?.(bucket, saved.key);
        }
      } catch (err) {
        if (isAutoSave) {
          setAutoSaveStatus('error');
        }
        setError(err as ParsedClientError);
      } finally {
        setSaving(false);
      }
    },
    [bucket, fileKey, content, spec.mimeType, metadata, locale, t, loadBucketObjects, onSaved],
  );

  // 3-second idle debounce auto-save to backend
  useEffect(() => {
    if (!autoSaveEnabled || !dirty || loading || saving || !bucket || !fileKey.trim()) {
      return;
    }
    if (editRevision === 0 || editRevision <= lastAutoSaveAttemptRef.current) {
      return;
    }

    setAutoSaveStatus('pending');
    const scheduledRevision = editRevision;
    const timer = window.setTimeout(() => {
      lastAutoSaveAttemptRef.current = scheduledRevision;
      void performSave({ isAutoSave: true, revision: scheduledRevision });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [
    autoSaveEnabled,
    dirty,
    loading,
    saving,
    bucket,
    fileKey,
    editRevision,
    performSave,
  ]);

  const handleSave = useCallback(() => {
    void performSave({ isAutoSave: false, revision: editRevisionRef.current });
  }, [performSave]);

  const handleFormatCode = () => {
    try {
      const formatted = formatCodeContent(spec.languageId, content);
      if (formatted !== content) {
        setContent(formatted);
        bumpEditRevision();
      }
      setError(null);
    } catch (err) {
      setSavedNotice(null);
      setError({
        title: t.editor.formatErrorTitle,
        userMessage: err instanceof Error ? err.message : t.editor.formatErrorFallback,
        errorCode: 'FORMAT_ERROR',
        status: 400,
        validationDetails: [],
      });
    }
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleSave();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = `${content.slice(0, start)}  ${content.slice(end)}`;
      setContent(next);
      bumpEditRevision();
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  const updateCursorStats = (el: HTMLTextAreaElement) => {
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos);
    const split = before.split('\n');
    setCursorPos({ line: split.length, col: split[split.length - 1].length + 1 });
  };

  const syncScroll = () => {
    if (!textareaRef.current) return;
    const { scrollTop, scrollLeft } = textareaRef.current;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
    if (highlightPreRef.current) {
      highlightPreRef.current.scrollTop = scrollTop;
      highlightPreRef.current.scrollLeft = scrollLeft;
    }
  };

  const autoSaveStatusLabel = useMemo(() => {
    if (!autoSaveEnabled) return t.editor.autoSaveDisabled;
    if (autoSaveStatus === 'saving') return t.editor.autoSaveSaving;
    if (autoSaveStatus === 'pending') return t.editor.autoSavePending;
    if (autoSaveStatus === 'error') return t.editor.autoSaveError;
    if (autoSaveStatus === 'saved' && lastAutoSavedAt) {
      return formatTemplate(t.editor.autoSaveSavedAt, { time: lastAutoSavedAt });
    }
    return t.editor.autoSaveReady;
  }, [autoSaveEnabled, autoSaveStatus, lastAutoSavedAt, t]);

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {/* Header & File Bar */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.editor.title}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.editor.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
              {(
                [
                  ['edit', t.editor.viewEdit],
                  ['split', t.editor.viewSplit],
                  ['preview', t.editor.viewPreview],
                ] as const
              ).map(([modeId, label]) => (
                <button
                  key={modeId}
                  type="button"
                  onClick={() => setViewMode(modeId)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    viewMode === modeId
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAutoSaveEnabled((prev) => !prev)}
              aria-pressed={autoSaveEnabled}
              title={autoSaveEnabled ? t.editor.autoSaveOn : t.editor.autoSaveOff}
              className={`px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                autoSaveEnabled
                  ? 'border-emerald-500 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-300 dark:border-slate-700 bg-slate-100/70 dark:bg-slate-900 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {t.editor.autoSaveLabel}
            </button>

            <button
              type="button"
              onClick={handleFormatCode}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t.editor.formatCode}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? t.editor.saving : dirty ? t.editor.saveDirty : t.editor.saveClean}
            </button>
          </div>
        </div>

        {/* File Target Controls */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
          <div className="md:col-span-3">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              {t.editor.destBucketLabel}
            </label>
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              {buckets.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-5">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              {t.editor.filePathLabel}
            </label>
            <input
              type="text"
              value={fileKey}
              onChange={(e) => {
                setFileKey(e.target.value);
                bumpEditRevision();
              }}
              placeholder={t.editor.filePathPlaceholder}
              className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              {formatTemplate(t.editor.openExistingLabel, { count: bucketObjects.length })}
            </label>
            <select
              value=""
              onChange={(e) => handleOpenExisting(e.target.value)}
              className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">{t.editor.selectExistingPlaceholder}</option>
              {bucketObjects.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.key}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Known Extension Starter Templates */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mr-1">
            <FilePlus2 className="h-3 w-3" />
            {t.editor.newTemplateLabel}
          </span>
          {KNOWN_CODE_EXTENSIONS.map((extItem) => (
            <button
              key={extItem.ext}
              type="button"
              onClick={() => handleNewWithExtension(extItem.ext)}
              className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                spec.ext === extItem.ext
                  ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-semibold'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              .{extItem.ext}
            </button>
          ))}
        </div>
      </section>

      {/* Main Editor + Preview Surface */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-300">
            <Code2 className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
            <span>{displayLangLabel} (Prism.js)</span>
            <span className="text-slate-400">·</span>
            <span>{spec.mimeType}</span>
            <span className="text-slate-400">·</span>
            <span className="font-sans text-slate-500 dark:text-slate-400">
              {autoSaveStatusLabel}
            </span>
            {syntaxWarning && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-amber-600 dark:text-amber-400 font-sans font-medium">
                  {syntaxWarning}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 tabular-nums text-slate-500 dark:text-slate-400">
            {savedNotice && (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-sans">
                <Check className="h-3.5 w-3.5" />
                {savedNotice}
              </span>
            )}
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col} · {prismLines.length} {t.editor.linesUnit} ·{' '}
              {formatBytes(new Blob([content]).size)}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-xs text-slate-500">{t.editor.loadingContent}</div>
        ) : (
          <div
            className={`grid ${
              viewMode === 'split'
                ? 'grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800'
                : 'grid-cols-1'
            }`}
          >
            {viewMode !== 'preview' && (
              <div className="flex h-[500px] bg-white dark:bg-[#0B1120]">
                <div
                  ref={gutterRef}
                  aria-hidden="true"
                  className="w-12 py-3 pr-2 text-right font-mono text-xs leading-6 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800 select-none overflow-hidden tabular-nums"
                >
                  {prismLines.map((_, idx) => (
                    <div key={idx}>{idx + 1}</div>
                  ))}
                </div>
                <div className="relative flex-1 overflow-hidden">
                  <pre
                    ref={highlightPreRef}
                    aria-hidden="true"
                    className="absolute inset-0 m-0 p-3 font-mono text-xs leading-6 whitespace-pre tab-2 overflow-hidden pointer-events-none select-none"
                  >
                    {prismLines.map((spans, lineIdx) => (
                      <span key={lineIdx}>
                        {spans.length > 0
                          ? spans.map((span, spanIdx) => (
                              <span
                                key={spanIdx}
                                className={getPrismTokenClass(span.types, true)}
                              >
                                {span.text}
                              </span>
                            ))
                          : ''}
                        {lineIdx < prismLines.length - 1 ? '\n' : ''}
                      </span>
                    ))}
                  </pre>
                  <textarea
                    ref={textareaRef}
                    value={content}
                    spellCheck={false}
                    onChange={(e) => {
                      setContent(e.target.value);
                      bumpEditRevision();
                      updateCursorStats(e.currentTarget);
                    }}
                    onClick={(e) => updateCursorStats(e.currentTarget)}
                    onKeyUp={(e) => updateCursorStats(e.currentTarget)}
                    onKeyDown={handleTextareaKeyDown}
                    onScroll={syncScroll}
                    aria-label={t.editor.editorAria}
                    className="relative z-10 w-full h-full m-0 p-3 font-mono text-xs leading-6 whitespace-pre tab-2 bg-transparent text-transparent caret-slate-900 dark:caret-slate-100 selection:bg-orange-500/25 selection:text-transparent resize-none focus:outline-none overflow-auto"
                  />
                </div>
              </div>
            )}

            {viewMode !== 'edit' && (
              <div className="h-[500px] overflow-auto bg-slate-50/50 dark:bg-slate-950 p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-3">
                  <Eye className="h-3.5 w-3.5" />
                  <span>
                    {spec.languageId === 'html'
                      ? t.editor.previewHtmlSandbox
                      : spec.languageId === 'markdown'
                        ? t.editor.previewMarkdown
                        : formatTemplate(t.editor.previewPrism, { label: displayLangLabel })}
                  </span>
                </div>

                {spec.languageId === 'html' ? (
                  <iframe
                    title={t.editor.previewHtmlSandbox}
                    sandbox=""
                    srcDoc={content}
                    className="w-full h-[430px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                  />
                ) : spec.languageId === 'markdown' ? (
                  <MarkdownPreview content={content} />
                ) : (
                  <PrismHighlightedPreview lines={prismLines} />
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function PrismHighlightedPreview({
  lines,
}: {
  lines: ReturnType<typeof highlightCodeLinesWithPrism>;
}) {
  return (
    <pre className="font-mono text-xs leading-6 overflow-x-auto">
      {lines.map((spans, i) => (
        <div key={i} className="flex gap-3">
          <span className="w-7 text-right text-slate-400 dark:text-slate-600 select-none tabular-nums shrink-0">
            {i + 1}
          </span>
          <span>
            {spans.length > 0 ? (
              spans.map((span, j) => (
                <span key={j} className={getPrismTokenClass(span.types, false)}>
                  {span.text}
                </span>
              ))
            ) : (
              '\u00a0'
            )}
          </span>
        </div>
      ))}
    </pre>
  );
}

function MarkdownPreview({ content }: { content: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);
  return (
    <div className="space-y-3 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
      {blocks.map((block, idx) => {
        if (block.type === 'h1') {
          return (
            <h1 key={idx} className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {block.text}
            </h1>
          );
        }
        if (block.type === 'h2') {
          return (
            <h2 key={idx} className="text-lg font-semibold text-slate-900 dark:text-slate-100 pt-1">
              {block.text}
            </h2>
          );
        }
        if (block.type === 'h3') {
          return (
            <h3 key={idx} className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {block.text}
            </h3>
          );
        }
        if (block.type === 'list') {
          return (
            <ul key={idx} className="list-disc list-inside space-y-1 text-slate-700 dark:text-slate-300">
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.type === 'code') {
          const langId = detectCodeBlockLanguage(block.lang);
          const codeLines = highlightCodeLinesWithPrism(langId, block.text);
          return (
            <div
              key={idx}
              className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto"
            >
              <PrismHighlightedPreview lines={codeLines} />
            </div>
          );
        }
        return <p key={idx}>{block.text}</p>;
      })}
    </div>
  );
}

function detectCodeBlockLanguage(lang: string): EditorLanguageId {
  const clean = lang.trim().toLowerCase();
  if (!clean) return 'plaintext';
  return detectEditorLanguage(`snippet.${clean}`).languageId;
}
