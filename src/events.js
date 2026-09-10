// 事件总线：全局解耦 + 可持久化（每条事件通过 onAny 追加进事件日志）
export class EventBus {
  constructor() {
    this._map = new Map(); // type -> Set<fn>
    this._any = new Set();
  }

  on(type, fn) {
    if (!this._map.has(type)) this._map.set(type, new Set());
    this._map.get(type).add(fn);
    return () => this.off(type, fn);
  }

  onAny(fn) {
    this._any.add(fn);
    return () => this._any.delete(fn);
  }

  off(type, fn) {
    this._map.get(type)?.delete(fn);
  }

  emit(type, payload) {
    const listeners = this._map.get(type);
    if (listeners) {
      for (const fn of [...listeners]) {
        try {
          fn(payload, type);
        } catch (err) {
          console.error(`[cowork] listener error on "${type}":`, err);
        }
      }
    }
    for (const fn of [...this._any]) {
      try {
        fn(type, payload);
      } catch (err) {
        console.error(`[cowork] onAny listener error on "${type}":`, err);
      }
    }
  }

  /** 清空所有监听（测试隔离用） */
  clear() {
    this._map.clear();
    this._any.clear();
  }
}