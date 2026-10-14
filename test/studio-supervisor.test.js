import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStudioDb, closeStudioDb, StudioVersionStore, StudioGoalStore, WorkflowRunStore, StudioMeetingStore, AutonomousRunner, StudioSupervisorLoop, createMeetingOnStall, createSupervisorPlanner, SUPERVISOR_PROMPT, validateControlProposal, ApprovalStore, StageGateStore, StudioTaskStore, StudioStageOrchestrator, createActor } from "../src/studio/index.js";

const instantSleep = async () => {};

function setup() {
  const root = mkdtempSync(join(tmpdir(), "studio-supervisor-"));
  const db = openStudioDb(join(root, ".cowork", "project.db"));
  const versions = new StudioVersionStore({ db, projectRoot: root });
  const project = versions.createProject({ name: "sup" });
  const version = versions.createVersion({ projectId: project.id, version: "0.9.0.0" });
  return { db, root, versions, versionId: version.id };
}

test("schema v10 persists meetings and approval actor identity", () => {
  const { db } = setup();
  assert.equal(db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get().value, "10");
  closeStudioDb(db);
});

test("meeting store records discussion, decision and escalation", () => {
  const { db, versionId } = setup();
  const meetings = new StudioMeetingStore({ db });
  const m = meetings.convene({ versionId, subject: "停滞会议", reason: "no_state_change", trigger: "no_state_change", participants: [{ id: "m1", role: "manager" }] });
  assert.equal(m.status, "proposed");
  meetings.recordDiscussion(m.id, [{ actorId: "m1", role: "manager", opinion: "重试任务" }]);
  const d = meetings.recordDecision(m.id, { decision: "replan", summary: "先重试", actions: [{ type: "retry_failed_task", taskId: "t1" }], decidedBy: "m1" });
  assert.equal(d.status, "decided");
  assert.equal(d.decision.actions[0].taskId, "t1");
  const m2 = meetings.convene({ versionId, subject: "第二次会议", participants: [] });
  meetings.escalate(m2.id, "无法形成决定");
  assert.equal(meetings.get(m2.id).status, "escalated");
  assert.equal(meetings.list({ versionId, status: "decided" }).length, 1);
  closeStudioDb(db);
});

test("convene_meeting is an allowed low-risk control action", () => {
  const check = validateControlProposal({ summary: "s", actions: [{ type: "convene_meeting", reason: "stall" }] });
  assert.equal(check.ok, true);
});

test("supervisor loop polls on interval until goal completes", async () => {
  const { db, versionId } = setup();
  const goals = new StudioGoalStore({ db }); const runs = new WorkflowRunStore({ db });
  const goal = goals.create({ versionId, objective: "done", acceptance: {}, policy: { maxRounds: 50 } });
  const run = runs.start({ goalId: goal.id, versionId });
  let n = 0;
  const runner = new AutonomousRunner({ goals, runs, acceptance: { evaluate: () => ({ ok: ++n > 2 }) }, observer: async () => ({ n }), planner: async () => ({ summary: "noop", actions: [{ type: "noop" }] }), executor: { execute: async () => ({}) }, maxStalledRounds: 3 });
  const started = Date.now();
  const supervisor = new StudioSupervisorLoop({ runner, runs, intervalMs: 15, maxRounds: 20 });
  const handle = supervisor.start({ runId: run.id, context: {} });
  const result = await handle.promise;
  assert.equal(result.status, "completed");
  assert.ok(Date.now() - started >= 25, "应按间隔轮询而非空转");
  handle.stop();
  closeStudioDb(db);
});

