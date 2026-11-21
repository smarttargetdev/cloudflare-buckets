import { useState } from 'react';
import { Check, Copy, Download, FileCode2 } from 'lucide-react';
import { exportMonorepoZip, MONOREPO_FILES } from '../monorepo';
import type { MonorepoFile } from '../shared/types';

interface MonorepoExplorerViewProps {
  customWranglerToml?: string;
}

export function MonorepoExplorerView({ customWranglerToml }: MonorepoExplorerViewProps) {
  const [stackFilter, setStackFilter] = useState<'all' | MonorepoFile['stack']>('all');
  const [selectedPath, setSelectedPath] = useState(MONOREPO_FILES[0].path);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const visibleFiles = MONOREPO_FILES.filter(
    (f) => stackFilter === 'all' || f.stack === stackFilter,
  );
  const activeFile =
    visibleFiles.find((f) => f.path === selectedPath) ?? visibleFiles[0] ?? MONOREPO_FILES[0];

  const activeContent =
    activeFile.path === 'infra-wrangler/wrangler.toml' && customWranglerToml
      ? customWranglerToml
      : activeFile.content;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownloadZip = async () => {
    setDownloading(true);
    try {
      const blob = await exportMonorepoZip(customWranglerToml);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cloudflare-buckets-monorepo.zip';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Código-Fonte do Monorepo (.NET 10 · Expo Universal · Wrangler IaC)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Inspecione todos os arquivos gerados, incluindo Serilog, métricas R2, testes xUnit/Jest e Workers
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(
              [
                ['all', 'Todos'],
                ['backend-dotnet10', '.NET 10'],
                ['frontend-expo', 'Expo TS'],
                ['infra-wrangler', 'Wrangler'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStackFilter(id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  stackFilter === id
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
            onClick={handleDownloadZip}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? 'Empacotando...' : 'Baixar Monorepo (.zip)'}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 max-h-[600px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
          {visibleFiles.map((file) => {
            const active = file.path === activeFile.path;
            return (
              <button
                key={file.path}
                type="button"
                onClick={() => setSelectedPath(file.path)}
                className={`w-full text-left px-4 py-3 transition-colors ${
                  active
                    ? 'bg-orange-50/70 dark:bg-orange-950/25'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileCode2
                    className={`h-3.5 w-3.5 shrink-0 ${
                      active ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="font-mono text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                    {file.path}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2">
                  {file.summary}
                </p>
              </button>
            );
          })}
        </aside>

        <div className="lg:col-span-8 flex flex-col">
          <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <div className="min-w-0">
              <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeFile.path}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {activeFile.summary}
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md hover:bg-white dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <pre className="p-5 text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950 overflow-auto max-h-[540px] leading-relaxed">
            {activeContent}
          </pre>
        </div>
      </section>
    </div>
  );
}
