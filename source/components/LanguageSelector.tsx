import { useEffect, useRef, useState } from 'react';
import type { AppLocale } from '../shared/i18n';
import { useLocale } from '../shared/LocaleContext';

export function BrazilFlagSvg({ className = 'w-4 h-3 shrink-0 rounded-[2px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 20"
      aria-hidden="true"
      className={className}
    >
      <rect width="28" height="20" rx="2" fill="#009B3A" />
      <polygon points="14,2.2 25.2,10 14,17.8 2.8,10" fill="#FEDF00" />
      <circle cx="14" cy="10" r="4.3" fill="#002776" />
      <path
        d="M10.1 9.1c2.4-.9 5.5-.6 7.8.7"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function UsaFlagSvg({ className = 'w-4 h-3 shrink-0 rounded-[2px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 20"
      aria-hidden="true"
      className={className}
    >
      <rect width="28" height="20" rx="2" fill="#FFFFFF" />
      <rect y="0" width="28" height="1.54" fill="#B22234" />
      <rect y="3.08" width="28" height="1.54" fill="#B22234" />
      <rect y="6.15" width="28" height="1.54" fill="#B22234" />
      <rect y="9.23" width="28" height="1.54" fill="#B22234" />
      <rect y="12.31" width="28" height="1.54" fill="#B22234" />
      <rect y="15.38" width="28" height="1.54" fill="#B22234" />
      <rect y="18.46" width="28" height="1.54" fill="#B22234" />
      <rect width="12.6" height="10.77" fill="#3C3B6E" />
      <circle cx="2.5" cy="2.3" r="0.65" fill="#FFFFFF" />
      <circle cx="6.3" cy="2.3" r="0.65" fill="#FFFFFF" />
      <circle cx="10.1" cy="2.3" r="0.65" fill="#FFFFFF" />
      <circle cx="4.4" cy="4.4" r="0.65" fill="#FFFFFF" />
      <circle cx="8.2" cy="4.4" r="0.65" fill="#FFFFFF" />
      <circle cx="2.5" cy="6.5" r="0.65" fill="#FFFFFF" />
      <circle cx="6.3" cy="6.5" r="0.65" fill="#FFFFFF" />
      <circle cx="10.1" cy="6.5" r="0.65" fill="#FFFFFF" />
      <circle cx="4.4" cy="8.6" r="0.65" fill="#FFFFFF" />
      <circle cx="8.2" cy="8.6" r="0.65" fill="#FFFFFF" />
    </svg>
  );
}

const LOCALE_TOOLTIPS: Record<AppLocale, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
};

const LOCALE_OPTIONS: AppLocale[] = ['pt-BR', 'en-US'];

export function LanguageSelector() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [open]);

  const activeTooltip = LOCALE_TOOLTIPS[locale];

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${t.shell.languageLabel}: ${activeTooltip}`}
        title={activeTooltip}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center justify-center p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
      >
        {locale === 'pt-BR' ? (
          <BrazilFlagSvg className="w-5 h-4 shrink-0 rounded-[2px]" />
        ) : (
          <UsaFlagSvg className="w-5 h-4 shrink-0 rounded-[2px]" />
        )}
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t.shell.languageLabel}
          className="absolute right-0 mt-1.5 w-max min-w-[130px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shadow-lg p-1 z-50 space-y-1"
        >
          {LOCALE_OPTIONS.map((code) => {
            const selected = code === locale;
            const tooltip = LOCALE_TOOLTIPS[code];
            return (
              <li key={code} role="option" aria-selected={selected}>
                <button
                  type="button"
                  title={tooltip}
                  aria-label={tooltip}
                  onClick={() => {
                    setLocale(code);
                    setOpen(false);
                  }}
                  className={`w-full px-2.5 py-2 flex items-center gap-2.5 rounded-md text-xs whitespace-nowrap transition-colors ${
                    selected
                      ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 font-medium'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {code === 'pt-BR' ? (
                    <BrazilFlagSvg className="w-5 h-3.5 shrink-0 rounded-[2px]" />
                  ) : (
                    <UsaFlagSvg className="w-5 h-3.5 shrink-0 rounded-[2px]" />
                  )}
                  <span>{tooltip}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