test("stalled run convenes manager meeting, executes decision and continues", async () => {
  const { db, versionId } = setup();
  const goals = new StudioGoalStore({ db }); const runs = new WorkflowRunStore({ db });
  const goal = goals.create({ versionId, objective: "never", acceptance: {}, policy: { maxRounds: 100 } });
  const run = runs.start({ goalId: goal.id, versionId });
  const meetings = new StudioMeetingStore({ db });
  const provider = { generate: async ({ user }) => ({ text: String(user).includes("讨论记录") ? JSON.stringify({ decision: "replan", summary: "先重试失败任务", reason: "t1 失败", actions: [{ type: "retry_failed_task", taskId: "t1" }] }) : JSON.stringify({ opinion: "同意重试", risk: "low", suggest: "retry" }) }) };
  const agents = { m1: { id: "m1", role: "manager", prompt: "经理" }, r1: { id: "r1", role: "reviewer" } };
  const executed = [];
  const runner = new AutonomousRunner({ goals, runs, acceptance: { evaluate: () => ({ ok: false }) }, observer: async () => ({ same: true }), planner: async () => ({ summary: "noop", actions: [{ type: "noop" }] }), executor: { execute: async () => ({}) }, maxStalledRounds: 2 });
  runner.onStall = createMeetingOnStall({ meetings, runs, provider, agents, executor: { execute: async a => { executed.push(a.type); return {}; } }, versionId, maxMeetings: 5 });
  const supervisor = new StudioSupervisorLoop({ runner, runs, intervalMs: 1, sleepFn: instantSleep, maxRounds: 6 });
  const result = await (supervisor.start({ runId: run.id, context: {} })).promise;
  assert.equal(result.status, "runnable", "会议处理后不应停在 stalled");
  assert.ok(meetings.list({ versionId }).length >= 1);
  assert.ok(executed.includes("retry_failed_task"));
  closeStudioDb(db);
});

test("meeting without provider escalates to user confirmation", async () => {
  const { db, versionId } = setup();
  const goals = new StudioGoalStore({ db }); const runs = new WorkflowRunStore({ db });
  const goal = goals.create({ versionId, objective: "x", acceptance: {}, policy: { maxRounds: 100 } });
  const run = runs.start({ goalId: goal.id, versionId });
  const meetings = new StudioMeetingStore({ db });
  const requests = [];
  const confirmationQueue = { request: item => { requests.push(item); return { id: "c1", ...item }; } };
  const runner = new AutonomousRunner({ goals, runs, acceptance: { evaluate: () => ({ ok: false }) }, observer: async () => ({ same: true }), planner: async () => ({ summary: "noop", actions: [{ type: "noop" }] }), executor: { execute: async () => ({}) }, maxStalledRounds: 2 });
  runner.onStall = createMeetingOnStall({ meetings, runs, provider: null, agents: { m1: { id: "m1", role: "manager" } }, versionId, maxMeetings: 3, confirmationQueue });
  const supervisor = new StudioSupervisorLoop({ runner, runs, intervalMs: 1, sleepFn: instantSleep, maxRounds: 5 });
  const result = await (supervisor.start({ runId: run.id, context: {} })).promise;
  assert.equal(result.status, "waiting_for_user");
  assert.equal(requests.length, 1);
  closeStudioDb(db);
});

test("approveStage binds actor identity and capability", () => {
  const { db, versionId } = setup();
  const gates = new StageGateStore({ db });
  gates.start(versionId, "planning"); gates.transition(versionId, "planning", "reviewing");
  const approvals = new ApprovalStore({ db });
  const orch = new StudioStageOrchestrator({ db, stages: gates, tasks: new StudioTaskStore({ db }), scheduler: null, approvals });
  const manager = createActor({ id: "boss", role: "manager", capabilities: ["approve_stage"] });
  orch.approveStage({ versionId, stageKey: "planning", approverType: "manager", actor: manager });
  assert.equal(approvals.listFor({ versionId })[0].actor_id, "boss");
  gates.start(versionId, "design"); gates.transition(versionId, "design", "reviewing");
  const wrongRole = createActor({ id: "dev1", role: "developer", capabilities: ["approve_stage"] });
  assert.throws(() => orch.approveStage({ versionId, stageKey: "design", approverType: "manager", actor: wrongRole }), /审批者角色不匹配/);
  const noCapability = createActor({ id: "boss2", role: "manager", capabilities: [] });
  assert.throws(() => orch.approveStage({ versionId, stageKey: "design", approverType: "manager", actor: noCapability }), /capability/);
  closeStudioDb(db);
});

test("supervisor planner binds manager duties prompt", async () => {
  const seen = [];
  const provider = { generate: async req => { seen.push(req); return { text: JSON.stringify({ summary: "ok", actions: [] }) }; } };
  const planner = createSupervisorPlanner({ provider, agent: { id: "boss", role: "manager", model: "m1" } });
  await planner({ goal: { objective: "o", acceptance: {} }, snapshot: {}, run: {} });
  assert.equal(seen[0].role, "manager");
  assert.match(seen[0].system, /监控阻塞/);
  assert.match(SUPERVISOR_PROMPT, /组织跨组会议/);
});
