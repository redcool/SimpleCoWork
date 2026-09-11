// 项目持久化：JSONL 事件日志 + JSON 快照；persist=false 时纯内存（测试用）
// 安全：saveState 用原子写（tmp+rename），避免崩溃/并发读写半截 state.json
import { mkdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWrite } from './security.js';

export class ProjectStore {
  constructor({ dir = null, persist = true } = {}) {
    this.persist = persist;
    this.dir = dir;
    this.events = [];
    this.state = null;
    this._file = this.persist ? join(dir, 'events.jsonl') : null;
    this._stateFile = this.persist ? join(dir, 'state.json') : null;
    if (this.persist) mkdirSync(this.dir, { recursive: true });
  }

  appendEvent(type, payload) {
    const ev = { ts: new Date().toISOString(), type, payload };
    this.events.push(ev);
    if (this.persist) {
      appendFileSync(this._file, JSON.stringify(ev) + '\n', 'utf8');
    }
    return ev;
  }

  saveState(state) {
    this.state = state;
    if (this.persist) {
      mkdirSync(this.dir, { recursive: true });
      atomicWrite(this._stateFile, JSON.stringify(state, null, 2));
    }
  }

  loadState() {
    if (!this.persist) return this.state;
    if (!existsSync(this._stateFile)) return null;
    try {
      this.state = JSON.parse(readFileSync(this._stateFile, 'utf8'));
    } catch {
      this.state = null;
    }
    return this.state;
  }

  get eventCount() {
    return this.events.length;
  }
}