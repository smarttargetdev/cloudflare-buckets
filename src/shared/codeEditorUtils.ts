export type EditorLanguageId =
  | 'javascript'
  | 'typescript'
  | 'jsx'
  | 'tsx'
  | 'json'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'html'
  | 'css'
  | 'markdown'
  | 'plaintext';

export interface ExtensionSpec {
  ext: string;
  languageId: EditorLanguageId;
  label: string;
  mimeType: string;
  supportsPreview: boolean;
  defaultTemplate: string;
}

export const KNOWN_CODE_EXTENSIONS: ExtensionSpec[] = [
  {
    ext: 'ts',
    languageId: 'typescript',
    label: 'TypeScript',
    mimeType: 'text/typescript',
    supportsPreview: false,
    defaultTemplate: `export interface BucketObjectMeta {\n  key: string;\n  env: 'production' | 'staging';\n}\n\nexport function describeObject(meta: BucketObjectMeta): string {\n  return \`\${meta.key} (\${meta.env})\`;\n}\n`,
  },
  {
    ext: 'tsx',
    languageId: 'tsx',
    label: 'TypeScript JSX',
    mimeType: 'text/tsx',
    supportsPreview: false,
    defaultTemplate: `import React from 'react';\n\nexport function BucketBadge({ name }: { name: string }) {\n  return <span>{name}</span>;\n}\n`,
  },
  {
    ext: 'js',
    languageId: 'javascript',
    label: 'JavaScript',
    mimeType: 'application/javascript',
    supportsPreview: false,
    defaultTemplate: `export async function handleRequest(request) {\n  return new Response(JSON.stringify({ ok: true }), {\n    headers: { 'Content-Type': 'application/json' },\n  });\n}\n`,
  },
  {
    ext: 'jsx',
    languageId: 'jsx',
    label: 'JavaScript JSX',
    mimeType: 'text/jsx',
    supportsPreview: false,
    defaultTemplate: `export function StatusItem({ label }) {\n  return <div>{label}</div>;\n}\n`,
  },
  {
    ext: 'html',
    languageId: 'html',
    label: 'HTML',
    mimeType: 'text/html',
    supportsPreview: true,
    defaultTemplate: `<!doctype html>\n<html lang="pt-BR">\n  <head>\n    <meta charset="UTF-8" />\n    <title>Cloudflare Buckets Asset</title>\n  </head>\n  <body>\n    <h1>Cloudflare Buckets</h1>\n    <p>Arquivo HTML hospedado no R2.</p>\n  </body>\n</html>\n`,
  },
  {
    ext: 'htm',
    languageId: 'html',
    label: 'HTML (.htm)',
    mimeType: 'text/html',
    supportsPreview: true,
    defaultTemplate: `<h1>Cloudflare Buckets</h1>\n<p>Conteúdo HTM no R2.</p>\n`,
  },
  {
    ext: 'css',
    languageId: 'css',
    label: 'CSS',
    mimeType: 'text/css',
    supportsPreview: false,
    defaultTemplate: `:root {\n  --accent: #ea580c;\n}\n\nbody {\n  font-family: system-ui, sans-serif;\n  color: #0f172a;\n}\n`,
  },
  {
    ext: 'md',
    languageId: 'markdown',
    label: 'Markdown',
    mimeType: 'text/markdown',
    supportsPreview: true,
    defaultTemplate: `# Nota de Lançamento\n\n- Bucket gerenciado pelo **Cloudflare Buckets**\n- Suporte a diretórios virtuais e metadados\n\n\`\`\`ts\nconsole.log('R2 Ready');\n\`\`\`\n`,
  },
  {
    ext: 'json',
    languageId: 'json',
    label: 'JSON',
    mimeType: 'application/json',
    supportsPreview: false,
    defaultTemplate: `{\n  "system": "Cloudflare Buckets",\n  "storageClass": "Standard",\n  "corsEnabled": true\n}\n`,
  },
  {
    ext: 'yaml',
    languageId: 'yaml',
    label: 'YAML',
    mimeType: 'text/yaml',
    supportsPreview: false,
    defaultTemplate: `service: cloudflare-buckets\nruntime: dotnet-10\nsinks:\n  - rolling-file\n  - seq\n`,
  },
  {
    ext: 'yml',
    languageId: 'yaml',
    label: 'YAML (.yml)',
    mimeType: 'text/yaml',
    supportsPreview: false,
    defaultTemplate: `name: deploy-r2\non:\n  push:\n    branches: [main]\n`,
  },
  {
    ext: 'toml',
    languageId: 'toml',
    label: 'TOML',
    mimeType: 'application/toml',
    supportsPreview: false,
    defaultTemplate: `name = "buckets-edge-proxy"\nmain = "src/index.ts"\ncompatibility_date = "2026-11-01"\n\n[[r2_buckets]]\nbinding = "R2_BUCKET"\nbucket_name = "buckets-prod-assets"\n`,
  },
  {
    ext: 'xml',
    languageId: 'xml',
    label: 'XML',
    mimeType: 'application/xml',
    supportsPreview: false,
    defaultTemplate: `<?xml version="1.0" encoding="UTF-8"?>\n<CORSConfiguration>\n  <CORSRule>\n    <AllowedOrigin>*</AllowedOrigin>\n    <AllowedMethod>GET</AllowedMethod>\n  </CORSRule>\n</CORSConfiguration>\n`,
  },
  {
    ext: 'txt',
    languageId: 'plaintext',
    label: 'Texto Simples',
    mimeType: 'text/plain',
    supportsPreview: false,
    defaultTemplate: `Arquivo de texto criado no Cloudflare Buckets.\n`,
  },
];

