// 安全回归：路径越界 / 符号链接绕过 / 命令白名单 / 面板鉴权与 CSRF / day 穿越 / body 限制 / 原子写 / 资源限制
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync, symlinkSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { safeJoin, assertNoSymlink, atomicWrite, DAY_RE, isAllowedCommand, firstTokenOf, commandKeyOf } from '../src/security.js';
import { applyActions } from '../src/runner.js';
import { runCommand } from '../src/exec.js';
import { writeApprovedArtifacts } from '../src/deliver.js';
import { startPanelServer } from '../src/index.js';

test('safeJoin：拒绝 ../ 逃逸与绝对路径，允许目录内路径', () => {
  const base = resolve('C:/proj');
  assert.equal(safeJoin(base, 'a/b.txt'), join(base, 'a', 'b.txt'));
  assert.throws(() => safeJoin(base, '../evil.txt'), /越界|非法/);
  assert.throws(() => safeJoin(base, 'a/../../evil.txt'), /越界|非法/);
  assert.throws(() => safeJoin(base, '../../../etc/passwd'), /越界|非法/);
  // 指向 base 本身（目录）也拒绝
  assert.throws(() => safeJoin(base, '.'), /越界|非法/);
});

test('命令白名单：basename 匹配（支持引号路径/.exe 后缀），未命中拒绝', () => {
  assert.equal(isAllowedCommand('node --check x.js', { allow: ['node'] }), true);
  assert.equal(isAllowedCommand('"C:\\Program Files\\nodejs\\node.exe" --version', { allow: ['node'] }), true);
  assert.equal(isAllowedCommand('npm test', { allow: ['node', 'npm'] }), true);
  assert.equal(isAllowedCommand('rm -rf /', { allow: ['node', 'npm'] }), false);
  assert.equal(isAllowedCommand('', { allow: ['node'] }), false);
  assert.equal(isAllowedCommand('node x', { allowAll: true }), true);
  assert.equal(firstTokenOf('"C:\\Program Files\\nodejs\\node.exe" --version'), 'C:\\Program Files\\nodejs\\node.exe');
  assert.equal(commandKeyOf('C:/path/node.exe'), 'node');
});

test('runCommand：白名单外命令拒绝（denied），不执行', () => {
  const r = runCommand('del /f /q C:\\Windows\\System32', { commandPolicy: { allow: ['node'] }, timeoutMs: 1000 });
  assert.equal(r.denied, true);
  assert.equal(r.ok, false);
});

test('applyActions：write 路径越界/绝对路径拒绝', () => {
  for (const bad of ['../evil.txt', 'a/../../evil.txt', 'C:\\evil.txt', '/etc/passwd']) {
    assert.throws(() => applyActions([{ type: 'write', path: bad, content: 'x' }], {}), /越界|非法/, `应拒绝 ${bad}`);
  }
});

test('applyActions：资源限制（write 内容上限 / actions 上限 / exec 上限）', () => {
  assert.throws(
    () => applyActions([{ type: 'write', path: 'a.txt', content: 'x'.repeat(600) }], { limits: { maxWriteBytes: 100 } }),
    /write 内容超限/);
  const many = Array.from({ length: 5 }, (_, i) => ({ type: 'write', path: `f${i}.txt`, content: 'x' }));
  assert.throws(() => applyActions(many, { limits: { maxActions: 3 } }), /动作数量超限/);
  const execs = Array.from({ length: 3 }, () => ({ type: 'exec', command: 'node -e "1"', expectedExit: 0 }));
  assert.throws(() => applyActions(execs, { limits: { maxExec: 2 } }), /exec 动作数量超限/);
});

