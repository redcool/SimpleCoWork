import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/events.js';
import { TaskStore, TASK_ALLOWED } from '../src/domain/tasks.js';

function makeStore() {
  return new TaskStore(new EventBus());
}

test('任务状态机：合法链路', () => {
  const s = makeStore();
  const t = s.create({ id: 't1', name: 'n', agentId: 'a', outputs: ['o'] });
  assert.equal(t.state, 'pending');
  s.transition('t1', 'ready');
  s.transition('t1', 'running');
  s.transition('t1', 'submitted');
  s.transition('t1', 'needs_revision');
  s.transition('t1', 'ready');
  s.transition('t1', 'running');
  s.transition('t1', 'submitted');
  s.transition('t1', 'waiting'); // 等待会议决策
  s.transition('t1', 'needs_revision');
  s.transition('t1', 'ready');
  s.transition('t1', 'running');
  s.transition('t1', 'submitted');
  s.transition('t1', 'approved');
  assert.equal(s.get('t1').state, 'approved');
});

test('非法状态迁移抛错', () => {
  const s = makeStore();
  s.create({ id: 't1', name: 'n', agentId: 'a', outputs: ['o'] });
  assert.throws(() => s.transition('t1', 'approved'), /非法状态迁移/);
  s.transition('t1', 'ready');
  assert.throws(() => s.transition('t1', 'needs_revision'), /非法状态迁移/);
});

test('ALLOWED 表覆盖所有非终态', () => {
  const states = ['pending', 'ready', 'running', 'submitted', 'needs_revision', 'waiting', 'failed'];
  for (const st of states) {
    assert.ok(Array.isArray(TASK_ALLOWED[st]), `${st} 缺少转移表`);
    assert.ok(TASK_ALLOWED[st].length > 0, `${st} 为空转移表`);
  }
});

test('depsDone 判断依赖完成', () => {
  const s = makeStore();
  s.create({ id: 'a', name: 'a', agentId: 'a1', outputs: ['x'] });
  const b = s.create({ id: 'b', name: 'b', agentId: 'a1', requires: ['a'], outputs: ['y'] });
  assert.equal(s.depsDone('b'), false);
  s.transition('a', 'ready');
  s.transition('a', 'running');
  s.transition('a', 'submitted');
  s.transition('a', 'approved');
  assert.equal(s.depsDone('b'), true);
});

test('版本号随迁移递增（供引擎进度检测）', () => {
  const s = makeStore();
  s.create({ id: 't1', name: 'n', agentId: 'a', outputs: ['o'] });
  const v0 = s.version;
  s.transition('t1', 'ready');
  assert.equal(s.version, v0 + 1);
});

test('重复创建任务抛错', () => {
  const s = makeStore();
  s.create({ id: 't1', name: 'n', agentId: 'a', outputs: ['o'] });
  assert.throws(() => s.create({ id: 't1', name: 'n2', agentId: 'a', outputs: ['o'] }), /重复/);
});

test('fromSnapshot 恢复', () => {
  const s = makeStore();
  s.create({ id: 't1', name: 'n', agentId: 'a', outputs: ['o'] });
  s.transition('t1', 'ready');
  s.transition('t1', 'running');
  s.transition('t1', 'submitted');
  s.transition('t1', 'approved');
  const snap = s.snapshot();
  const s2 = makeStore();
  s2.fromSnapshot(snap);
  assert.equal(s2.get('t1').state, 'approved');
  assert.equal(s2.get('t1').attempts, 0);
});