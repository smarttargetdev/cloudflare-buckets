import { useEffect, useState } from 'react';
import { FolderOpen, ShieldCheck, X } from 'lucide-react';
import { apiClient, type ApiConnectionConfig } from '../services/apiClient';
import type { ParsedClientError } from '../shared/errorHandler';
import { formatTemplate } from '../shared/i18n';
import { useLocale } from '../shared/LocaleContext';
import type {
  CloudflareCredentials,
  ConnectionMode,
  LocalFolderInspectResponse,
} from '../shared/types';

interface ConnectionDrawerProps {
  open: boolean;
  config: ApiConnectionConfig;
  onClose: () => void;
  onSave: (next: ApiConnectionConfig) => void;
}

export function ConnectionDrawer({ open, config, onClose, onSave }: ConnectionDrawerProps) {
  const { t } = useLocale();
  const [mode, setMode] = useState<ConnectionMode>(config.mode);
  const [localFolderPath, setLocalFolderPath] = useState(
    config.localFolderPath || './data/buckets',
  );
  const [creds, setCreds] = useState<CloudflareCredentials>(config.credentials);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [verifyingFolder, setVerifyingFolder] = useState(false);
  const [inspectResult, setInspectResult] = useState<LocalFolderInspectResponse | null>(null);

  useEffect(() => {
    if (open) {
      setMode(config.mode);
      setLocalFolderPath(config.localFolderPath || './data/buckets');
      setCreds(config.credentials);
      setValidationMsg(null);
      setInspectResult(null);
    }
  }, [open, config]);

  if (!open) return null;

  const handleModeSwitch = (nextMode: ConnectionMode) => {
    setMode(nextMode);
    setValidationMsg(null);
    setInspectResult(null);
  };

  const handleVerifyLocalFolder = async () => {
    const trimmed = localFolderPath.trim();
    if (!trimmed) {
      setValidationMsg(t.drawer.localFolderMissing);
      setInspectResult(null);
      return;
    }
    setVerifyingFolder(true);
    setValidationMsg(null);
    try {
      const res = await apiClient.inspectLocalFolder(trimmed, true);
      setInspectResult(res);
      setLocalFolderPath(res.resolvedPath);
    } catch (err) {
      const parsed = err as ParsedClientError;
      setInspectResult(null);
      setValidationMsg(parsed.userMessage || t.drawer.localFolderMissing);
    } finally {
      setVerifyingFolder(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'cloudflare') {
      if (!creds.accountId.trim() || !creds.accessKeyId.trim() || !creds.secretAccessKey.trim()) {
        setValidationMsg(t.drawer.validationMissing);
        return;
      }
      setValidationMsg(null);
      onSave({ mode, localFolderPath, credentials: creds });
      onClose();
      return;
    }

    if (mode === 'local') {
      const trimmed = localFolderPath.trim();
      if (!trimmed) {
        setValidationMsg(t.drawer.localFolderMissing);
        return;
      }
      setVerifyingFolder(true);
      setValidationMsg(null);
      try {
        const res = await apiClient.inspectLocalFolder(trimmed, true);
        onSave({
          mode: 'local',
          localFolderPath: res.resolvedPath,
          credentials: creds,
        });
        onClose();
      } catch (err) {
        const parsed = err as ParsedClientError;
        setValidationMsg(parsed.userMessage || t.drawer.localFolderMissing);
      } finally {
        setVerifyingFolder(false);
      }
      return;
    }

    setValidationMsg(null);
    onSave({ mode: 'sandbox', localFolderPath, credentials: creds });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]">
      <div className="w-full max-w-md bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-slate-800 h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t.drawer.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.drawer.closeAria}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.drawer.executionModeLabel}
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => handleModeSwitch('sandbox')}
                className={`px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'sandbox'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {t.drawer.sandboxLocal}
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('local')}
                className={`px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'local'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {t.drawer.localFolder}
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('cloudflare')}
                className={`px-2 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'cloudflare'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {t.drawer.cloudflareReal}
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {mode === 'sandbox'
                ? t.drawer.sandboxDesc
                : mode === 'local'
                  ? t.drawer.localFolderDesc
                  : t.drawer.cloudflareDesc}
            </p>
          </div>

          {mode === 'local' && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.drawer.localFolderPathLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setLocalFolderPath('./data/buckets');
                      setInspectResult(null);
                      setValidationMsg(null);
                    }}
                    className="text-[11px] font-medium text-orange-600 dark:text-orange-400 hover:underline"
                  >
                    {t.drawer.localFolderQuickPreset}
                  </button>
                </div>
                <input
                  type="text"
                  value={localFolderPath}
                  onChange={(e) => {
                    setLocalFolderPath(e.target.value);
                    setInspectResult(null);
                  }}
                  placeholder={t.drawer.localFolderPathPlaceholder}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleVerifyLocalFolder}
                  disabled={verifyingFolder}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  {verifyingFolder ? t.drawer.localFolderVerifying : t.drawer.localFolderVerify}
                </button>
              </div>

              {inspectResult && (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20 px-3 py-2.5 text-xs text-emerald-700 dark:text-emerald-300 font-mono break-all">
                  {formatTemplate(t.drawer.localFolderVerified, {
                    path: inspectResult.resolvedPath,
                    count: inspectResult.bucketCount,
                  })}
                </div>
              )}

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {t.drawer.localFolderNote}
              </p>
            </div>
          )}

          {mode === 'cloudflare' && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.drawer.accountIdLabel}
                </label>
                <input
                  type="text"
                  value={creds.accountId}
                  onChange={(e) => setCreds({ ...creds, accountId: e.target.value })}
                  placeholder={t.drawer.accountIdPlaceholder}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.drawer.accessKeyLabel}
                </label>
                <input
                  type="text"
                  value={creds.accessKeyId}
                  onChange={(e) => setCreds({ ...creds, accessKeyId: e.target.value })}
                  placeholder={t.drawer.accessKeyPlaceholder}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.drawer.secretKeyLabel}
                </label>
                <input
                  type="password"
                  value={creds.secretAccessKey}
                  onChange={(e) => setCreds({ ...creds, secretAccessKey: e.target.value })}
                  placeholder={t.drawer.secretKeyPlaceholder}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t.drawer.apiTokenLabel}
                </label>
                <input
                  type="password"
                  value={creds.apiToken}
                  onChange={(e) => setCreds({ ...creds, apiToken: e.target.value })}
                  placeholder={t.drawer.apiTokenPlaceholder}
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.drawer.securityNote}
              </p>
            </div>
          )}

          {validationMsg && (
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">{validationMsg}</p>
          )}

          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t.drawer.cancel}
            </button>
            <button
              type="submit"
              disabled={verifyingFolder}
              className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {t.drawer.apply}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