const EXTENSION_MAP = new Map<string, ExtensionSpec>(
  KNOWN_CODE_EXTENSIONS.map((spec) => [spec.ext, spec]),
);

export function getExtension(fileNameOrKey: string): string {
  const clean = fileNameOrKey.trim().split('/').pop() ?? '';
  const dotIdx = clean.lastIndexOf('.');
  if (dotIdx <= 0 || dotIdx === clean.length - 1) return '';
  return clean.slice(dotIdx + 1).toLowerCase();
}

export function detectEditorLanguage(fileNameOrKey: string): ExtensionSpec {
  const ext = getExtension(fileNameOrKey);
  return (
    EXTENSION_MAP.get(ext) ?? {
      ext: ext || 'txt',
      languageId: 'plaintext',
      label: 'Texto Simples',
      mimeType: 'text/plain',
      supportsPreview: false,
      defaultTemplate: '',
    }
  );
}

export function isEditableExtension(fileNameOrKey: string): boolean {
  const ext = getExtension(fileNameOrKey);
  return EXTENSION_MAP.has(ext) || ['cs', 'sh', 'ndjson', 'log'].includes(ext);
}

export function validateSyntaxHint(languageId: EditorLanguageId, content: string): string | null {
  if (languageId === 'json') {
    try {
      JSON.parse(content);
      return null;
    } catch (err) {
      return err instanceof Error ? `JSON inválido: ${err.message}` : 'JSON inválido.';
    }
  }
  if (languageId === 'xml' && content.trim()) {
    const opens = (content.match(/<[a-zA-Z][^/?>]*>/g) ?? []).length;
    const closes = (content.match(/<\/[a-zA-Z][^>]*>/g) ?? []).length;
    if (opens > 0 && closes === 0 && !content.includes('/>')) {
      return 'Aviso XML: nenhuma tag de fechamento detectada.';
    }
  }
  if (languageId === 'toml' && content.trim()) {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    for (let idx = 0; idx < lines.length; idx += 1) {
      const trimmed = lines[idx].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('[')) {
        if (!trimmed.endsWith(']')) {
          return `Aviso TOML (linha ${idx + 1}): cabeçalho de seção sem fechamento ']'.`;
        }
        continue;
      }
      if (!trimmed.includes('=') && !trimmed.startsWith('"') && !trimmed.startsWith("'") && !trimmed.endsWith(',')) {
        return `Aviso TOML (linha ${idx + 1}): esperado formato chave = valor.`;
      }
    }
  }
  return null;
}

