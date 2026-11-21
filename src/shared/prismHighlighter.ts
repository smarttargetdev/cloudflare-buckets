import { Prism } from './prismInit';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-markdown';

import type { EditorLanguageId } from './codeEditorUtils';

export interface PrismSpan {
  text: string;
  types: string[];
}

export function getPrismLanguageKey(languageId: EditorLanguageId): string {
  switch (languageId) {
    case 'javascript':
      return 'javascript';
    case 'typescript':
      return 'typescript';
    case 'jsx':
      return 'jsx';
    case 'tsx':
      return 'tsx';
    case 'json':
      return 'json';
    case 'yaml':
      return 'yaml';
    case 'toml':
      return 'toml';
    case 'xml':
    case 'html':
      return 'markup';
    case 'css':
      return 'css';
    case 'markdown':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

type PrismTokenStream = string | Prism.Token | Array<string | Prism.Token>;

function flattenStream(stream: PrismTokenStream, inheritedTypes: string[], out: PrismSpan[]): void {
  if (typeof stream === 'string') {
    if (stream.length > 0) {
      out.push({ text: stream, types: inheritedTypes });
    }
    return;
  }

  if (Array.isArray(stream)) {
    for (const item of stream) {
      flattenStream(item, inheritedTypes, out);
    }
    return;
  }

  const aliases = Array.isArray(stream.alias)
    ? stream.alias
    : stream.alias
      ? [stream.alias]
      : [];
  const nextTypes = [...inheritedTypes, stream.type, ...aliases];
  flattenStream(stream.content as PrismTokenStream, nextTypes, out);
}

export function highlightCodeLinesWithPrism(
  languageId: EditorLanguageId,
  code: string,
): PrismSpan[][] {
  const prismKey = getPrismLanguageKey(languageId);
  const grammar = prismKey !== 'plaintext' ? Prism.languages[prismKey] : undefined;

  if (!grammar) {
    return code.split('\n').map((line) => (line ? [{ text: line, types: [] }] : []));
  }

  const rawTokens = Prism.tokenize(code, grammar);
  const flatSpans: PrismSpan[] = [];
  flattenStream(rawTokens as PrismTokenStream, [], flatSpans);

  const lines: PrismSpan[][] = [[]];
  for (const span of flatSpans) {
    const segments = span.text.split('\n');
    for (let i = 0; i < segments.length; i += 1) {
      if (i > 0) {
        lines.push([]);
      }
      if (segments[i].length > 0) {
        lines[lines.length - 1].push({ text: segments[i], types: span.types });
      }
    }
  }

  return lines;
}

export function getPrismTokenClass(types: string[], forOverlay = false): string {
  if (types.length === 0) {
    return 'text-slate-900 dark:text-slate-100';
  }

  const has = (t: string) => types.includes(t);

  if (has('comment') || has('prolog') || has('doctype') || has('cdata')) {
    return forOverlay
      ? 'text-slate-400 dark:text-slate-500'
      : 'text-slate-400 dark:text-slate-500 italic';
  }
  if (has('keyword') || has('atrule') || has('important') || has('rule')) {
    return forOverlay
      ? 'text-orange-600 dark:text-orange-400'
      : 'text-orange-600 dark:text-orange-400 font-semibold';
  }
  if (has('string') || has('char') || has('attr-value') || has('inserted')) {
    return 'text-emerald-700 dark:text-emerald-400';
  }
  if (has('number') || has('boolean') || has('constant') || has('symbol')) {
    return 'text-sky-600 dark:text-sky-400';
  }
  if (has('tag') || has('selector') || has('table') || has('section')) {
    return 'text-indigo-600 dark:text-indigo-400';
  }
  if (has('property') || has('attr-name') || has('key')) {
    return 'text-teal-700 dark:text-teal-400';
  }
  if (has('function') || has('class-name') || has('builtin') || has('title')) {
    return 'text-amber-700 dark:text-amber-300';
  }
  if (has('operator') || has('punctuation')) {
    return 'text-slate-500 dark:text-slate-400';
  }
  if (has('deleted')) {
    return 'text-rose-600 dark:text-rose-400';
  }

  return 'text-slate-900 dark:text-slate-100';
}
