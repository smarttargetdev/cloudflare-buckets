import { useEffect, useState } from 'react';
import { FolderOpen, Search } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { formatBytes, type ParsedClientError } from '../shared/errorHandler';
import type { BucketSummary, SearchResponse } from '../shared/types';
import { ErrorBanner } from './ErrorBanner';

interface GlobalSearchViewProps {
  onOpenLocation: (bucket: string, prefix: string) => void;
  connectionVersion: number;
}

export function GlobalSearchView({ onOpenLocation, connectionVersion }: GlobalSearchViewProps) {
  const [buckets, setBuckets] = useState<BucketSummary[]>([]);
  const [query, setQuery] = useState('');
  const [bucketFilter, setBucketFilter] = useState('');
  const [tagKey, setTagKey] = useState('');
  const [tagValue, setTagValue] = useState('');
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ParsedClientError | null>(null);

  useEffect(() => {
    apiClient.listBuckets().then(setBuckets).catch(() => {});
  }, [connectionVersion]);

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.searchObjects({
        query: query.trim() || undefined,
        bucket: bucketFilter || undefined,
        tagKey: tagKey.trim() || undefined,
        tagValue: tagValue.trim() || undefined,
      });
      setResponse(res);
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runSearch();
  }, [connectionVersion]);

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Busca Global por Nome e Metadados
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Pesquise objetos em todos os buckets R2 por nome de arquivo, caminho completo ou tags x-amz-meta-*
          </p>
        </div>

        <form onSubmit={runSearch} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Nome ou Chave</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ex: manifest, wrangler, aab..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Bucket</label>
            <select
              value={bucketFilter}
              onChange={(e) => setBucketFilter(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="">Todos os buckets</option>
              {buckets.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tag Key</label>
            <input
              type="text"
              value={tagKey}
              onChange={(e) => setTagKey(e.target.value)}
              placeholder="ex: env"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Tag Value</label>
            <input
              type="text"
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              placeholder="ex: production"
              className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              Buscar
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="tabular-nums">
            {response
              ? `${response.totalMatches} resultado(s) em ${response.bucketsScanned} bucket(s) · ${response.elapsedMs} ms`
              : 'Pronto para pesquisar'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4">Bucket / Chave Completa</th>
                <th className="py-2.5 px-3">Metadados</th>
                <th className="py-2.5 px-3">Correspondência</th>
                <th className="py-2.5 px-3 text-right">Tamanho</th>
                <th className="py-2.5 px-4 text-right">Navegar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                    Consultando endpoint /api/search...
                  </td>
                </tr>
              ) : !response || response.results.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-slate-500">
                    Nenhum objeto corresponde aos filtros informados.
                  </td>
                </tr>
              ) : (
                response.results.map((item) => (
                  <tr key={`${item.bucket}:${item.key}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4">
                      <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.fileName}
                      </div>
                      <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {item.bucket} / {item.key}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-600 dark:text-slate-300 font-mono">
                      {Object.entries(item.metadata)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(' · ') || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 dark:text-slate-400">
                      {item.matchedOn.join(' · ')}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300">
                      {formatBytes(item.size)}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenLocation(item.bucket, item.parentPrefix)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 dark:text-orange-400 hover:underline"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Abrir Pasta
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
