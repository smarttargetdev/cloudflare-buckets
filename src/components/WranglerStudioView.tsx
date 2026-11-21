import { useState } from 'react';
import { Check, Copy, Plus, Trash2 } from 'lucide-react';
import { generateWranglerToml, type WranglerBindingConfig } from '../monorepo';
import { useLocale } from '../shared/LocaleContext';
import type { R2LocationHint } from '../shared/types';

interface WranglerStudioViewProps {
  onTomlChange: (toml: string) => void;
}

export function WranglerStudioView({ onTomlChange }: WranglerStudioViewProps) {
  const { t } = useLocale();
  const [workerName, setWorkerName] = useState('cloudflare-buckets-edge');
  const [environment, setEnvironment] = useState<'development' | 'staging' | 'production'>('production');
  const [enableAnalyticsEngine, setEnableAnalyticsEngine] = useState(true);
  const [enableTailWorker, setEnableTailWorker] = useState(true);
  const [bindings, setBindings] = useState<WranglerBindingConfig[]>([
    { binding: 'PROD_ASSETS', bucketName: 'buckets-prod-assets', locationHint: 'ENAM' },
    { binding: 'MOBILE_BUILDS', bucketName: 'buckets-mobile-builds', locationHint: 'WNAM' },
  ]);

  const [newBinding, setNewBinding] = useState('');
  const [newBucket, setNewBucket] = useState('');
  const [newHint, setNewHint] = useState<R2LocationHint>('ENAM');
  const [copied, setCopied] = useState(false);

  const toml = generateWranglerToml({
    workerName,
    environment,
    bindings,
    enableAnalyticsEngine,
    enableTailWorker,
  });

  const updateBindings = (next: WranglerBindingConfig[]) => {
    setBindings(next);
    onTomlChange(
      generateWranglerToml({
        workerName,
        environment,
        bindings: next,
        enableAnalyticsEngine,
        enableTailWorker,
      }),
    );
  };

  const handleAddBinding = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBinding.trim() || !newBucket.trim()) return;
    updateBindings([
      ...bindings,
      {
        binding: newBinding.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'),
        bucketName: newBucket.trim().toLowerCase(),
        locationHint: newHint,
      },
    ]);
    setNewBinding('');
    setNewBucket('');
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(toml);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <section className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t.wrangler.title}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t.wrangler.subtitle}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t.wrangler.workerNameLabel}
            </label>
            <input
              type="text"
              value={workerName}
              onChange={(e) => {
                setWorkerName(e.target.value);
                onTomlChange(
                  generateWranglerToml({
                    workerName: e.target.value,
                    environment,
                    bindings,
                    enableAnalyticsEngine,
                    enableTailWorker,
                  }),
                );
              }}
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              {t.wrangler.environmentLabel}
            </label>
            <select
              value={environment}
              onChange={(e) => {
                const env = e.target.value as 'development' | 'staging' | 'production';
                setEnvironment(env);
                onTomlChange(
                  generateWranglerToml({
                    workerName,
                    environment: env,
                    bindings,
                    enableAnalyticsEngine,
                    enableTailWorker,
                  }),
                );
              }}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="development">development</option>
              <option value="staging">staging</option>
              <option value="production">production</option>
            </select>
          </div>
        </div>

        <div className="space-y-2 text-xs">
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={enableAnalyticsEngine}
              onChange={(e) => setEnableAnalyticsEngine(e.target.checked)}
              className="accent-orange-600"
            />
            {t.wrangler.enableAnalytics}
          </label>
          <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={enableTailWorker}
              onChange={(e) => setEnableTailWorker(e.target.checked)}
              className="accent-orange-600"
            />
            {t.wrangler.enableTailWorker}
          </label>
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{t.wrangler.activeBindings}</div>
          {bindings.map((b) => (
            <div
              key={b.binding}
              className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-mono"
            >
              <span>
                {b.binding} → {b.bucketName} ({b.locationHint})
              </span>
              <button
                type="button"
                onClick={() => updateBindings(bindings.filter((item) => item.binding !== b.binding))}
                className="text-slate-400 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <form onSubmit={handleAddBinding} className="grid grid-cols-12 gap-2 pt-1">
            <input
              type="text"
              placeholder="BINDING"
              value={newBinding}
              onChange={(e) => setNewBinding(e.target.value)}
              className="col-span-4 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <input
              type="text"
              placeholder="bucket-name"
              value={newBucket}
              onChange={(e) => setNewBucket(e.target.value)}
              className="col-span-4 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <select
              value={newHint}
              onChange={(e) => setNewHint(e.target.value as R2LocationHint)}
              className="col-span-2 px-1.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
            >
              <option value="ENAM">ENAM</option>
              <option value="WNAM">WNAM</option>
              <option value="WEUR">WEUR</option>
              <option value="APAC">APAC</option>
            </select>
            <button
              type="submit"
              className="col-span-2 inline-flex items-center justify-center rounded-lg bg-orange-600 text-white hover:bg-orange-700"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </section>

      <section className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
            infra-wrangler/wrangler.toml
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t.wrangler.copied : t.wrangler.copyToml}
          </button>
        </div>

        <pre className="p-5 text-xs font-mono text-slate-800 dark:text-slate-200 bg-slate-50/50 dark:bg-slate-950 overflow-auto flex-1">
          {toml}
        </pre>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs font-mono text-slate-600 dark:text-slate-300 space-y-1">
          {bindings.map((b) => (
            <div key={b.binding}>
              npx wrangler r2 bucket create {b.bucketName} --location {b.locationHint.toLowerCase()}
            </div>
          ))}
          <div className="text-orange-600 dark:text-orange-400 font-semibold">
            npx wrangler deploy --env {environment}
          </div>
        </div>
      </section>
    </div>
  );
}
