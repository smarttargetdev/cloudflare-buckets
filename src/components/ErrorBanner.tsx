import { AlertTriangle, X } from 'lucide-react';
import type { ParsedClientError } from '../shared/errorHandler';
import { useLocale } from '../shared/LocaleContext';

interface ErrorBannerProps {
  error: ParsedClientError | null;
  onDismiss: () => void;
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  const { t } = useLocale();
  if (!error) return null;

  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/90 dark:bg-red-950/40 px-4 py-3 text-sm text-red-900 dark:text-red-100"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <span>{error.title}</span>
              <span aria-hidden="true" className="text-red-400">·</span>
              <span className="font-mono text-xs text-red-700 dark:text-red-300">{error.errorCode}</span>
              {error.traceId && (
                <>
                  <span aria-hidden="true" className="text-red-400">·</span>
                  <span className="font-mono text-xs text-red-700/80 dark:text-red-300/80">
                    {t.errorBanner.traceLabel} {error.traceId}
                  </span>
                </>
              )}
            </div>
            <p className="text-red-800 dark:text-red-200 leading-relaxed">{error.userMessage}</p>
            {error.validationDetails.length > 0 && (
              <ul className="list-disc list-inside text-xs text-red-700 dark:text-red-300 pt-1">
                {error.validationDetails.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t.errorBanner.dismissAria}
          className="p-1 rounded-md text-red-600 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
