import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseModelOutput, applyActions, buildPrompt, truncate } from '../src/runner.js';
import { runCommand } from '../src/exec.js';
import { createMockProvider } from '../src/providers/mock.js';
import { createOpenAIProvider } from '../src/providers/openai.js';

test('parseModelOutput：纯 JSON、围栏 JSON、前置解释文本', () => {
  const a = parseModelOutput('{"summary":"s","actions":[],"done":true}');
  assert.equal(a.summary, 's');
  const b = parseModelOutput('```json\n{"summary":"s2","actions":[],"done":true}\n```');
  assert.equal(b.summary, 's2');
  const c = parseModelOutput('好的，这是我的结果：\n{"summary":"s3","text":"正文","actions":[],"done":true}\n以上。');
  assert.equal(c.summary, 's3');
  assert.equal(c.text, '正文');
});

test('parseModelOutput：非法输出抛错', () => {
  assert.throws(() => parseModelOutput('这不是 JSON'), /不包含合法 JSON/);
  assert.throws(() => parseModelOutput('{"actions":[{"type":"write","path":"a.js"}]}'), /write 动作需要/);
});

test('parseModelOutput：rawActions 保留自定义结构', () => {
  const { actions } = parseModelOutput(
    '{"summary":"d","actions":[{"taskId":"t-1","instruction":"fix"}],"done":true}',
    { rawActions: true },
  );
  assert.deepEqual(actions, [{ taskId: 't-1', instruction: 'fix' }]);
});

test('applyActions：write 落盘、exec 执行并记录退出码', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cowork-run-'));
  try {
    const { files, execResults } = applyActions(
      [
        { type: 'write', path: 'src/a.js', content: 'module.exports = 1;' },
        { type: 'exec', command: `"${process.execPath}" -e "process.exit(0)"`, expectedExit: 0 },
        { type: 'exec', command: `"${process.execPath}" -e "process.exit(3)"`, expectedExit: 0 },
      ],
      { workDir: dir, commandTimeoutMs: 30000, commandPolicy: { allow: ['node'] } },
    );
    assert.equal(files.length, 1, '只有 write 动作计入 files');
    assert.equal(readFileSync(join(dir, 'src', 'a.js'), 'utf8'), 'module.exports = 1;');
    assert.equal(execResults[0].ok, true);
    assert.equal(execResults[1].ok, false);
    assert.equal(execResults[1].exitCode, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('runCommand 超时被杀不误判成功', () => {
  const r = runCommand('"node" -e "setTimeout(()=>{}, 5000)"', { timeoutMs: 200, commandPolicy: { allow: ['node'] } });
  assert.equal(r.ok, false);
  assert.ok(r.timedOut);
});

test('buildPrompt 组装 system/user 并含输出协议', () => {
  const { system, user } = buildPrompt({
    agent: { prompt: '你是开发者。', role: 'developer' },
    task: { id: 't1', name: '实现', acceptance: ['a1'] },
    inputs: [{ id: 'arch-v1', state: 'approved', producer: 'arch', summary: '架构', text: '', files: [] }],
  });
  assert.equal(system, '你是开发者。');
  assert.ok(user.includes('任务：实现'));
  assert.ok(user.includes('a1'));
  assert.ok(user.includes('输出协议'));
});

test('truncate 超长截断', () => {
  const t = truncate('x'.repeat(100), 10);
  assert.ok(t.length < 100);
  assert.ok(t.includes('截断'));
});

test('mock provider：按角色分发，未配置返回 done=false', async () => {
  const p = createMockProvider({
    script: {
      developer: async (ctx) => ({ summary: `dev#${ctx.attempt}`, actions: [], done: true }),
    },
  });
  const ok = await p.generate({ role: 'developer', attempt: 2 });
  assert.match(ok, /dev#2/);
  const missing = await p.generate({ role: 'manager' });
  assert.match(JSON.parse(missing).knownIssues.join(''), /未配置脚本/);
  assert.equal(JSON.parse(missing).done, false);
});

test('openai provider：配置校验与请求构造（不实际发请求）', () => {
  const p = createOpenAIProvider({ baseURL: 'http://127.0.0.1:1/v1', apiKey: 'k', timeoutMs: 1 });
  assert.equal(p.name, 'openai');
  // 故意指向不可达地址并超时，验证错误被抛为 Error 而非卡死
  return p.generate({ system: 's', user: 'u', model: 'm' }).then(
    () => assert.fail('应当抛错'),
    (err) => assert.ok(err instanceof Error),
  );
});