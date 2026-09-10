// 工作流引擎：依赖调度（异步并发）、质量门（Oracle + Reviewer + 重试 + 会议升级）、事件
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { evaluateRules, verdictFor } from './oracle.js';
import { buildPrompt, parseModelOutput, applyActions, formatInput, truncate } from './runner.js';

export class WorkflowEngine {
  constructor({ config, bus, store, agentRegistry, providerRegistry, artifactStore, taskStore, reviewStore, meetingStore }) {
    this.config = config;
    this.bus = bus;
    this.store = store;
    this.agents = agentRegistry;
    this.providers = providerRegistry;
    this.artifacts = artifactStore;
    this.tasks = taskStore;
    this.reviews = reviewStore;
    this.meetings = meetingStore;
    this.engineOpts = config.engine;
    this.running = 0;
  }

  // ---------- 主循环 ----------

  /** 驱动流程直至达到终态或无法推进。返回 summary。
   *  停止条件：本迭代没有任何任务启动、没有待审核产物、没有在跑任务，
   *  且任务状态没有任何变化（防止等待会议/人工的无限空转）。
   */
  async runUntil({ maxIterations = 500 } = {}) {
    let lastVersion = -1;
    for (let i = 0; i < maxIterations; i++) {
      this.#advanceReady();
      await this.#gateSubmitted();
      const started = await this.#startBatch();
      if (this.allFinal()) break;
      const idleNow = !started
        && this.tasks.list({ state: 'submitted' }).length === 0
        && this.tasks.list({ state: 'ready' }).length === 0
        && this.running === 0;
      if (idleNow && this.tasks.version === lastVersion) break;
      lastVersion = this.tasks.version;
    }
    return this.summary();
  }

  allFinal() {
    return this.tasks.list().every((t) => ['approved', 'failed', 'cancelled'].includes(t.state));
  }

  // ---------- 调度 ----------

