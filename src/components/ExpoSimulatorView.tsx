import { useEffect, useState } from 'react';
import { ChevronRight, Folder, Laptop, Monitor, Search, Smartphone, Tablet, Trash2 } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { buildBreadcrumbs, formatBytes, type ParsedClientError } from '../shared/errorHandler';
import type { BucketSummary, DirectoryListing } from '../shared/types';
import { ErrorBanner } from './ErrorBanner';

type ExpoPlatform = 'android' | 'ios' | 'web' | 'windows' | 'linux';

const PLATFORM_META: Record<
  ExpoPlatform,
  { label: string; runtime: string; widthClass: string }
> = {
  android: { label: 'Android', runtime: 'Expo SDK 54 · Material 3', widthClass: 'max-w-[390px]' },
  ios: { label: 'iOS', runtime: 'Expo SDK 54 · Cupertino', widthClass: 'max-w-[390px]' },
  web: { label: 'Web', runtime: 'react-native-web · Metro', widthClass: 'max-w-4xl' },
  windows: { label: 'Windows', runtime: 'react-native-windows · WinUI 3', widthClass: 'max-w-4xl' },
  linux: { label: 'Linux', runtime: 'Expo Web + Electron · GTK', widthClass: 'max-w-4xl' },
};

export function ExpoSimulatorView() {
  const [platform, setPlatform] = useState<ExpoPlatform>('android');
  const [buckets, setBuckets] = useState<BucketSummary[]>([]);
  const [bucket, setBucket] = useState('buckets-prod-assets');
  const [prefix, setPrefix] = useState('');
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<ParsedClientError | null>(null);

  useEffect(() => {
    apiClient.listBuckets().then((list) => {
      setBuckets(list);
      if (list.length > 0 && !list.some((b) => b.name === bucket)) {
        setBucket(list[0].name);
      }
    }).catch((err) => setError(err as ParsedClientError));
  }, [bucket]);

  const refreshDir = async (targetBucket = bucket, targetPrefix = prefix) => {
    setError(null);
    try {
      const res = await apiClient.listDirectory(targetBucket, targetPrefix);
      setListing(res);
      setSelectedKeys(new Set());
    } catch (err) {
      setError(err as ParsedClientError);
    }
  };

  useEffect(() => {
    refreshDir(bucket, prefix);
  }, [bucket, prefix]);

  const handleBulkDeleteInExpo = async () => {
    if (selectedKeys.size === 0) return;
    try {
      await apiClient.bulkDelete({ bucket, keys: Array.from(selectedKeys), recursiveFolders: true });
      await refreshDir(bucket, prefix);
    } catch (err) {
      setError(err as ParsedClientError);
    }
  };

  const toggleItem = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const filteredObjects = (listing?.objects ?? []).filter((o) =>
    !searchTerm.trim() ? true : o.fileName.toLowerCase().includes(searchTerm.toLowerCase()),
  );
  const crumbs = buildBreadcrumbs(prefix);
  const meta = PLATFORM_META[platform];

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Simulador Expo Universal TypeScript
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {meta.runtime} · Conectado ao vivo à API REST de Buckets
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          {(['android', 'ios', 'web', 'windows', 'linux'] as ExpoPlatform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                platform === p
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {p === 'android' || p === 'ios' ? (
                <Smartphone className="h-3.5 w-3.5" />
              ) : p === 'web' ? (
                <Tablet className="h-3.5 w-3.5" />
              ) : p === 'windows' ? (
                <Monitor className="h-3.5 w-3.5" />
              ) : (
                <Laptop className="h-3.5 w-3.5" />
              )}
              {PLATFORM_META[p].label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex justify-center">
        <div
          className={`w-full ${meta.widthClass} rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0F172A] overflow-hidden shadow-sm transition-all`}
        >
          {/* Platform Chrome */}
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              Buckets · {meta.label}
            </span>
            <span className="font-mono text-slate-500 dark:text-slate-400">Platform.OS = &quot;{platform}&quot;</span>
          </div>

          <div className="p-4 space-y-3">
            <ErrorBanner error={error} onDismiss={() => setError(null)} />

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={bucket}
                onChange={(e) => {
                  setBucket(e.target.value);
                  setPrefix('');
                }}
                className="px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                {buckets.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>

              <div className="flex-1 min-w-[160px] relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrar arquivos..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
              </div>
            </div>

            {/* Breadcrumbs */}
            <div className="flex items-center flex-wrap gap-1 text-xs font-mono">
              <button
                type="button"
                onClick={() => setPrefix('')}
                className="text-orange-600 dark:text-orange-400 hover:underline"
              >
                /
              </button>
              {crumbs.map((c) => (
                <div key={c.prefix} className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3 text-slate-400" />
                  <button
                    type="button"
                    onClick={() => setPrefix(c.prefix)}
                    className="text-slate-700 dark:text-slate-300 hover:text-orange-600"
                  >
                    {c.label}
                  </button>
                </div>
              ))}
            </div>

            {selectedKeys.size > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-xs">
                <span className="font-medium text-red-800 dark:text-red-200">
                  {selectedKeys.size} selecionado(s)
                </span>
                <button
                  type="button"
                  onClick={handleBulkDeleteInExpo}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 text-white font-medium"
                >
                  <Trash2 className="h-3 w-3" />
                  Excluir
                </button>
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {(listing?.folders ?? []).map((folder) => (
                <button
                  key={folder.prefix}
                  type="button"
                  onClick={() => setPrefix(folder.prefix)}
                  className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <span className="inline-flex items-center gap-2 font-mono text-xs font-medium text-slate-900 dark:text-slate-100">
                    <Folder className="h-3.5 w-3.5 text-orange-500" />
                    {folder.name}/
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </button>
              ))}

              {filteredObjects.map((obj) => (
                <div
                  key={obj.key}
                  className="px-3 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <label className="flex items-center gap-2.5 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedKeys.has(obj.key)}
                      onChange={() => toggleItem(obj.key)}
                      className="accent-orange-600"
                    />
                    <span className="font-mono text-slate-900 dark:text-slate-100 truncate">
                      {obj.fileName}
                    </span>
                  </label>
                  <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {formatBytes(obj.size)}
                  </span>
                </div>
              ))}

              {(listing?.folders.length ?? 0) === 0 && filteredObjects.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  Diretório vazio nesta visualização.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
