import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { formatBytes, type ParsedClientError } from '../shared/errorHandler';
import type {
  LogSinkId,
  PerformanceMetricsSnapshot,
  StructuredLogEntry,
} from '../shared/types';
import { ErrorBanner } from './ErrorBanner';

export function TelemetryView() {
  const [metrics, setMetrics] = useState<PerformanceMetricsSnapshot | null>(null);
  const [logs, setLogs] = useState<StructuredLogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [searchLog, setSearchLog] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ParsedClientError | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, l] = await Promise.all([
        apiClient.getMetrics(),
        apiClient.getLogs({ level: levelFilter, q: searchLog.trim() || undefined }),
      ]);
      setMetrics(m);
      setLogs(l);
    } catch (err) {
      setError(err as ParsedClientError);
    } finally {
      setLoading(false);
    }
  }, [levelFilter, searchLog]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleSink = async (id: LogSinkId, field: 'enabled' | 'workerForwardingEnabled', value: boolean) => {
    setError(null);
    try {
      await apiClient.updateSink(id, { [field]: value });
      await loadData();
    } catch (err) {
      setError(err as ParsedClientError);
    }
  };

  return (
    <div className="space-y-6">
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {/* 4-Column Metrics KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Requisições API &amp; R2</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {metrics?.totalRequests ?? 0}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Uptime {metrics?.uptimeSeconds ?? 0}s
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Latência Média / P95</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {metrics?.overallAvgMs ?? 0} ms / {metrics?.overallP95Ms ?? 0} ms
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
            {metrics?.recentWorkerTimingHeader ?? 'Server-Timing ativo'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Throughput Transferido</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {formatBytes(metrics?.totalBytesTransferred ?? 0)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            S3 PutObject + GetObject + List
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="text-xs text-slate-500 dark:text-slate-400">Taxa de Erros</div>
          <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
            {metrics?.errorRatePercent ?? 0}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {metrics?.totalErrors ?? 0} falha(s) RFC 7807
          </div>
        </div>
      </section>

      {/* Centralized Logging Sinks (.NET Serilog + Cloudflare Workers) */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Pipeline de Logging Centralizado (.NET 10 Serilog + Cloudflare Tail Worker)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ative ou configure os destinos de agregação de logs estruturados e telemetria de borda
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar Telemetria
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {(metrics?.sinks ?? []).map((sink) => (
            <div key={sink.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5 min-w-0">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {sink.label}
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                  {sink.protocol} · {sink.endpointOrPath}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sink.enabled}
                    onChange={(e) => handleToggleSink(sink.id, 'enabled', e.target.checked)}
                    className="accent-orange-600"
                  />
                  Sink API .NET Ativo
                </label>
                {sink.id !== 'RollingFile' && (
                  <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sink.workerForwardingEnabled}
                      onChange={(e) =>
                        handleToggleSink(sink.id, 'workerForwardingEnabled', e.target.checked)
                      }
                      className="accent-orange-600"
                    />
                    Tail Worker R2
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Performance Metrics by R2 Operation */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Métricas de Desempenho por Operação R2
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-4">Operação SDK / API</th>
                <th className="py-2.5 px-3 text-right">Chamadas</th>
                <th className="py-2.5 px-3 text-right">Erros</th>
                <th className="py-2.5 px-3 text-right">Média (ms)</th>
                <th className="py-2.5 px-3 text-right">P50 (ms)</th>
                <th className="py-2.5 px-3 text-right">P95 (ms)</th>
                <th className="py-2.5 px-4 text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
              {(metrics?.operations ?? [])
                .filter((op) => op.count > 0)
                .map((op) => (
                  <tr key={op.operation} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {op.operation}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">{op.count}</td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        op.errorCount > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500'
                      }`}
                    >
                      {op.errorCount}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">{op.avgMs}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">{op.p50Ms}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">{op.p95Ms}</td>
                    <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300">
                      {formatBytes(op.totalBytes)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Structured Logs Feed */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Stream de Logs Estruturados (TraceId &amp; Sinks)
          </h3>
          <div className="flex items-center gap-2">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="ALL">Todos os níveis</option>
              <option value="Information">Information</option>
              <option value="Warning">Warning</option>
              <option value="Error">Error</option>
            </select>
            <input
              type="text"
              value={searchLog}
              onChange={(e) => setSearchLog(e.target.value)}
              placeholder="Filtrar TraceId, bucket ou mensagem..."
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-xs text-slate-500">Carregando logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">Nenhum evento encontrado para este filtro.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="px-5 py-3 text-xs space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-semibold ${
                        log.level === 'Error'
                          ? 'text-red-600 dark:text-red-400'
                          : log.level === 'Warning'
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-900 dark:text-slate-100 font-medium">{log.operation}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">{log.source}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500 dark:text-slate-400">Trace {log.traceId}</span>
                  </div>
                  <div className="text-slate-500 dark:text-slate-400 tabular-nums">
                    HTTP {log.statusCode} · {log.durationMs} ms · {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
                  </div>
                </div>
                <div className="text-slate-700 dark:text-slate-300">{log.message}</div>
                <div className="text-[11px] font-mono text-slate-400">
                  Sinks: {log.sinks.join(' · ')}
                  {log.bucket ? ` · Bucket: ${log.bucket}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
