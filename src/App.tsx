import { useEffect, useState } from 'react';
import {
  Activity,
  Code2,
  Database,
  FileCode2,
  KeyRound,
  Moon,
  Search,
  Smartphone,
  Sun,
  TerminalSquare,
} from 'lucide-react';
import { BucketsExplorer } from './components/BucketsExplorer';
import { CodeEditorWorkspace, type EditorTarget } from './components/CodeEditorWorkspace';
import { ConnectionDrawer } from './components/ConnectionDrawer';
import { ExpoSimulatorView } from './components/ExpoSimulatorView';
import { GlobalSearchView } from './components/GlobalSearchView';
import { LanguageSelector } from './components/LanguageSelector';
import { MonorepoExplorerView } from './components/MonorepoExplorerView';
import { TelemetryView } from './components/TelemetryView';
import { WranglerStudioView } from './components/WranglerStudioView';
import { apiClient, type ApiConnectionConfig } from './services/apiClient';
import { LocaleProvider, useLocale } from './shared/LocaleContext';

type ActiveTab = 'buckets' | 'editor' | 'search' | 'telemetry' | 'expo' | 'wrangler' | 'monorepo';

export default function App() {
  return (
    <LocaleProvider>
      <AppShell />
    </LocaleProvider>
  );
}

function AppShell() {
  const { t } = useLocale();
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('buckets');
  const [selectedBucket, setSelectedBucket] = useState('buckets-prod-assets');
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [connectionConfig, setConnectionConfig] = useState<ApiConnectionConfig>(
    apiClient.getConnectionConfig(),
  );
  const [connectionVersion, setConnectionVersion] = useState(0);
  const [customWranglerToml, setCustomWranglerToml] = useState<string | undefined>(undefined);

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    shortcut: string;
    icon: typeof Database;
  }> = [
    { id: 'buckets', label: t.nav.buckets, shortcut: 'Ctrl+B', icon: Database },
    { id: 'editor', label: t.nav.editor, shortcut: 'Alt+C', icon: FileCode2 },
    { id: 'search', label: t.nav.search, shortcut: 'Ctrl+K', icon: Search },
    { id: 'telemetry', label: t.nav.telemetry, shortcut: 'Alt+T', icon: Activity },
    { id: 'expo', label: t.nav.expo, shortcut: 'Alt+E', icon: Smartphone },
    { id: 'wrangler', label: t.nav.wrangler, shortcut: 'Alt+W', icon: TerminalSquare },
    { id: 'monorepo', label: t.nav.monorepo, shortcut: 'Alt+M', icon: Code2 },
  ];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'k') {
        e.preventDefault();
        setActiveTab('search');
        setSearchFocusSignal((n) => n + 1);
        return;
      }

      if (mod && key === 'b') {
        e.preventDefault();
        setActiveTab('buckets');
        return;
      }

      if (isEditingText) return;

      if (e.altKey && key === 'c') {
        e.preventDefault();
        setActiveTab('editor');
      } else if (e.altKey && key === 't') {
        e.preventDefault();
        setActiveTab('telemetry');
      } else if (e.altKey && key === 'e') {
        e.preventDefault();
        setActiveTab('expo');
      } else if (e.altKey && key === 'w') {
        e.preventDefault();
        setActiveTab('wrangler');
      } else if (e.altKey && key === 'm') {
        e.preventDefault();
        setActiveTab('monorepo');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const handleOpenEditor = (bucket: string, key: string, isNew: boolean) => {
    setEditorTarget({ bucket, key, isNew, nonce: Date.now() });
    setActiveTab('editor');
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
          {t.shell.brand}
        </a>

        <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-600 dark:text-slate-300">
          {navItems.slice(0, 5).map((item) => (
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
          <LanguageSelector />
          <button
            type="button"
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? t.shell.lightThemeAria : t.shell.darkThemeAria}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title={
              connectionConfig.mode === 'cloudflare'
                ? t.shell.r2Connected
                : t.shell.r2Credentials
            }
            aria-label={
              connectionConfig.mode === 'cloudflare'
                ? t.shell.r2Connected
                : t.shell.r2Credentials
            }
            className="inline-flex items-center justify-center p-2 text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors shrink-0"
          >
            <KeyRound className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Workspace Body: 260px Sidebar + Main Viewport */}
      <div className="flex-1 flex min-w-0">
        <aside className="hidden md:flex w-64 shrink-0 flex-col justify-between border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    if (item.id === 'search') {
                      setSearchFocusSignal((n) => n + 1);
                    }
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {item.shortcut}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1 text-xs text-slate-500 dark:text-slate-400">
            <div className="font-medium text-slate-700 dark:text-slate-300">
              Buckets · {connectionConfig.mode === 'cloudflare' ? t.shell.cloudflareR2 : t.shell.sandboxLocal}
            </div>
            <div>{t.shell.shortcutHint}</div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-4 md:p-6 overflow-y-auto">
          <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
            {navItems.map((item) => (
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
                onOpenEditor={handleOpenEditor}
                connectionVersion={connectionVersion}
              />
            )}
            {activeTab === 'editor' && (
              <CodeEditorWorkspace
                target={editorTarget}
                connectionVersion={connectionVersion}
                onSaved={() => setConnectionVersion((v) => v + 1)}
              />
            )}
            {activeTab === 'search' && (
              <GlobalSearchView
                onOpenLocation={handleJumpFromSearch}
                connectionVersion={connectionVersion}
                focusSignal={searchFocusSignal}
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
