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
import { formatTemplate } from '../shared/i18n';
import { useLocale } from '../shared/LocaleContext';
import type { PerformanceMetricsSnapshot } from '../shared/types';

interface TelemetryDashboardProps {
  metrics: PerformanceMetricsSnapshot | null;
  loading: boolean;
}

export function TelemetryDashboard({ metrics, loading }: TelemetryDashboardProps) {
  const { t } = useLocale();
  const bucketData = metrics?.bucketMetrics ?? [];
  const activeOps = (metrics?.operations ?? []).filter((op) => op.count > 0);
  const totalStorageBytes = bucketData.reduce((acc, b) => acc + b.storageBytes, 0);
  const totalBucketRequests = bucketData.reduce((acc, b) => acc + b.requestCount, 0);

  if (loading && !metrics) {
    return (
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 text-xs text-slate-500">
        {t.telemetry.loadingDashboard}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: R2 Bucket Storage Usage */}
        <div className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t.telemetry.storageChartTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.telemetry.storageChartSub}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
              {formatTemplate(t.telemetry.totalTrackedStorage, {
                size: formatBytes(totalStorageBytes),
              })}
            </span>
          </div>
          <div className="h-64 w-full min-w-0">
            {bucketData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                {t.telemetry.emptyBucketsChart}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                  <Bar
                    dataKey="storageKb"
                    name={t.telemetry.storageSeriesLabel}
                    fill="#EA580C"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="objects"
                    name={t.telemetry.objectsSeriesLabel}
                    fill="#0EA5E9"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Request Counts & R2 Zero Egress Savings */}
        <div className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t.telemetry.egressChartTitle}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t.telemetry.egressChartSub}
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
              {formatTemplate(t.telemetry.totalTrackedRequests, {
                count: totalBucketRequests,
              })}
            </span>
          </div>
          <div className="h-64 w-full min-w-0">
            {bucketData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                {t.telemetry.emptyRequestsChart}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
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
                    name={t.telemetry.requestsSeriesLabel}
                    fill="#334155"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="s3EgressUsd"
                    name={t.telemetry.s3EgressSeriesLabel}
                    fill="#D97706"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="r2EgressUsd"
                    name={t.telemetry.r2EgressSeriesLabel}
                    fill="#16A34A"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Chart 3: API Request Counts by Operation */}
      <div className="min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t.telemetry.opsChartTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t.telemetry.opsChartSub}
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
            {formatTemplate(t.telemetry.totalTrackedRequests, {
              count: metrics?.totalRequests ?? 0,
            })}
          </span>
        </div>
        <div className="h-56 w-full min-w-0">
          {activeOps.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              {t.telemetry.emptyOpsChart}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <BarChart
                data={activeOps.map((op) => ({
                  operation: op.operation,
                  calls: op.count,
                  errors: op.errorCount,
                }))}
                margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#94A3B8" strokeOpacity={0.2} />
                <XAxis dataKey="operation" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748B' }} />
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
                  dataKey="calls"
                  name={t.telemetry.opsCallsSeries}
                  fill="#EA580C"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="errors"
                  name={t.telemetry.opsErrorsSeries}
                  fill="#DC2626"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Per-bucket cost & usage table */}
      {bucketData.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100">
            {t.telemetry.bucketTableTitle}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 px-4">{t.telemetry.colBucket}</th>
                  <th className="py-2.5 px-3 text-right">{t.telemetry.colObjects}</th>
                  <th className="py-2.5 px-3 text-right">{t.telemetry.colStorageUsage}</th>
                  <th className="py-2.5 px-3 text-right">{t.telemetry.colRequests}</th>
                  <th className="py-2.5 px-3 text-right">{t.telemetry.colEgress}</th>
                  <th className="py-2.5 px-3 text-right">{t.telemetry.colR2EgressCost}</th>
                  <th className="py-2.5 px-4 text-right">{t.telemetry.colSavingsVsS3}</th>
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
