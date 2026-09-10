// 产物库：版本化（name-vN）、状态机 submitted → approved | rejected | superseded
// files: [{path, content, checksum, size}]；content 内存持有，磁盘落在工作区（可选）
import { checksum as sha256 } from '../oracle.js';

export class ArtifactStore {
  constructor(bus) {
    this.bus = bus;
    this.byId = new Map();
    this.byName = new Map(); // name -> Artifact[]
  }

  fromSnapshot(list) {
    this.byId = new Map();
    this.byName = new Map();
    for (const a of list ?? []) {
      const item = { ...a, files: (a.files ?? []).map((f) => ({ ...f })), meta: { ...(a.meta ?? {}) } };
      this.byId.set(item.id, item);
      const arr = this.byName.get(item.name) ?? [];
      arr.push(item);
      this.byName.set(item.name, arr);
    }
  }

  submit({ name, producer, taskId, baseArtifacts = [], summary = '', text = '', files = [], meta = {} }) {
    if (typeof name !== 'string' || !name) throw new Error('产物名不能为空');
    const versions = this.byName.get(name) ?? [];
    const version = versions.reduce((m, a) => Math.max(m, a.version), 0) + 1;
    const id = `${name}-v${version}`;
    const now = new Date().toISOString();
    const artifact = {
      id,
      name,
      version,
      producer,
      taskId,
      state: 'submitted',
      baseArtifacts: [...baseArtifacts],
      summary: String(summary ?? ''),
      text: String(text ?? ''),
      files: (files ?? []).map((f) => ({
        path: f.path,
        content: String(f.content ?? ''),
        checksum: f.checksum ?? sha256(f.content),
        size: Buffer.byteLength(String(f.content ?? ''), 'utf8'),
      })),
      meta: { ...meta },
      createdAt: now,
      updatedAt: now,
    };
    // supersede 旧版本
    for (const prev of versions) {
      if (prev.state === 'submitted' || prev.state === 'approved') {
        prev.state = 'superseded';
        prev.updatedAt = now;
      }
    }
    versions.push(artifact);
    this.byName.set(name, versions);
    this.byId.set(id, artifact);
    this.bus.emit('artifact.submitted', { id, name, version, producer, taskId });
    return artifact;
  }

  get(id) {
    const a = this.byId.get(id);
    if (!a) throw new Error(`未知产物: ${id}`);
    return a;
  }

  has(id) {
    return this.byId.has(id);
  }

  latest(name) {
    const versions = this.byName.get(name);
    if (!versions || versions.length === 0) return null;
    let best = versions[0];
    for (const a of versions) {
      if (
        a.version > best.version &&
        (a.state === 'approved' || a.state === 'submitted')
      ) {
        best = a;
      }
    }
    return best.state === 'approved' || best.state === 'submitted' ? best : versions[versions.length - 1];
  }

  latestApproved(name) {
    const versions = this.byName.get(name);
    if (!versions) return null;
    for (let i = versions.length - 1; i >= 0; i--) {
      if (versions[i].state === 'approved') return versions[i];
    }
    return null;
  }

  versionsOf(name) {
    return this.byName.get(name) ?? [];
  }

  list() {
    return [...this.byId.values()].map((a) => ({ ...a, files: [...a.files] }));
  }

  transition(id, to, meta = {}) {
    const a = this.byId.get(id);
    if (!a) throw new Error(`未知产物: ${id}`);
    if (a.state === to) return a;
    a.state = to;
    a.updatedAt = new Date().toISOString();
    Object.assign(a.meta, meta);
    this.bus.emit(`artifact.${to}`, { id: a.id, name: a.name, version: a.version });
    return a;
  }

  snapshot() {
    return this.list();
  }
}