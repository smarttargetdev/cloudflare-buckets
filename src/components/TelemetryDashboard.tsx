import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatBytes } from '../shared/errorHandler';
import type { PerformanceMetricsSnapshot } from '../shared/types';

interface TelemetryDashboardProps {
  metrics: PerformanceMetricsSnapshot | null;
  loading: boolean;
}

export function TelemetryDashboard({ metrics, loading }: TelemetryDashboardProps) {
  const bucketData = metrics?.bucketMetrics ?? [];

  if (loading && !metrics) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 text-xs text-slate-500">
        Carregando métricas de armazenamento, requisições e custos de egresso R2...
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: R2 Bucket Storage Usage */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Uso de Armazenamento por Bucket (KB / MB)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Volume armazenado em tempo real via endpoint /api/telemetry/metrics
            </p>
          </div>
          <div className="h-64 w-full">
            {bucketData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Nenhum bucket disponível para gráfico.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bucketData.map((b) => ({
                    name: b.bucket.replace('buckets-', ''),
                    storageKb: Math.round((b.storageBytes / 1024) * 10) / 10,
                    objects: b.objectCount,
                  }))}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="storageKb" name="Armazenamento (KB)" fill="#EA580C" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="objects" name="Objetos" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Request Counts & R2 Zero Egress Savings */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Requisições &amp; Comparativo de Custo de Egresso (USD)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cloudflare R2 ($0.00/GB egresso) versus tarifa S3 padrão ($0.09/GB)
            </p>
          </div>
          <div className="h-64 w-full">
            {bucketData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Nenhuma métrica de requisição disponível.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bucketData.map((b) => ({
                    name: b.bucket.replace('buckets-', ''),
                    requests: b.requestCount,
                    r2EgressUsd: b.r2EgressCostUsd,
                    s3EgressUsd: b.s3EquivalentEgressUsd,
                  }))}
                  margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderColor: '#334155',
                      borderRadius: '8px',
                      color: '#F8FAFC',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar
                    yAxisId="left"
                    dataKey="requests"
                    name="Requisições"
                    fill="#334155"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="s3EgressUsd"
                    name="Egresso S3 Equivalente ($)"
                    fill="#D97706"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="r2EgressUsd"
                    name="Egresso R2 ($0.00)"
                    fill="#16A34A"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Per-bucket cost & usage table */}
      {bucketData.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100">
            Detalhamento por Bucket · Armazenamento, Tráfego e Egresso
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">Bucket</th>
                  <th className="py-2.5 px-3 text-right">Objetos</th>
                  <th className="py-2.5 px-3 text-right">Uso Storage</th>
                  <th className="py-2.5 px-3 text-right">Requisições</th>
                  <th className="py-2.5 px-3 text-right">Egresso</th>
                  <th className="py-2.5 px-3 text-right">Custo Egresso R2</th>
                  <th className="py-2.5 px-4 text-right">Economia vs S3</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono tabular-nums">
                {bucketData.map((b) => (
                  <tr key={b.bucket} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-slate-100">
                      {b.bucket}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      {b.objectCount}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      {formatBytes(b.storageBytes)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      {b.requestCount}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-700 dark:text-slate-300">
                      {formatBytes(b.egressBytes)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-700 dark:text-emerald-400 font-semibold">
                      ${b.r2EgressCostUsd.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-700 dark:text-slate-300">
                      ${b.s3EquivalentEgressUsd.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