function normalizeBlankLines(lines: string[], maxConsecutive = 1): string[] {
  const out: string[] = [];
  let blanks = 0;
  for (const line of lines) {
    const trimmedRight = line.replace(/[ \t]+$/g, '');
    if (trimmedRight === '') {
      blanks += 1;
      if (blanks <= maxConsecutive && out.length > 0) {
        out.push('');
      }
    } else {
      blanks = 0;
      out.push(trimmedRight);
    }
  }
  while (out.length > 0 && out[out.length - 1] === '') {
    out.pop();
  }
  return out;
}

function formatInlineTokensOutsideStrings(line: string): string {
  // Preserve leading indentation while normalizing spacing outside string/comment literals
  let out = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let escaped = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const next = line[i + 1] ?? '';

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && (inSingle || inDouble || inBacktick)) {
      out += ch;
      escaped = true;
      continue;
    }

    if (!inDouble && !inBacktick && ch === "'") {
      inSingle = !inSingle;
      out += ch;
      continue;
    }
    if (!inSingle && !inBacktick && ch === '"') {
      inDouble = !inDouble;
      out += ch;
      continue;
    }
    if (!inSingle && !inDouble && ch === '`') {
      inBacktick = !inBacktick;
      out += ch;
      continue;
    }

    if (inSingle || inDouble || inBacktick) {
      out += ch;
      continue;
    }

    if (ch === '/' && next === '/') {
      out += line.slice(i);
      break;
    }

    if (ch === ',' && next && next !== ' ' && next !== '\n' && next !== ')' && next !== ']' && next !== '}') {
      out += ', ';
      continue;
    }

    if (ch === '{' && out.length > 0 && !/[\s({[]/.test(out[out.length - 1])) {
      out += ' {';
      continue;
    }

    out += ch;
  }

  return out.replace(/\b(if|for|while|switch|catch)\(/g, '$1 (');
}

function formatBraceLanguage(content: string): string {
  const rawLines = content.replace(/\r\n/g, '\n').split('\n');
  const indented: string[] = [];
  let depth = 0;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      indented.push('');
      continue;
    }

    let leadingCloses = 0;
    for (const ch of trimmed) {
      if (ch === '}' || ch === ']' || ch === ')') {
        leadingCloses += 1;
      } else {
        break;
      }
    }

    const lineDepth = Math.max(0, depth - leadingCloses);
    const normalized = formatInlineTokensOutsideStrings(trimmed);
    indented.push(`${'  '.repeat(lineDepth)}${normalized}`);

    // Compute net bracket delta ignoring strings and single-line comments
    let opens = 0;
    let closes = 0;
    let quote: string | null = null;
    let esc = false;
    for (let i = 0; i < normalized.length; i += 1) {
      const ch = normalized[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\' && quote) {
        esc = true;
        continue;
      }
      if (quote) {
        if (ch === quote) quote = null;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === '/' && normalized[i + 1] === '/') {
        break;
      }
      if (ch === '{' || ch === '[' || ch === '(') opens += 1;
      if (ch === '}' || ch === ']' || ch === ')') closes += 1;
    }

    depth = Math.max(0, depth + opens - closes);
  }

  const cleaned = normalizeBlankLines(indented, 1);
  return cleaned.length > 0 ? `${cleaned.join('\n')}\n` : '';
}

