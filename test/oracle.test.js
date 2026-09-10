import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRule, evaluateRules, verdictFor, isJsValid, checksum } from '../src/oracle.js';

const files = [
  { path: 'src/api.js', content: 'module.exports = { run: () => console.log("TODO ok") };' },
  { path: 'src/db.js', content: 'module.exports = {};' },
];
const fileMap = new Map(files.map((f) => [f.path, f]));

test('contains / not_contains', () => {
  assert.equal(evaluateRule({ id: 'a', type: 'contains', file: 'src/api.js', text: 'module.exports' }, fileMap).passed, true);
  assert.equal(evaluateRule({ id: 'b', type: 'contains', file: 'src/api.js', text: 'NOPE' }, fileMap).passed, false);
  assert.equal(evaluateRule({ id: 'c', type: 'not_contains', file: 'src/api.js', text: 'NOPE' }, fileMap).passed, true);
  assert.equal(evaluateRule({ id: 'd', type: 'not_contains', file: 'src/api.js', text: 'TODO' }, fileMap).passed, false);
});

test('file_exists / file_not_exists', () => {
  assert.equal(evaluateRule({ id: 'a', type: 'file_exists', file: 'src/db.js' }, fileMap).passed, true);
  assert.equal(evaluateRule({ id: 'b', type: 'file_exists', file: 'missing.js' }, fileMap).passed, false);
  assert.equal(evaluateRule({ id: 'c', type: 'file_not_exists', file: 'missing.js' }, fileMap).passed, true);
});

test('regex 与 js_syntax', () => {
  assert.equal(evaluateRule({ id: 'a', type: 'regex', file: 'src/api.js', pattern: 'module\\.exports' }, fileMap).passed, true);
  assert.equal(evaluateRule({ id: 'b', type: 'regex', file: 'src/api.js', pattern: '^const x' }, fileMap).passed, false);
  assert.equal(evaluateRule({ id: 'c', type: 'js_syntax', file: 'src/api.js' }, fileMap).passed, true);
  fileMap.set('bad.js', { path: 'bad.js', content: 'function ( {' });
  assert.equal(evaluateRule({ id: 'd', type: 'js_syntax', file: 'bad.js' }, fileMap).passed, false);
});

test('ifPresent：产物不含文件则跳过（applicable=false 且通过）', () => {
  const r = evaluateRule({ id: 'a', type: 'contains', file: 'src/none.js', text: 'x', ifPresent: true }, fileMap);
  assert.equal(r.applicable, false);
  assert.equal(r.passed, true);
  // 未声明 ifPresent 则照常判失败
  const r2 = evaluateRule({ id: 'b', type: 'contains', file: 'src/none.js', text: 'x' }, fileMap);
  assert.equal(r2.applicable, true);
  assert.equal(r2.passed, false);
});

test('verdictFor 按严重性分层', () => {
  assert.equal(verdictFor([{ severity: 'high', passed: false, applicable: true }]).verdict, 'fail');
  assert.equal(verdictFor([{ severity: 'high', passed: true, applicable: true }, { severity: 'medium', passed: false, applicable: true }]).verdict, 'warn');
  assert.equal(verdictFor([{ severity: 'medium', passed: true, applicable: true }]).verdict, 'pass');
  // 跳过项不参与结论
  assert.equal(verdictFor([{ severity: 'high', passed: true, applicable: false }]).verdict, 'pass');
});

test('evaluateRules 批量 + 未知类型', () => {
  const out = evaluateRules([{ id: 'x', type: 'wat', file: 'src/api.js' }], files);
  assert.equal(out[0].passed, false);
  assert.match(out[0].detail, /未知规则类型/);
});

test('isJsValid 与 checksum', () => {
  assert.equal(isJsValid('const a = 1;'), true);
  assert.equal(isJsValid('const a = ;'), false);
  const h = checksum('abc');
  assert.equal(h.length, 64);
  assert.equal(checksum('abc'), checksum('abc'));
});