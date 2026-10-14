import { createHash } from "node:crypto";

function hash(x) { return createHash("sha256").update(JSON.stringify(x ?? null)).digest("hex"); }

export class AutonomousRunner {
  constructor({ goals, runs, acceptance, planner, executor, observer, eventLog, maxRounds = 20, maxStalledRounds = 3, confirmationQueue = null, workflowAdvance = null, onStall = null } = {}) {
    Object.assign(this, { goals, runs, acceptance, planner, executor, observer, eventLog, maxRounds, maxStalledRounds, confirmationQueue, workflowAdvance, onStall });
    this._roundState = new Map();
  }

  /** 驱动流程直至目标达成或无法推进（预算耗尽/停滞/阻塞）。 */
  async runUntilTarget({ runId, context = {} } = {}) {
    for (let i = 0; i < this.maxRounds; i++) {
      const result = await this.tick({ runId, context });
      if (result?.stopped) return result.run;
      const run = this.runs.get(runId);
      if (run.status !== "runnable") return run;
    }
    return this.runs.setStatus(runId, "stalled", "max_rounds");
  }

  /** 单轮监督：预算检查 → 快照 → 验收 → 停滞检测（可交给 onStall，如经理组会议）→ 规划 → 执行 → checkpoint。 */
  async tick({ runId, context = {} } = {}) {
    const st = this._roundState.get(runId) || { lastHash: null, unchanged: 0, startedAt: Date.now() };
    const keep = () => this._roundState.set(runId, st);
    const finish = async (status, reason) => { this._roundState.delete(runId); return this.runs.setStatus(runId, status, reason); };

    if (context.maxRuntimeMs && Date.now() - st.startedAt >= context.maxRuntimeMs) return finish("stalled", "budget_time");
    if (context.maxProviderTokens && this.runs.get(runId).provider_tokens >= context.maxProviderTokens) return finish("stalled", "budget_tokens");

    const run = this.runs.get(runId);
    if (run.status !== "runnable") { this._roundState.delete(runId); return { stopped: true, run }; }

    const goal = this.goals.get(run.goalId);
    const snapshot = await this.observer({ run, goal, ...context });
    const checked = await this.acceptance.evaluate(goal.acceptance);
    if (checked.ok) {
      this.goals.updateStatus(goal.id, "completed", checked, "target_reached");
      return finish("completed", "target_reached");
    }
    if (checked.blocked) {
      this.goals.updateStatus(goal.id, "blocked", checked, "acceptance_blocked");
      return finish("blocked", "acceptance_blocked");
    }

    const stateHash = hash({ snapshot, checked });
    st.unchanged = stateHash === st.lastHash ? st.unchanged + 1 : 0;
    st.lastHash = stateHash;
    keep();

    if (st.unchanged >= this.maxStalledRounds || (goal.policy?.maxRounds || Infinity) <= run.round) {
      const reason = st.unchanged >= this.maxStalledRounds ? "no_state_change" : "budget_rounds";
      if (this.onStall) {
        const handled = await this.onStall({ runId, reason, run, goal, snapshot, checked });
        if (handled) {
          st.unchanged = 0; st.lastHash = null; keep();
          return { run: this.runs.get(runId), meetingHandled: true };
        }
      }
      return finish("stalled", reason);
    }

    const proposal = await this.planner({ run, goal, snapshot, checked });
    if (proposal?.blocked) {
      this.goals.updateStatus(goal.id, "blocked", proposal, "planner_blocked");
      return finish("blocked", "planner_blocked");
    }
    if (proposal?.requiresUserDecision?.length) {
      this.confirmationQueue?.request({ versionId: run.versionId, type: "workflow_decision", payload: proposal.requiresUserDecision, requestedBy: "autonomous-runner", reason: proposal.summary || "需要用户确认" });
      return this.runs.waitForUser(runId, "confirmation_pending");
    }
    if (!proposal?.actions?.length) {
      this.runs.checkpoint({ runId, round: run.round + 1, state: { checked, proposal }, snapshot, proposal });
      if (this.onStall) {
        const handled = await this.onStall({ runId, reason: "no_actions", run, goal, snapshot, checked, proposal });
        if (handled) {
          st.unchanged = 0; st.lastHash = null; keep();
          return { run: this.runs.get(runId), meetingHandled: true };
        }
      }
      return finish("stalled", "no_actions");
    }

    for (const action of proposal.actions) {
      const result = await this.executor.execute(action, { ...context, runId, round: run.round + 1 });
      if (result?.usage) this.runs.checkpoint({ runId, round: run.round + 1, state: { checked, proposal }, snapshot, proposal, usage: result.usage });
    }
    if (this.workflowAdvance) await this.workflowAdvance({ run, goal, snapshot, proposal, context });
    this.runs.checkpoint({ runId, round: run.round + 1, state: { checked, proposal }, snapshot, proposal });
    return { run: this.runs.get(runId), proposal };
  }
}

export function createProviderPlanner({ provider, agent, retry = {} }) {
  return async ({ goal, snapshot, run }) => {
    let raw; let last;
    for (let i = 0; i < (retry.maxAttempts || 3); i++) {
      try {
        raw = await provider.generate({
          system: agent?.prompt || "你是 Studio Planner。",
          user: JSON.stringify({ objective: goal.objective, acceptance: goal.acceptance, snapshot, run }),
          role: agent?.role || "planner",
          model: agent?.model,
        }, { detail: true });
        break;
      } catch (error) {
        last = error;
        if (i + 1 === (retry.maxAttempts || 3)) throw error;
        await new Promise(resolve => setTimeout(resolve, (retry.baseDelayMs || 50) * 2 ** i));
      }
    }
    if (raw === undefined && last) throw last;
    const text = raw?.text || raw?.content || raw;
    const clean = String(text).replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    const proposal = JSON.parse(clean);
    if (!Array.isArray(proposal.actions)) throw new Error("Planner proposal.actions 必须是数组");
    return proposal;
  };
}