  #advanceReady() {
    for (const t of this.tasks.list()) {
      if ((t.state === 'pending' || t.state === 'needs_revision') && this.#depsOk(t)) {
        this.tasks.transition(t.id, 'ready');
      }
    }
  }

  #depsOk(task) {
    return task.requires.every((r) => this.tasks.get(r).state === 'approved');
  }

  async #startBatch() {
    const cap = this.engineOpts.maxConcurrent - this.running;
    if (cap <= 0) return false;
    const ready = this.tasks.list({ state: 'ready' }).slice(0, cap);
    if (ready.length === 0) return false;
    await Promise.allSettled(ready.map((t) => this.#runTask(t)));
    return true;
  }

  /** 执行单个产出任务（agent 运行，异步互不干扰） */
  async #runTask(task) {
    const agent = this.agents.get(task.agentId);
    task.attempts += 1;
    const attempt = task.attempts;
    this.agents.markRunStart(agent.id, task.id);
    this.agents.setState(agent.id, 'running', { currentTaskId: task.id });
    this.running += 1;
    this.bus.emit('task.started', { id: task.id, attempt, agentId: agent.id });
    try {
      this.tasks.transition(task.id, 'running', { attempt });
      const provider = this.providers.get(agent.provider);
      const inputs = this.#resolveInputs(task);
      const extra = {};
      const lastGate = this.reviews.latestFor(task.id);
      if (lastGate && lastGate.verdict === 'fail') {
        extra.gateIssues = lastGate.issues.map((i) => (typeof i === 'string' ? i : i.detail));
      }
      const pending = task.meta.pendingDecisionId ? this.meetings.get(task.meta.pendingDecisionId) : null;
      if (pending?.decision) extra.decision = pending.decision;

      const { system, user } = buildPrompt({ agent, task, inputs, extra });
      const raw = await provider.generate({
        system,
        user,
        model: agent.model,
        role: agent.role,
        task: { id: task.id, name: task.name },
        attempt,
        inputs,
      });
      const parsed = parseModelOutput(raw);
      if (!parsed.done) throw new Error(`agent 输出 done=false：${parsed.summary || '未完成'}`);

      const workDir = this.#workDirFor(task, attempt);
      const { files, execResults } = applyActions(parsed.actions, {
        workDir,
        commandTimeoutMs: this.engineOpts.commandTimeoutMs,
      });

      const artifact = this.artifacts.submit({
        name: task.outputs[0],
        producer: agent.id,
        taskId: task.id,
        baseArtifacts: inputs.map((a) => a.id),
        summary: parsed.summary,
        text: parsed.text,
        files,
        meta: { attempt, execResults },
      });
      task.result = { summary: parsed.summary, knownIssues: parsed.knownIssues, artifactId: artifact.id };
      this.tasks.transition(task.id, 'submitted', { result: { ...task.result } });
    } catch (err) {
      task.lastError = err.message;
      this.tasks.transition(task.id, 'failed', { lastError: err.message });
      this.agents.setState(agent.id, 'failed', { lastError: err.message });
    } finally {
      this.running -= 1;
      if (task.state !== 'failed') this.agents.setState(agent.id, 'idle');
    }
  }

  // ---------- 质量门 ----------

  async #gateSubmitted() {
    for (const t of this.tasks.list({ state: 'submitted' })) {
      await this.#gateOne(t);
    }
  }

  async #gateOne(task) {
    const artifact = task.result?.artifactId && this.artifacts.has(task.result.artifactId)
      ? this.artifacts.get(task.result.artifactId)
      : null;
    if (!artifact) {
      task.lastError = '任务提交了结果但缺少产物';
      this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
      return;
    }
    // gate=false：直接放行（协调者汇报等）
    if (task.gate === false) {
      this.#approve(task, artifact);
      return;
    }

    // 1) Oracle 架构规则 + task.verify 清单（自动校验）
    const rules = this.#collectRules();
    const checks = [...evaluateRules(rules, artifact.files), ...evaluateRules(task.verify, artifact.files)];
    const v = verdictFor(checks);
    if (v.verdict === 'fail') {
      this.#recordReview(task, null, checks, 'fail', v.issues.map((i) => i.detail), v.detail);
      this.#afterGateFail(task, artifact, v.issues.map((i) => i.detail));
      return;
    }

    // 2) 审核者（agent 审查）
    const reviewer = this.#reviewerFor(task);
    if (reviewer) {
      let verdict2;
      try {
        verdict2 = await this.#runReviewer(task, artifact, reviewer, checks, v);
      } catch (err) {
        this.#recordReview(task, reviewer.id, checks, 'warn', [], `审核者运行异常（按自动校验结论放行）: ${err.message}`);
        this.#approve(task, artifact);
        return;
      }
      if (verdict2.verdict === 'fail') {
        this.#recordReview(task, reviewer.id, checks, 'fail', verdict2.issues, verdict2.comments);
        this.#afterGateFail(task, artifact, verdict2.issues.map((s) => (typeof s === 'string' ? s : s.detail)));
        return;
      }
      this.#recordReview(task, reviewer.id, checks, verdict2.verdict, [], verdict2.comments);
    } else {
      this.#recordReview(task, null, checks, v.verdict, [], v.detail);
    }
    this.#approve(task, artifact);
  }

  /** 审查失败后的处理：重试 / 会议等待（waiting）/ 人工升级 */
  #afterGateFail(task, artifact, issues) {
    artifact.meta.rejectReason = issues.join('; ');
    this.artifacts.transition(artifact.id, 'rejected');
    const attempts = task.attempts;
    if (attempts >= this.engineOpts.maxReviewAttempts) {
      if (task.escalations >= this.engineOpts.maxEscalations) {
        task.meta.humanBlocked = true;
        task.lastError = `多次审查失败且已达会议升级上限：${issues.join('; ')}`;
        this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
        this.bus.emit('task.blocked_human', { id: task.id, issues });
        return;
      }
      // 触发会议并把任务置为 waiting，避免异步决策期间被重复处理
      const meeting = this.meetings.trigger({
        subject: `任务 ${task.id}（${task.name}）多次未通过质量门`,
        reason: issues.join('; '),
        participants: ['manager', task.agentId],
        contextRefs: [artifact.id],
        taskId: task.id,
      });
      task.meta.pendingMeetingId = meeting.id;
      this.tasks.transition(task.id, 'waiting', { meetingId: meeting.id });
      this.bus.emit('meeting.decision_requested', { id: task.id, meetingId: meeting.id });
      void this.#decideMeeting(meeting, task).catch((err) => {
        this.meetings.escalate(meeting.id, `自动决策失败: ${err.message}`);
        task.meta.humanBlocked = true;
        task.lastError = `会议 ${meeting.id} 待人工决策（自动决策失败: ${err.message}）`;
        this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
        this.bus.emit('task.blocked_human', { id: task.id, meetingId: meeting.id });
      });
      return;
    }
    // 未超上限：自动重试
    this.tasks.transition(task.id, 'needs_revision');
    this.bus.emit('task.needs_revision', { id: task.id, attempt: attempts, issues });
  }

  /** 会议决策（等待态任务）：autoDecide 时由 manager/meeting 角色生成决策与补救 actions */
  async #decideMeeting(meeting, task) {
    if (!this.engineOpts.meeting.autoDecide) {
      this.meetings.escalate(meeting.id, '未开启自动决策，需要人工处理');
      task.meta.humanBlocked = true;
      task.lastError = `会议 ${meeting.id} 待人工决策`;
      this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
      this.bus.emit('task.blocked_human', { id: task.id, meetingId: meeting.id });
      return;
    }
    const decider = this.agents.byRole('manager')[0] ?? this.agents.byRole('meeting')[0];
    if (!decider) {
      this.meetings.escalate(meeting.id, '未配置可决策的 agent（manager/meeting 角色）');
      task.meta.humanBlocked = true;
      task.lastError = `会议 ${meeting.id} 待人工决策（无决策 agent）`;
      this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
      this.bus.emit('task.blocked_human', { id: task.id, meetingId: meeting.id });
      return;
    }
    const provider = this.providers.get(decider.provider);
    const refs = (meeting.contextRefs ?? [])
      .filter((id) => this.artifacts.has(id))
      .map((id) => this.artifacts.get(id));
    const user = [
      `# 会议决策：${meeting.subject}`,
      `背景：${meeting.reason}`,
      '相关产物（只读）：',
      ...refs.map((a) => formatInput(a, { maxText: 3000, maxFile: 2000 })),
      '',
      '请输出严格 JSON（不得输出其它解释）：',
      '{"summary":"决策结论","text":"给出这样决策的理由","actions":[{"taskId":"任务ID","instruction":"补救指令"}],"knownIssues":[],"done":true}',
      '- actions 每项必须含 taskId 与 instruction，用于分工解决。',
    ].join('\n');
    const raw = await provider.generate({
      system: decider.prompt,
      user,
      model: decider.model,
      role: 'decision',
      task: { id: task.id, name: task.name },
    });
    const parsed = parseModelOutput(raw, { rawActions: true });
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.filter((a) => a && typeof a.taskId === 'string' && typeof a.instruction === 'string')
      : [];
    this.meetings.recordDecision({
      meetingId: meeting.id,
      decision: parsed.summary || parsed.text || '会议作出决策',
      reason: parsed.text,
      decidedBy: decider.id,
      actions,
    });
    // 决策之后：安排补救执行（waiting -> needs_revision -> ready）
    task.escalations += 1;
    task.meta.pendingDecisionId = meeting.id;
    this.tasks.transition(task.id, 'needs_revision');
    this.bus.emit('task.decided_retry', { id: task.id, meetingId: meeting.id, escalations: task.escalations });
  }

  /** 审核者 agent 运行：阅读产物 + 质量门数据，输出 PASS/FAIL */
  async #runReviewer(task, artifact, reviewer, checks, gateVerdict) {
    const provider = this.providers.get(reviewer.provider);
    const { system, user } = buildPrompt({ agent: reviewer, task, inputs: [artifact] });
    const gateData = {
      checks: checks.map((c) => ({
        ruleId: c.ruleId, severity: c.severity, passed: c.passed, detail: c.detail, applicable: c.applicable,
      })),
      gateVerdict: gateVerdict.verdict,
    };
    const fullUser = `${user}\n\n## 质量门数据（只读）\n${JSON.stringify(gateData)}\n\n## 判定规范\n- 只要存在 applicable!==false 且 severity=high 且 passed=false 的检查，就必须判 FAIL；\n- 通过则判 PASS；issues 列出失败项。\n- 你只审查，不许修改产物（actions 必须为 []）。`;
    const raw = await provider.generate({
      system,
      user: fullUser,
      model: reviewer.model,
      role: reviewer.role,
      task: { id: task.id, name: task.name },
      gate: gateData,
    });
    const parsed = parseModelOutput(raw);
    const failed = parsed.summary.toUpperCase().startsWith('FAIL');
    return {
      verdict: failed ? 'fail' : 'pass',
      issues: failed ? [...parsed.knownIssues, ...(parsed.summary ? [truncate(parsed.summary, 200)] : [])] : [],
      comments: parsed.text || parsed.summary,
    };
  }

  // ---------- 工具 ----------

  #approve(task, artifact) {
    this.tasks.transition(task.id, 'approved');
    this.artifacts.transition(artifact.id, 'approved');
    this.bus.emit('task.approved', { id: task.id, artifactId: artifact.id });
  }

  #recordReview(task, reviewerId, checks, verdict, issues, comments) {
    this.reviews.add({ taskId: task.id, reviewerId, builtinChecks: checks, verdict, issues, comments });
  }

  #reviewerFor(task) {
    if (this.agents.byRole(task.agentId)[0]) return null; // 该角色自己的任务不自我审核
    return this.agents.byRole('reviewer')[0] ?? null;
  }

  #collectRules() {
    const arch = this.artifacts.latestApproved('architecture');
    if (!arch) return [];
    const rulesFile = arch.files.find((f) => f.path === 'rules.json');
    if (!rulesFile) return [];
    try {
      const data = JSON.parse(rulesFile.content);
      return Array.isArray(data.rules) ? data.rules : [];
    } catch {
      return [];
    }
  }

  #resolveInputs(task) {
    return (task.inputs ?? [])
      .map((name) => this.artifacts.latestApproved(name) ?? null)
      .filter(Boolean);
  }

  #workDirFor(task, attempt) {
    if (!this.store.persist) return null;
    const dir = join(this.store.dir, 'work', `${task.id}-a${attempt}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  // ---------- 汇总 ----------

  summary() {
    const tasks = this.tasks.list();
    const byState = (s) => tasks.filter((t) => t.state === s);
    const approved = byState('approved').length;
    const blocked = [
      ...byState('failed').filter((t) => t.meta?.humanBlocked),
      ...byState('waiting'),
    ];
    let state;
    if (blocked.length > 0) {
      state = 'blocked'; // 有等待会议/人工的事项优先呈现为 blocked
    } else if (this.allFinal()) {
      state = approved === tasks.length ? 'completed' : 'failed';
    } else if (this.running > 0) {
      state = 'running';
    } else {
      state = 'in_progress';
    }
    return {
      state,
      total: tasks.length,
      approved,
      failed: byState('failed').map((t) => ({ id: t.id, name: t.name, error: t.lastError })),
      pending: byState('pending').length,
      ready: byState('ready').length,
      running: byState('running').length,
      submitted: byState('submitted').length,
      needsRevision: byState('needs_revision').length,
      waiting: byState('waiting').length,
      needsHuman: blocked.map((t) => ({ id: t.id, taskName: t.name, reason: t.lastError ?? '等待会议决策/人工处理' })),
      tasks: tasks.map((t) => ({
        id: t.id, name: t.name, state: t.state, agentId: t.agentId,
        attempts: t.attempts, escalations: t.escalations, lastError: t.lastError,
      })),
    };
  }

  snapshot() {
    return {
      agents: this.agents.snapshot(),
      tasks: this.tasks.snapshot(),
      artifacts: this.artifacts.snapshot(),
      reviews: this.reviews.snapshot(),
      meetings: this.meetings.snapshot(),
    };
  }
}