test('applyActions：落盘路径防符号链接（可创建链接时验证；否则跳过）', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-sec-'));
  const external = join(dir, 'external-secret.txt');
  writeFileSync(external, 'secret');
  const link = join(dir, 'link.txt');
  try {
    symlinkSync(external, link);
  } catch {
    t.skip('当前环境无法创建符号链接（Windows 需开发者模式）');
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  try {
    assert.throws(() => applyActions([{ type: 'write', path: 'link.txt', content: 'evil' }], { workDir: dir }), /符号链接/);
    // 目录组件为链接也拒绝
    mkdirSync(join(dir, 'real'));
    writeFileSync(join(dir, 'real', 't.txt'), 'ok');
    const dirLink = join(dir, 'dirlink');
    try {
      symlinkSync(join(dir, 'real'), dirLink, 'junction');
    } catch {
      /* junction 不可用时跳过子断言 */
      return;
    }
    assert.throws(() => applyActions([{ type: 'write', path: 'dirlink/evil.txt', content: 'x' }], { workDir: dir }), /符号链接/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeApprovedArtifacts：正常写盘 + 越界拒绝 + 符号链接拒绝', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-deliver-'));
  try {
    const out = writeApprovedArtifacts(dir, [{ id: 'a-v1', files: [{ path: 'src/a.js', content: 'x = 1;' }] }]);
    assert.equal(out.count, 1);
    assert.equal(readFileSync(join(dir, 'src', 'a.js'), 'utf8'), 'x = 1;');
    assert.throws(
      () => writeApprovedArtifacts(dir, [{ id: 'b-v1', files: [{ path: '../evil', content: 'x' }] }]),
      /越界|非法/);
    // 符号链接
    const external = join(dir, 'secret.txt');
    writeFileSync(external, 's');
    try {
      symlinkSync(external, join(dir, 'link.txt'));
    } catch {
      t.skip('当前环境无法创建符号链接');
      return;
    }
    assert.throws(
      () => writeApprovedArtifacts(dir, [{ id: 'c-v1', files: [{ path: 'link.txt', content: 'evil' }] }]),
      /符号链接/);
    assert.equal(readFileSync(external, 'utf8'), 's', '外部文件不应被写入');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomicWrite：内容完整且无 .tmp 残留', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-atomic-'));
  try {
    const f = join(dir, 'state.json');
    atomicWrite(f, JSON.stringify({ a: 1, b: [1, 2, 3] }));
    atomicWrite(f, JSON.stringify({ c: '中文内容' }));
    assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { c: '中文内容' });
    const leftovers = readdirSync(dir).filter((x) => x.includes('.tmp-'));
    assert.deepEqual(leftovers, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('面板鉴权：无/错 token 401，跨站 Origin 401，body 超限 413，day 穿越 400', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-panelsec-'));
  mkdirSync(join(dir, '.cowork'), { recursive: true });
  writeFileSync(join(dir, '.cowork', 'state.json'), JSON.stringify({ tasks: [], artifacts: [], meetings: [], reviews: [] }));
  mkdirSync(join(dir, 'night-shift'), { recursive: true });
  writeFileSync(join(dir, 'night-shift', '2026-01-01.md'), '# 夜班\n');
  try {
    const { server, url, token } = await startPanelServer({ projectDir: dir, port: 0 });
    const base = url.split('?')[0].replace(/\/$/, ''); // 去掉 ?token= 前缀与尾斜杠，API 请求单独带认证
    const AUTH = { 'x-cowork-token': token };
    try {
      // 页面无需 token
      assert.equal((await fetch(base + '/')).status, 200);
      // API 需要 token
      assert.equal((await fetch(base + '/api/state')).status, 401);
      assert.equal((await fetch(base + '/api/state', { headers: { 'x-cowork-token': 'bad' } })).status, 401);
      assert.equal((await fetch(base + '/api/state', { headers: AUTH })).status, 200);
      // 带 token 的查询参数也可用（curl 场景）
      assert.equal((await fetch(base + '/api/state?token=' + token)).status, 200);
      // 跨站 Origin → 拒绝
      assert.equal((await fetch(base + '/api/state', { headers: { ...AUTH, origin: 'https://evil.example' } })).status, 401);
      // 同源 Origin → 放行
      const sameOrigin = new URL(base).origin;
      assert.equal((await fetch(base + '/api/state', { headers: { ...AUTH, origin: sameOrigin } })).status, 200);
      // day 穿越与非法格式
      assert.equal((await fetch(base + '/api/night?day=' + encodeURIComponent('2026-01-01'), { headers: AUTH })).status, 200);
      assert.equal((await fetch(base + '/api/night?day=' + encodeURIComponent('../x'), { headers: AUTH })).status, 400);
      assert.equal((await fetch(base + '/api/night?day=2026-13-99', { headers: AUTH })).status, 400);
      // body 超限 → 413（认证通过后读取体时拦截）
      const big = 'x'.repeat(1.5 * 1024 * 1024);
      const resp = await fetch(base + '/api/decisions', {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ meetingId: 'm', decision: 'd', padding: big }),
      });
      assert.equal(resp.status, 413);
    } finally {
      server.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('DAY_RE：只放行 YYYY-MM-DD', () => {
  assert.equal(DAY_RE.test('2026-09-11'), true);
  assert.equal(DAY_RE.test('../x'), false);
  assert.equal(DAY_RE.test('2026/09/11'), false);
  assert.equal(DAY_RE.test('2026-9-1'), false);
});