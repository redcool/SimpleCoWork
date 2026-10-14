import { buildStudioSnapshot } from "./snapshot.js";
import { StudioControlLoop } from "./control-loop.js";

/** 经理运行时：观察全项目快照 → 规划提案 → 校验执行。meetings 纳入快照供监督决策参考。 */
export class StudioManagerRuntime {
  constructor({ versions, stages, tasks, bugs = null, reviews = null, meetings = null, confirmations = null, planner, executor, eventLog, actor, versionId, maxParallel = 4 }) {
    this.versionId = versionId;
    this.stores = { versions, stages, tasks, bugs, reviews, meetings };
    this.loop = new StudioControlLoop({
      actor, confirmationQueue: confirmations, planner, executor, eventLog, maxParallel,
      observer: async () => buildStudioSnapshot({ versionId, ...this.stores, pendingApprovals: confirmations?.list() || [] }),
    });
  }

  async round(context = {}) { return this.loop.round({ ...context, versionId: this.versionId }); }

  snapshot() { return buildStudioSnapshot({ versionId: this.versionId, ...this.stores, pendingApprovals: [] }); }
}
