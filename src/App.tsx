import { useEffect, useState } from 'react';
import {
  Activity,
  Code2,
  Database,
  KeyRound,
  Moon,
  Search,
  Smartphone,
  Sun,
  TerminalSquare,
} from 'lucide-react';
import { BucketsExplorer } from './components/BucketsExplorer';
import { ConnectionDrawer } from './components/ConnectionDrawer';
import { ExpoSimulatorView } from './components/ExpoSimulatorView';
import { GlobalSearchView } from './components/GlobalSearchView';
import { MonorepoExplorerView } from './components/MonorepoExplorerView';
import { TelemetryView } from './components/TelemetryView';
import { WranglerStudioView } from './components/WranglerStudioView';
import { apiClient, type ApiConnectionConfig } from './services/apiClient';

type ActiveTab = 'buckets' | 'search' | 'telemetry' | 'expo' | 'wrangler' | 'monorepo';

const NAV_ITEMS: Array<{ id: ActiveTab; label: string; icon: typeof Database }> = [
  { id: 'buckets', label: 'Buckets & Pastas', icon: Database },
  { id: 'search', label: 'Busca Global', icon: Search },
  { id: 'telemetry', label: 'Telemetria & Logs', icon: Activity },
  { id: 'expo', label: 'Expo Universal', icon: Smartphone },
  { id: 'wrangler', label: 'Wrangler IaC', icon: TerminalSquare },
  { id: 'monorepo', label: 'Monorepo & Testes', icon: Code2 },
];

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('buckets');
  const [selectedBucket, setSelectedBucket] = useState('buckets-prod-assets');
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [connectionConfig, setConnectionConfig] = useState<ApiConnectionConfig>(
    apiClient.getConnectionConfig(),
  );
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [customWranglerToml, setCustomWranglerToml] = useState<string | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const handleSaveConnection = (next: ApiConnectionConfig) => {
    apiClient.setConnectionConfig(next);
    setConnectionConfig(next);
    setConnectionVersion((v) => v + 1);
  };

  const handleJumpFromSearch = (bucket: string, prefix: string) => {
    setSelectedBucket(bucket);
    setCurrentPrefix(prefix);
    setActiveTab('buckets');
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-[#F8FAFC]">
      {/* Strict 3-Zone Top Bar */}
      <header className="h-14 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] px-6 flex items-center justify-between gap-8 shrink-0">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('buckets');
          }}
          className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          Cloudflare Buckets
        </a>

        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-300">
          {NAV_ITEMS.slice(0, 5).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                activeTab === item.id
                  ? 'border-orange-600 text-slate-900 dark:text-slate-100'
                  : 'border-transparent hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? 'Ativar tema claro' : 'Ativar tema escuro'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {connectionConfig.mode === 'cloudflare' ? 'R2 Conectado' : 'Credenciais R2'}
          </button>
        </div>
      </header>

      {/* Workspace Body: 260px Sidebar + Main Viewport */}
      <div className="flex-1 flex min-w-0">
        <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <div className="font-medium text-slate-700 dark:text-slate-300">
              Buckets · {connectionConfig.mode === 'cloudflare' ? 'Cloudflare R2' : 'Sandbox Local'}
            </div>
            <div>.NET 10 · Expo Universal · Wrangler</div>
          </div>
        </aside>

        {/* Mobile Tab Selector */}
        <main className="flex-1 min-w-0 p-4 md:p-6 overflow-y-auto">
          <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 ${
                  activeTab === item.id
                    ? 'bg-orange-600 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="max-w-6xl mx-auto">
            {activeTab === 'buckets' && (
              <BucketsExplorer
                selectedBucket={selectedBucket}
                currentPrefix={currentPrefix}
                onSelectBucket={setSelectedBucket}
                onChangePrefix={setCurrentPrefix}
                connectionVersion={connectionVersion}
              />
            )}
            {activeTab === 'search' && (
              <GlobalSearchView
                onOpenLocation={handleJumpFromSearch}
                connectionVersion={connectionVersion}
              />
            )}
            {activeTab === 'telemetry' && <TelemetryView />}
            {activeTab === 'expo' && <ExpoSimulatorView />}
            {activeTab === 'wrangler' && (
              <WranglerStudioView onTomlChange={setCustomWranglerToml} />
            )}
            {activeTab === 'monorepo' && (
              <MonorepoExplorerView customWranglerToml={customWranglerToml} />
            )}
          </div>
        </main>
      </div>

      <ConnectionDrawer
        open={drawerOpen}
        config={connectionConfig}
        onClose={() => setDrawerOpen(false)}
        onSave={handleSaveConnection}
      />
    </div>
  );
}
