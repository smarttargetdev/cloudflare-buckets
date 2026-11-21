import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectEditorLanguage,
  formatCodeContent,
  isEditableExtension,
  parseMarkdownBlocks,
  tokenizeLine,
  validateSyntaxHint,
} from '../source/shared/codeEditorUtils';
import {
  getPrismLanguageKey,
  getPrismTokenClass,
  highlightCodeLinesWithPrism,
} from '../source/shared/prismHighlighter';

describe('Code & Text Editor Language Detection, Formatting & Prism.js', () => {
  it('detects all required code and text file extensions including toml accurately', () => {
    const cases: Array<[string, string, string]> = [
      ['worker.js', 'javascript', 'application/javascript'],
      ['types.ts', 'typescript', 'text/typescript'],
      ['button.jsx', 'jsx', 'text/jsx'],
      ['view.tsx', 'tsx', 'text/tsx'],
      ['config.json', 'json', 'application/json'],
      ['deploy.yaml', 'yaml', 'text/yaml'],
      ['ci.yml', 'yaml', 'text/yaml'],
      ['wrangler.toml', 'toml', 'application/toml'],
      ['cors.xml', 'xml', 'application/xml'],
      ['index.htm', 'html', 'text/html'],
      ['index.html', 'html', 'text/html'],
      ['styles.css', 'css', 'text/css'],
      ['README.md', 'markdown', 'text/markdown'],
      ['notes.txt', 'plaintext', 'text/plain'],
    ];

    for (const [file, lang, mime] of cases) {
      const spec = detectEditorLanguage(file);
      assert.equal(spec.languageId, lang);
      assert.equal(spec.mimeType, mime);
      assert.equal(isEditableExtension(file), true);
    }
  });

  it('validates JSON and TOML hints and rejects malformed JSON', () => {
    assert.equal(validateSyntaxHint('json', '{"a":1}'), null);
    assert.match(validateSyntaxHint('json', '{"a":') ?? '', /JSON inválido/);

    assert.equal(validateSyntaxHint('toml', '[r2_buckets]\nbinding = "R2"'), null);
    assert.match(validateSyntaxHint('toml', '[r2_buckets\nbinding = "R2"') ?? '', /Aviso TOML/);
  });

  it('applies Prettier-like auto-formatting for JSON, TypeScript, CSS, HTML, and TOML', () => {
    const jsonFormatted = formatCodeContent('json', '{"b":2,"a":1}');
    assert.equal(jsonFormatted, '{\n  "b": 2,\n  "a": 1\n}\n');

    const tsFormatted = formatCodeContent(
      'typescript',
      'export function sum(a:number,b:number){\nif(a>0){\nreturn a+b;\n}\nreturn 0;\n}',
    );
    assert.equal(
      tsFormatted,
      'export function sum(a:number, b:number) {\n  if (a>0) {\n    return a+b;\n  }\n  return 0;\n}\n',
    );

    const cssFormatted = formatCodeContent('css', 'body{color:#0f172a;margin:0;}');
    assert.equal(cssFormatted, 'body {\n  color: #0f172a;\n  margin: 0;\n}\n');

    const htmlFormatted = formatCodeContent('html', '<div><h1>Title</h1><p>Text</p></div>');
    assert.equal(htmlFormatted, '<div>\n  <h1>Title</h1>\n  <p>Text</p>\n</div>\n');

    const tomlFormatted = formatCodeContent('toml', 'name="app"\n[r2]\nbucket_name="prod"');
    assert.equal(tomlFormatted, 'name = "app"\n\n[r2]\nbucket_name = "prod"\n');
  });

  it('highlights TypeScript, TSX, HTML, and TOML accurately via Prism.js', () => {
    assert.equal(getPrismLanguageKey('html'), 'markup');
    assert.equal(getPrismLanguageKey('toml'), 'toml');

    const tsLines = highlightCodeLinesWithPrism('typescript', 'export const count: number = 42;');
    assert.equal(tsLines.length, 1);
    assert.ok(tsLines[0].some((s) => s.types.includes('keyword') && s.text === 'export'));
    assert.ok(tsLines[0].some((s) => s.types.includes('number') && s.text === '42'));

    const tomlLines = highlightCodeLinesWithPrism('toml', '[r2_buckets]\nbinding = "R2_BUCKET"');
    assert.equal(tomlLines.length, 2);
    assert.ok(tomlLines[0].some((s) => s.types.includes('table') && s.text.includes('r2_buckets')));
    assert.ok(tomlLines[1].some((s) => s.types.includes('string') && s.text === '"R2_BUCKET"'));

    const htmlLines = highlightCodeLinesWithPrism('html', '<div class="box">Hi</div>');
    assert.ok(htmlLines[0].some((s) => s.types.includes('tag')));
    assert.ok(getPrismTokenClass(['keyword'], false).includes('text-orange-600'));
  });

  it('tokenizes legacy helper lines and parses Markdown blocks safely', () => {
    const tsTokens = tokenizeLine('typescript', 'export const count = 42;');
    assert.ok(tsTokens.some((t) => t.kind === 'keyword' && t.text === 'export'));

    const mdBlocks = parseMarkdownBlocks('# Title\n\n- First\n- Second\n\n```ts\nconst x = 1;\n```');
    assert.equal(mdBlocks[0].type, 'h1');
    assert.equal(mdBlocks[1].type, 'list');
    assert.equal(mdBlocks[2].type, 'code');
  });
});