function formatCssContent(content: string): string {
  const expanded = content
    .replace(/\r\n/g, '\n')
    .replace(/\s*\{\s*/g, ' {\n')
    .replace(/;\s*(?!\n|\})/g, ';\n')
    .replace(/\s*\}\s*/g, '\n}\n\n');

  const lines = expanded.split('\n');
  const out: string[] = [];
  let depth = 0;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }
    if (trimmed.startsWith('}')) {
      depth = Math.max(0, depth - 1);
    }
    const formattedLine =
      depth > 0 && trimmed.includes(':') && !trimmed.endsWith('{')
        ? trimmed.replace(/^([^:]+):\s*(.+)$/, '$1: $2')
        : trimmed;
    out.push(`${'  '.repeat(depth)}${formattedLine}`);
    if (trimmed.endsWith('{')) {
      depth += 1;
    }
  }

  const cleaned = normalizeBlankLines(out, 1);
  return cleaned.length > 0 ? `${cleaned.join('\n')}\n` : '';
}

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function formatMarkupContent(content: string): string {
  const rawLines = content
    .replace(/\r\n/g, '\n')
    .replace(/>\s*</g, '>\n<')
    .replace(/<([a-zA-Z0-9:-]+)(\b[^>]*)>\n<\/\1>/g, '<$1$2></$1>')
    .split('\n');

  const out: string[] = [];
  let depth = 0;

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }

    const isClosingStart = /^<\//.test(trimmed);
    if (isClosingStart) {
      depth = Math.max(0, depth - 1);
    }

    out.push(`${'  '.repeat(depth)}${trimmed}`);

    const openMatch = /^<([a-zA-Z0-9:-]+)\b[^>]*>$/.exec(trimmed);
    if (
      openMatch &&
      !trimmed.startsWith('<!') &&
      !trimmed.startsWith('<?') &&
      !trimmed.endsWith('/>') &&
      !trimmed.includes(`</${openMatch[1]}>`) &&
      !VOID_HTML_TAGS.has(openMatch[1].toLowerCase())
    ) {
      depth += 1;
    }
  }

  const cleaned = normalizeBlankLines(out, 1);
  return cleaned.length > 0 ? `${cleaned.join('\n')}\n` : '';
}

function formatMarkdownContent(content: string): string {
  const rawLines = content.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inFence = false;

  for (const raw of rawLines) {
    const trimmedRight = raw.replace(/[ \t]+$/g, '');
    if (trimmedRight.trim().startsWith('```')) {
      inFence = !inFence;
      out.push(trimmedRight.trim());
      continue;
    }
    if (inFence) {
      out.push(trimmedRight);
      continue;
    }

    const headingMatch = /^(#{1,6})\s*(.+)$/.exec(trimmedRight.trim());
    if (headingMatch) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      out.push(`${headingMatch[1]} ${headingMatch[2].trim()}`);
      continue;
    }

    const listMatch = /^(\s*)[*+]\s+(.+)$/.exec(trimmedRight);
    if (listMatch) {
      out.push(`${listMatch[1].replace(/\t/g, '  ')}- ${listMatch[2]}`);
      continue;
    }

    out.push(trimmedRight);
  }

  const cleaned = normalizeBlankLines(out, 1);
  return cleaned.length > 0 ? `${cleaned.join('\n')}\n` : '';
}

function formatYamlContent(content: string): string {
  const rawLines = content.replace(/\r\n/g, '\n').split('\n');
  const out = rawLines.map((raw) => {
    const withSpaces = raw.replace(/^\t+/, (tabs) => '  '.repeat(tabs.length)).replace(/[ \t]+$/g, '');
    if (!withSpaces.trim() || withSpaces.trim().startsWith('#')) return withSpaces;
    return withSpaces.replace(/^(\s*[^:\s][^:]*):([^\s].*)$/, '$1: $2');
  });
  const cleaned = normalizeBlankLines(out, 1);
  return cleaned.length > 0 ? `${cleaned.join('\n')}\n` : '';
}

function formatTomlContent(content: string): string {
  const rawLines = content.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }
    if (trimmed.startsWith('#')) {
      out.push(trimmed);
      continue;
    }
    if (trimmed.startsWith('[')) {
      if (out.length > 0 && out[out.length - 1] !== '' && !out[out.length - 1].startsWith('#')) {
        out.push('');
      }
      out.push(trimmed);
      continue;
    }
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      out.push(`${k} = ${v}`);
      continue;
    }
    out.push(trimmed);
  }

  const cleaned = normalizeBlankLines(out, 1);
  return cleaned.length > 0 ? `${cleaned.join('\n')}\n` : '';
}

export function formatCodeContent(languageId: EditorLanguageId, content: string): string {
  switch (languageId) {
    case 'json': {
      const parsed = JSON.parse(content);
      return `${JSON.stringify(parsed, null, 2)}\n`;
    }
    case 'javascript':
    case 'typescript':
    case 'jsx':
    case 'tsx':
      return formatBraceLanguage(content);
    case 'css':
      return formatCssContent(content);
    case 'html':
    case 'xml':
      return formatMarkupContent(content);
    case 'markdown':
      return formatMarkdownContent(content);
    case 'yaml':
      return formatYamlContent(content);
    case 'toml':
      return formatTomlContent(content);
    default: {
      const cleaned = normalizeBlankLines(content.replace(/\r\n/g, '\n').split('\n'), 1);
      return cleaned.length > 0 ? `${cleaned.join('\n')}\n` : '';
    }
  }
}

