import { createProviderPlanner } from "./autonomous-runner.js";
import { runManagerMeeting } from "./meetings.js";
import { validateControlProposal } from "./control.js";

/** 经理组监督者系统提示（职责文本取自 studio cowork.md §4.1） */
export const SUPERVISOR_PROMPT = [
  "你是 Studio CoWork 的经理组监督者，负责监督工作流的持续执行，直到目标达到完成。",
  "职责：接收需求和 Bug；确定版本范围、优先级、里程碑、人员、工期和风险；调度专业组；监控阻塞；组织跨组会议；参与最终版本验收。",
  "你不代替专业审核者判断技术、策划和艺术细节。",
  "始终只输出 JSON 提案：{\"summary\":\"\",\"observations\":[],\"actions\":[{\"type\":\"...\"}],\"blocked\":false,\"requiresUserDecision\":[]}。",
  "流程停滞（无状态变化）、无动作可执行或审查反复失败时，优先提出 convene_meeting 动作组织经理组会议，而不是直接放弃。",
].join("\n");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 把 LLM 决策槽位绑定到经理组监督提示（planner 保留为计划起草者，不再兼任监督决策）。 */
export function createSupervisorPlanner({ provider, agent, retry = {} } = {}) {
  const merged = { ...(agent || {}) };
  merged.prompt = SUPERVISOR_PROMPT + (agent?.prompt ? `\n\n角色补充：${agent.prompt}` : "");
  merged.role = agent?.role || "manager";
  return createProviderPlanner({ provider, agent: merged, retry });
}

/** 定时监督循环：每隔 intervalMs 检查一轮工作流；发现问题触发 onStall（经理组会议），没有问题就歇一个间隔再继续。 */
export class StudioSupervisorLoop {
  constructor({ runner, runs, intervalMs = 10000, maxRounds = Infinity, maxRuntimeMs = 0, sleepFn = sleep, eventLog = null } = {}) {
    if (!runner || !runs) throw new Error("SupervisorLoop 需要 runner 和 runs");
    Object.assign(this, { runner, runs, intervalMs, maxRounds, maxRuntimeMs, sleepFn, eventLog });
  }

  /** 启动监督，返回 { promise, stop() }；stop() 在下一轮间隔生效。 */
  start({ runId, context = {} } = {}) {
    if (!runId) throw new Error("SupervisorLoop.start 需要 runId");
    const controller = { stopped: false };
    const promise = this.#loop(runId, context, controller);
    return { promise, stop: () => { controller.stopped = true; } };
  }

  async #loop(runId, context, controller) {
    const startedAt = Date.now();
    let rounds = 0;
    let run = this.runs.get(runId);
    while (!controller.stopped) {
      if (rounds >= this.maxRounds) break;
      if (this.maxRuntimeMs && Date.now() - startedAt >= this.maxRuntimeMs) break;
      rounds += 1;
      run = this.runs.get(runId);
      if (["completed", "failed", "cancelled", "blocked", "stalled"].includes(run.status)) break;
      if (run.status === "paused" || run.status === "waiting_for_user") {
        await this.sleepFn(this.intervalMs);
        continue;
      }
      await this.runner.tick({ runId, context });
      await this.sleepFn(this.intervalMs);
    }
    this.eventLog?.append("studio.supervisor.stopped", { runId, rounds, status: run?.status });
    return this.runs.get(runId);
  }
}

/** 构造 onStall 钩子：停滞/超限时召开经理组会议；会议有决定则执行其动作，无决定则升级用户确认。 */
export function createMeetingOnStall({ meetings, runs = null, provider = null, agents = {}, executor = null, confirmationQueue = null, eventLog = null, versionId, maxMeetings = 3, subject = "经理组监督会议" } = {}) {
  if (!meetings || !versionId) throw new Error("createMeetingOnStall 需要 meetings 和 versionId");
  return async ({ runId, reason, run, goal, snapshot } = {}) => {
    const held = meetings.list({ versionId, runId, limit: 100 }).length;
    if (held >= maxMeetings) {
      confirmationQueue?.request({ versionId, type: "meeting_decision", payload: { reason, heldMeetings: held }, requestedBy: "supervisor", reason: "会议次数已达上限，需要用户处理" });
      runs?.waitForUser(runId, "meeting_limit_reached");
      eventLog?.append("studio.supervisor.meeting.limit", { runId, reason });
      return true;
    }
    const meeting = meetings.convene({
      versionId,
      runId,
      subject: `${subject}：${reason || "流程停滞"}`,
      reason: `目标：${goal?.objective || ""}\n快照：${JSON.stringify(snapshot ?? {}).slice(0, 1500)}`,
      trigger: reason || "stall",
      participants: Object.values(agents || {}).filter(a => ["manager", "reviewer", "qa", "producer"].includes(a.role)).slice(0, 5).map(a => ({ id: a.id, role: a.role })),
    });
    const result = await runManagerMeeting({ store: meetings, meeting, provider, agents, eventLog });
    if (result.escalated || !result.decision) {
      confirmationQueue?.request({ versionId, type: "meeting_decision", payload: { meetingId: meeting.id, reason }, requestedBy: "supervisor", reason: "经理组会议未能形成决定，需要用户处理" });
      runs?.waitForUser(runId, "meeting_escalated");
      return true;
    }
    const actions = Array.isArray(result.decision.actions) ? result.decision.actions : [];
    const validation = validateControlProposal({ summary: result.decision.summary || "会议决定", actions }, { versionId });
    if (!validation.ok) {
      confirmationQueue?.request({ versionId, type: "meeting_decision", payload: { meetingId: meeting.id, errors: validation.errors }, requestedBy: "supervisor", reason: "会议决定未通过校验，需要用户处理" });
      runs?.waitForUser(runId, "meeting_decision_invalid");
      return true;
    }
    const executed = [];
    for (const action of actions) {
      try {
        await executor?.execute({ ...action, idempotencyKey: `meeting-${meeting.id}-${action.type}-${action.taskId || ""}` }, { runId, round: (run?.round || 0) + 1 });
        executed.push(action.type);
      } catch (error) {
        eventLog?.append("studio.supervisor.meeting.action_failed", { runId, meetingId: meeting.id, type: action.type, error: String(error.message || error) });
      }
    }
    eventLog?.append("studio.supervisor.meeting.handled", { runId, meetingId: meeting.id, decision: result.decision.decision, executed });
    return true;
  };
}
