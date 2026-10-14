import { join } from "node:path";
import { openStudioDb, StudioEventLog, StudioGoalStore, WorkflowRunStore, AcceptanceEvaluator, ActionExecutor, AutonomousRunner, StudioVersionStore, StudioTaskStore, StudioBugStore, StudioDocumentRunner, StudioDocumentStore, StudioArtifactStore, StudioReviewStore, ConfirmationQueue, StudioWorkflowDriver, StageGateStore, StudioStageOrchestrator, StudioScheduler, StudioMeetingStore, StudioSupervisorLoop, createMeetingOnStall } from "./index.js";
import { runManagerMeeting } from "./meetings.js";
import { validateControlProposal } from "./control.js";

function meetingParticipants(agents = {}) {
  return Object.values(agents).filter(a => ["manager", "reviewer", "qa", "producer"].includes(a.role)).slice(0, 5).map(a => ({ id: a.id, role: a.role }));
}

export function createStudioAutonomousRuntime({ root, goalId, observer, planner, handlers = {}, maxRounds = 20, provider = null, agents = {}, reviewer = null } = {}) {
  const db = openStudioDb(join(root, ".cowork", "project.db"));
  const events = new StudioEventLog(join(root, ".cowork", "events.jsonl"), { db });
  const goals = new StudioGoalStore({ db, eventLog: events });
  const runs = new WorkflowRunStore({ db, eventLog: events });
  const goal = goals.get(goalId);
  const row = db.prepare("SELECT * FROM studio_workflow_runs WHERE goal_id=? AND status IN ('runnable','paused','waiting_for_user') ORDER BY started_at DESC LIMIT 1").get(goalId);
  const run = row ? runs.get(row.id) : runs.start({ goalId, versionId: goal.version_id });
  runs.recover(run.id);
  const tasks = new StudioTaskStore({ db, eventLog: events });
  const bugs = new StudioBugStore({ db, eventLog: events, tasks });
  const artifacts = new StudioArtifactStore({ db, eventLog: events });
  const documents = new StudioDocumentStore({ db, eventLog: events, artifactStore: artifacts, projectRoot: root });
  const docRunner = provider ? new StudioDocumentRunner({ provider, documentStore: documents, artifactStore: artifacts, eventLog: events }) : null;
  const reviews = new StudioReviewStore({ db, eventLog: events });
  const stages = new StageGateStore({ db, eventLog: events });
  const meetings = new StudioMeetingStore({ db, eventLog: events });
  const confirmations = new ConfirmationQueue({ db, eventLog: events, onDecision: decision => {
    const waiting = db.prepare("SELECT * FROM studio_workflow_runs WHERE status='waiting_for_user' AND version_id=?").all(goal.version_id);
    for (const w of waiting) runs.resume(w.id);
  } });
  const builtin = {
    create_plan: async action => { const p = tasks.list(goal.version_id); return { taskIds: p.map(t => t.id) }; },
    advance_stage: async action => driver.advance({ versionId: goal.version_id, agents, reviewer, autoApprove: true }),
    claim_task: async action => { const t = tasks.get(action.taskId); if (t.status !== "ready") tasks.transition(t.id, "ready"); return tasks.claim(t.id, { workerId: "autonomous-runner" }); },
    start_ready_task: async action => { const t = tasks.get(action.taskId); if (t.status !== "ready") tasks.transition(t.id, "ready"); return tasks.claim(t.id, { workerId: "supervisor" }); },
    retry_failed_task: async action => tasks.retry(action.taskId),
    request_review: async action => ({ taskId: action.taskId, requested: true }),
    create_bug_fix_task: async action => bugs.createFixTask({ bugId: action.bugId, stageKey: action.stageKey || "production", name: action.name }),
    export_events: async () => ({ exported: events.exportPending() }),
    run_task: async action => {
      if (!docRunner) throw new Error("run_task 需要 Provider");
      const t = tasks.get(action.taskId);
      const agent = agents[t.agentRole] || agents.default;
      if (!agent) throw new Error("缺少 task agent");
      const result = await docRunner.run({ agent, task: t, inputs: [], format: t.format, name: t.outputName, producer: agent.id });
      tasks.transition(t.id, "submitted");
      if (reviewer) {
        const decision = await reviewer({ task: t, result });
        const review = reviews.review({ versionId: t.versionId, artifactId: result.id, reviewer: decision.reviewer || "reviewer", reviewerRole: decision.reviewerRole || "reviewer", reviewerCapabilities: decision.reviewerCapabilities || ["independent-review"], decision: decision.decision, issues: decision.issues || [], evidence: decision.evidence || [] });
        if (review.decision !== "approved") { tasks.transition(t.id, "needs_revision"); return { taskId: t.id, artifactId: result.id, needsRevision: true, reviewId: review.id }; }
      }
      return { taskId: t.id, artifactId: result.id, usage: result.usage || null };
    },
    ...handlers,
  };
  const scheduler = new StudioScheduler({ tasks, runner: docRunner, artifacts, reviews, eventLog: events });
  const orchestrator = new StudioStageOrchestrator({ db, stages, tasks, scheduler, eventLog: events });
  const driver = new StudioWorkflowDriver({ orchestrator, stages, tasks, eventLog: events });
  const acceptance = new AcceptanceEvaluator({ db, versionId: goal.version_id, root });
  const executor = new ActionExecutor({ handlers: builtin, eventLog: events, db });
  const runner = new AutonomousRunner({ goals, runs, acceptance, planner, executor, observer, events, maxRounds, confirmationQueue: confirmations, workflowAdvance: async () => driver.advance({ versionId: goal.version_id, agents, reviewer, autoApprove: true }) });
  builtin.convene_meeting = async action => {
    const meeting = meetings.convene({ versionId: goal.version_id, runId: run.id, subject: action.subject || "经理组监督会议", reason: action.reason || "", trigger: action.trigger || "planner", participants: meetingParticipants(agents) });
    const result = await runManagerMeeting({ store: meetings, meeting, provider, agents, eventLog: events });
    if (result.escalated || !result.decision) {
      confirmations.request({ versionId: goal.version_id, type: "meeting_decision", payload: { meetingId: meeting.id, reason: action.reason || "" }, requestedBy: "planner", reason: "经理组会议未能形成决定，需要用户处理" });
      return { meetingId: meeting.id, escalated: true };
    }
    const actions = Array.isArray(result.decision.actions) ? result.decision.actions : [];
    const validation = validateControlProposal({ summary: result.decision.summary || "会议决定", actions }, { versionId: goal.version_id });
    if (!validation.ok) return { meetingId: meeting.id, decision: result.decision, invalid: validation.errors };
    const executed = [];
    for (const a of actions) {
      try {
        await executor.execute({ ...a, idempotencyKey: `meeting-${meeting.id}-${a.type}-${a.taskId || ""}` }, { runId: run.id, round: (runs.get(run.id).round || 0) + 1 });
        executed.push(a.type);
      } catch (error) {
        events.append("studio.meeting.action_failed", { meetingId: meeting.id, type: a.type, error: String(error.message || error) });
      }
    }
    return { meetingId: meeting.id, decision: result.decision, executed };
  };
  return { db, events, goals, runs, run, runner, tasks, bugs, artifacts, documents, reviews, meetings, confirmations, driver, executor, agents, provider, goal };
}

/** 给运行时挂上定时监督循环：每隔 intervalMs 检查一轮；停滞时召开经理组会议。 */
export function attachSupervisor({ runtime, intervalMs = 10000, maxRounds = Infinity, maxRuntimeMs = 0, maxMeetings = 3 } = {}) {
  const { runner, runs, meetings, confirmations, executor, agents, provider, events, goal } = runtime;
  if (!runner || !runs) throw new Error("attachSupervisor 需要 runtime");
  runner.onStall = createMeetingOnStall({ meetings, runs, provider, agents, executor, confirmationQueue: confirmations, eventLog: events, versionId: goal.version_id, maxMeetings });
  return new StudioSupervisorLoop({ runner, runs, intervalMs, maxRounds, maxRuntimeMs, eventLog: events });
}
