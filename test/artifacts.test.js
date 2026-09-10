import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/events.js';
import { ArtifactStore } from '../src/domain/artifacts.js';

function mk() {
  return new ArtifactStore(new EventBus());
}

const base = {
  producer: 'dev',
  taskId: 't1',
  files: [{ path: 'src/a.js', content: 'module.exports = 1;' }],
};

test('产物版本化与 sbumitted 状态', () => {
  const s = mk();
  const a1 = s.submit({ name: 'code', ...base });
  const a2 = s.submit({ name: 'code', ...base });
  assert.equal(a1.id, 'code-v1');
  assert.equal(a2.id, 'code-v2');
  assert.equal(a1.state, 'superseded'); // 新提交使旧版作废
  assert.equal(a2.state, 'submitted');
});

test('latest 与 latestApproved', () => {
  const s = mk();
  const a1 = s.submit({ name: 'code', ...base });
  s.submit({ name: 'code', ...base });
  assert.equal(s.latest('code').id, 'code-v2');
  s.transition('code-v1', 'rejected');
  s.transition('code-v2', 'approved');
  assert.equal(s.latestApproved('code').id, 'code-v2');
  const first = s.versionsOf('code');
  assert.equal(first.length, 2);
  assert.equal(s.get('code-v1').state, 'rejected');
});

test('文件校验和与大小自动计算', () => {
  const s = mk();
  const a = s.submit({ name: 'code', ...base, files: [{ path: 'x.js', content: 'abc' }] });
  assert.equal(a.files[0].checksum.length, 64); // sha256 hex
  assert.equal(a.files[0].size, 3);
});

test('未知产物 get/has 行为', () => {
  const s = mk();
  assert.equal(s.has('nope'), false);
  assert.throws(() => s.get('nope'), /未知产物/);
});

test('transition 发出事件并更新 meta', () => {
  const events = [];
  const bus = new EventBus();
  bus.onAny((type) => events.push(type));
  const s = new ArtifactStore(bus);
  const a = s.submit({ name: 'code', ...base });
  s.transition(a.id, 'approved', { note: 'ok' });
  assert.ok(events.includes('artifact.approved'));
  assert.equal(s.get('code-v1').meta.note, 'ok');
});

test('fromSnapshot 恢复历史产物', () => {
  const s = mk();
  s.submit({ name: 'code', ...base });
  s.submit({ name: 'code', ...base });
  s.transition('code-v2', 'approved');
  const snap = s.snapshot();
  const s2 = mk();
  s2.fromSnapshot(snap);
  assert.equal(s2.versionsOf('code').length, 2);
  assert.equal(s2.latestApproved('code').id, 'code-v2');
});