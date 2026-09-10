// 审核记录：内置校验 + 审核者结论 + 证据（任务级，也可跨任务引用）
export class ReviewStore {
  constructor(bus) {
    this.bus = bus;
    this.reviews = [];
  }

  fromSnapshot(list) {
    this.reviews = (list ?? []).map((r) => ({ ...r }));
  }

  add({ taskId, reviewerId = null, builtinChecks = [], verdict = 'pass', issues = [], comments = '', evidence = {} }) {
    const record = {
      id: `r-${this.reviews.length + 1}`,
      taskId,
      reviewerId,
      builtinChecks: (builtinChecks ?? []).map((c) => ({ ...c })),
      verdict,
      issues: [...issues],
      comments: String(comments ?? ''),
      evidence: { ...(evidence ?? {}) },
      createdAt: new Date().toISOString(),
    };
    this.reviews.push(record);
    this.bus.emit('review.recorded', { id: record.id, taskId, verdict });
    return record;
  }

  list() {
    return this.reviews.map((r) => ({ ...r }));
  }

  latestFor(taskId) {
    for (let i = this.reviews.length - 1; i >= 0; i--) {
      if (this.reviews[i].taskId === taskId) return this.reviews[i];
    }
    return null;
  }

  snapshot() {
    return this.list();
  }
}