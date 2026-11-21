import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LOCALE,
  formatTemplate,
  getActiveLocale,
  getTranslation,
  setActiveLocale,
  TRANSLATIONS,
} from '../src/shared/i18n';
import { parseApiError } from '../src/shared/errorHandler';
import { validateSyntaxHint } from '../src/shared/codeEditorUtils';

function collectLeafKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      keys.push(...collectLeafKeys(v as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

test('default locale is pt-BR and getActiveLocale defaults to pt-BR', () => {
  setActiveLocale('pt-BR');
  assert.equal(DEFAULT_LOCALE, 'pt-BR');
  assert.equal(getActiveLocale(), 'pt-BR');
  assert.equal(getTranslation().nav.buckets, 'Sistema de Arquivos');
  assert.equal(getTranslation().nav.telemetry, 'Observabilidade');
  assert.equal(getTranslation().nav.wrangler, 'Infraestrutura');
  assert.equal(getTranslation().nav.monorepo, 'Repositório');
  assert.equal(getTranslation('en-US').nav.buckets, 'File System');
  assert.equal(getTranslation('en-US').nav.telemetry, 'Observability');
  assert.equal(getTranslation('en-US').nav.wrangler, 'Infrastructure');
  assert.equal(getTranslation('en-US').nav.monorepo, 'Repository');
});

test('pt-BR and en-US translation catalogs have strict leaf key parity', () => {
  const ptKeys = collectLeafKeys(TRANSLATIONS['pt-BR'] as unknown as Record<string, unknown>);
  const enKeys = collectLeafKeys(TRANSLATIONS['en-US'] as unknown as Record<string, unknown>);
  assert.deepEqual(ptKeys, enKeys);
  assert.ok(ptKeys.length > 100);
  assert.equal(TRANSLATIONS['pt-BR'].drawer.cloudflareReal, 'Cloudflare Server');
  assert.equal(TRANSLATIONS['en-US'].drawer.cloudflareReal, 'Cloudflare Server');
  assert.equal(TRANSLATIONS['pt-BR'].shell.cloudflareR2, 'Cloudflare Server');
  assert.equal(TRANSLATIONS['en-US'].shell.cloudflareR2, 'Cloudflare Server');
});

test('setActiveLocale switches translations across parseApiError and validateSyntaxHint', () => {
  try {
    setActiveLocale('en-US');
    assert.equal(getActiveLocale(), 'en-US');
    const parsedEn = parseApiError(
      { errorCode: 'BUCKET_NOT_EMPTY', status: 409, detail: 'Bucket is not empty', title: 'Conflict' },
      'en-US',
    );
    assert.match(parsedEn.userMessage, /not empty/i);

    const jsonWarnEn = validateSyntaxHint('json', '{bad json}', 'en-US');
    assert.match(jsonWarnEn ?? '', /^Invalid JSON:/);

    const tomlWarnEn = validateSyntaxHint('toml', '[broken', 'en-US');
    assert.match(tomlWarnEn ?? '', /^TOML Warning \(line 1\):/);

    setActiveLocale('pt-BR');
    assert.equal(getActiveLocale(), 'pt-BR');
    const parsedPt = parseApiError(
      { errorCode: 'BUCKET_NOT_EMPTY', status: 409, detail: 'Bucket is not empty', title: 'Conflict' },
      'pt-BR',
    );
    assert.match(parsedPt.userMessage, /vazio/i);

    const tomlWarnPt = validateSyntaxHint('toml', '[broken', 'pt-BR');
    assert.match(tomlWarnPt ?? '', /^Aviso TOML \(linha 1\):/);
  } finally {
    setActiveLocale('pt-BR');
  }
});

test('formatTemplate interpolates named placeholders cleanly', () => {
  const ptResult = formatTemplate(TRANSLATIONS['pt-BR'].search.summary, {
    matches: 4,
    buckets: 2,
    elapsed: 12,
  });
  const enResult = formatTemplate(TRANSLATIONS['en-US'].search.summary, {
    matches: 4,
    buckets: 2,
    elapsed: 12,
  });

  assert.equal(ptResult, '4 resultado(s) em 2 bucket(s) · 12 ms');
  assert.equal(enResult, '4 match(es) across 2 bucket(s) · 12 ms');
});
