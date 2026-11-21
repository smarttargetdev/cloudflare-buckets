import { useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { CloudflareCredentials, ConnectionMode } from '../shared/types';
import type { ApiConnectionConfig } from '../services/apiClient';

interface ConnectionDrawerProps {
  open: boolean;
  config: ApiConnectionConfig;
  onClose: () => void;
  onSave: (next: ApiConnectionConfig) => void;
}

export function ConnectionDrawer({ open, config, onClose, onSave }: ConnectionDrawerProps) {
  const [mode, setMode] = useState<ConnectionMode>(config.mode);
  const [creds, setCreds] = useState<CloudflareCredentials>(config.credentials);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'cloudflare') {
      if (!creds.accountId.trim() || !creds.accessKeyId.trim() || !creds.secretAccessKey.trim()) {
        setValidationMsg('Informe Account ID, R2 Access Key ID e Secret Access Key para conectar ao Cloudflare R2.');
        return;
      }
    }
    setValidationMsg(null);
    onSave({ mode, credentials: creds });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]">
      <div className="w-full max-w-md bg-white dark:bg-[#111827] border-l border-slate-200 dark:border-slate-800 h-full flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Conexão Cloudflare R2
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel de credenciais"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Modo de Execução
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => setMode('sandbox')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'sandbox'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Sandbox Local
              </button>
              <button
                type="button"
                onClick={() => setMode('cloudflare')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'cloudflare'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                Cloudflare R2 Real
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {mode === 'sandbox'
                ? 'O Sandbox Local simula o SDK oficial S3, diretórios virtuais, busca por tags e operações em lote instantaneamente no servidor.'
                : 'Conecta diretamente ao endpoint S3 https://<accountId>.r2.cloudflarestorage.com usando suas chaves da sessão.'}
            </p>
          </div>

          {mode === 'cloudflare' && (
            <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Cloudflare Account ID
                </label>
                <input
                  type="text"
                  value={creds.accountId}
                  onChange={(e) => setCreds({ ...creds, accountId: e.target.value })}
                  placeholder="ex: 8f9c2a1b3d4e5f6a7b8c9d0e1f2a3b4c"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  R2 Access Key ID
                </label>
                <input
                  type="text"
                  value={creds.accessKeyId}
                  onChange={(e) => setCreds({ ...creds, accessKeyId: e.target.value })}
                  placeholder="Chave de acesso S3 do token R2"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  R2 Secret Access Key
                </label>
                <input
                  type="password"
                  value={creds.secretAccessKey}
                  onChange={(e) => setCreds({ ...creds, secretAccessKey: e.target.value })}
                  placeholder="Segredo S3 do token R2"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Cloudflare API Token (Opcional · Admin REST)
                </label>
                <input
                  type="password"
                  value={creds.apiToken}
                  onChange={(e) => setCreds({ ...creds, apiToken: e.target.value })}
                  placeholder="Bearer Token com permissão Workers R2 Storage:Edit"
                  className="w-full px-3 py-2 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                As credenciais permanecem apenas na memória desta sessão e são enviadas por cabeçalho TLS ao backend.
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
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors"
            >
              Aplicar Conexão
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