export type TokenKind = 'keyword' | 'string' | 'comment' | 'number' | 'tag' | 'plain';

export interface CodeToken {
  kind: TokenKind;
  text: string;
}

const JS_TS_KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'default',
  'const',
  'let',
  'var',
  'function',
  'async',
  'await',
  'return',
  'if',
  'else',
  'for',
  'of',
  'in',
  'type',
  'interface',
  'extends',
  'implements',
  'class',
  'new',
  'try',
  'catch',
  'throw',
  'true',
  'false',
  'null',
  'undefined',
]);

export function tokenizeLine(languageId: EditorLanguageId, line: string): CodeToken[] {
  if (!line) return [{ kind: 'plain', text: '' }];

  if (languageId === 'markdown') {
    if (/^\s*#{1,6}\s/.test(line)) return [{ kind: 'keyword', text: line }];
    if (/^\s*[-*]\s/.test(line)) return [{ kind: 'tag', text: line }];
    if (/^\s*```/.test(line)) return [{ kind: 'comment', text: line }];
    return [{ kind: 'plain', text: line }];
  }

  if (languageId === 'html' || languageId === 'xml') {
    const parts = line.split(/(<\/?[^>]+>)/g).filter(Boolean);
    return parts.map((part) =>
      part.startsWith('<') && part.endsWith('>')
        ? { kind: 'tag', text: part }
        : { kind: 'plain', text: part },
    );
  }

  if (languageId === 'yaml') {
    if (line.trim().startsWith('#')) return [{ kind: 'comment', text: line }];
    const colon = line.indexOf(':');
    if (colon > 0) {
      return [
        { kind: 'tag', text: line.slice(0, colon + 1) },
        { kind: 'string', text: line.slice(colon + 1) },
      ];
    }
    return [{ kind: 'plain', text: line }];
  }

  if (languageId === 'toml') {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) return [{ kind: 'comment', text: line }];
    if (trimmed.startsWith('[')) return [{ kind: 'tag', text: line }];
    const eq = line.indexOf('=');
    if (eq > 0) {
      return [
        { kind: 'keyword', text: line.slice(0, eq) },
        { kind: 'plain', text: '=' },
        { kind: 'string', text: line.slice(eq + 1) },
      ];
    }
    return [{ kind: 'plain', text: line }];
  }

  if (
    languageId === 'javascript' ||
    languageId === 'typescript' ||
    languageId === 'jsx' ||
    languageId === 'tsx' ||
    languageId === 'json' ||
    languageId === 'css'
  ) {
    if (line.trim().startsWith('//') || line.trim().startsWith('/*')) {
      return [{ kind: 'comment', text: line }];
    }
    const regex = /('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b)/g;
    const tokens: CodeToken[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({ kind: 'plain', text: line.slice(lastIndex, match.index) });
      }
      const val = match[0];
      if (val.startsWith("'") || val.startsWith('"') || val.startsWith('`')) {
        tokens.push({ kind: 'string', text: val });
      } else if (/^\d/.test(val)) {
        tokens.push({ kind: 'number', text: val });
      } else if (JS_TS_KEYWORDS.has(val)) {
        tokens.push({ kind: 'keyword', text: val });
      } else {
        tokens.push({ kind: 'plain', text: val });
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < line.length) {
      tokens.push({ kind: 'plain', text: line.slice(lastIndex) });
    }
    return tokens;
  }

  return [{ kind: 'plain', text: line }];
}

export type MarkdownBlock =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'code'; lang: string; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

export function parseMarkdownBlocks(md: string): MarkdownBlock[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') });
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ type: 'h3', text: line.slice(4).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ type: 'h2', text: line.slice(3).trim() });
      i += 1;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ type: 'h1', text: line.slice(2).trim() });
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join(' ') });
  }

  return blocks;
}
