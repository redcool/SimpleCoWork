// 工作流引擎：依赖调度（异步并发）、质量门（Oracle + Reviewer + 重试 + 会议升级）、夜班静默模式
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { evaluateRules, verdictFor } from './oracle.js';
import { buildPrompt, parseModelOutput, parseOutputLoose, applyActions, formatInput, truncate } from './runner.js';
import { isInNightShift } from './nightshift.js';

export class WorkflowEngine {
  constructor({ config, bus, store, agentRegistry, providerRegistry, artifactStore, taskStore, reviewStore, meetingStore, clock = () => new Date(), nightShiftLog = null }) {
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
    this.clock = clock;
    this.nightShiftLog = nightShiftLog;
    this.running = 0;
    this.#inflight = new Set(); // 进行中的会议决策（防止 runUntil 提前判停）
  }

  #inflight = new Set();
  #stats = []; // 每次模型调用的运行统计（耗时/输出规模/tokens）

  /** 统一的模型调用入口：计时、记录 usage（detail 模式）、收集运行统计 */
  async #callProvider(provider, args) {
    const t0 = Date.now();
    const raw = await provider.generate(args, { detail: true });
    const durationMs = Date.now() - t0;
    const text = raw && typeof raw === 'object' && 'text' in raw ? raw.text : String(raw);
    const usage = raw && typeof raw === 'object' && 'text' in raw ? raw.usage ?? null : null;
    this.#stats.push({
      at: new Date().toISOString(),
      provider: provider.name ?? '?',
      model: args.model ?? null,
      role: args.role ?? null,
      taskId: args.task?.id ?? null,
      attempt: args.attempt ?? null,
      mode: args.mode ?? 'produce',
      member: args.member ?? null,
      durationMs,
      outputChars: text.length,
      promptTokens: usage?.prompt_tokens ?? null,
      completionTokens: usage?.completion_tokens ?? null,
    });
    return text;
  }

  /** 运行统计（只读，供 reporter/面板展示 token 与耗时成本） */
  stats() {
    return [...this.#stats];
  }

  statsSummary() {
    const s = this.#stats;
    const group = (key) => {
      const m = new Map();
      for (const x of s) {
        const k = x[key] ?? '(未指定)';
        if (!m.has(k)) m.set(k, { calls: 0, ms: 0, chars: 0, promptTokens: 0, completionTokens: 0 });
        const e = m.get(k);
        e.calls += 1;
        e.ms += x.durationMs ?? 0;
        e.chars += x.outputChars ?? 0;
        e.promptTokens += x.promptTokens ?? 0;
        e.completionTokens += x.completionTokens ?? 0;
      }
      return [...m.entries()].map(([k, e]) => ({ key: k, ...e })).sort((a, b) => b.ms - a.ms);
    };
    return {
      calls: s.length,
      totalMs: s.reduce((a, x) => a + (x.durationMs ?? 0), 0),
      totalChars: s.reduce((a, x) => a + (x.outputChars ?? 0), 0),
      totalPromptTokens: s.reduce((a, x) => a + (x.promptTokens ?? 0), 0),
      totalCompletionTokens: s.reduce((a, x) => a + (x.completionTokens ?? 0), 0),
      byRole: group('role'),
      byModel: group('model'),
    };
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
      if (idleNow) {
        // 先等待进行中的会议决策落定（夜班多角色讨论可能在微任务链路上尚未完成）
        if (this.#inflight.size > 0) {
          await Promise.allSettled([...this.#inflight]);
          continue;
        }
        if (this.tasks.version === lastVersion) break;
      }
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

  /** 执行单个产出任务（agent 运行，异步互不干扰）；team 团队任务走 #runTeamTask */
  async #runTask(task) {
    if (Array.isArray(task.team) && task.team.length > 1) return this.#runTeamTask(task);
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
      const raw = await this.#callProvider(provider, {
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

  // ---------- 团队任务（同角色多 agent 协作讨论，找出最优解） ----------

  /** 团队任务：R1 并行产出方案 → R2 相互评审（评分/互选/提改进） → 择优 → 胜出者整合为最终产物 */
  async #runTeamTask(task) {
    const memberIds = task.team;
    const members = memberIds.map((id) => this.agents.get(id));
    task.attempts += 1;
    const attempt = task.attempts;
    for (const m of members) {
      this.agents.markRunStart(m.id, task.id);
      this.agents.setState(m.id, 'running', { currentTaskId: task.id });
    }
    this.running += 1;
    this.bus.emit('task.started', { id: task.id, attempt, team: memberIds });
    try {
      this.tasks.transition(task.id, 'running', { attempt });
      const inputs = this.#resolveInputs(task);

      // R1：全体成员并行产出各自方案（不落盘，仅取文本用于讨论）
      const proposals = await Promise.all(
        members.map((m) => this.#teamProduce(m, task, attempt, inputs)),
      );

      // R2：互评（每人看全组方案，打分/互选/提改进意见）
      const judges = await Promise.all(
        members.map((m) => this.#teamJudge(m, task, proposals)),
      );

      // 择优：多数互选 → 平局由组长（members[0]）仲裁
      const winner = this.#pickTeamWinner(members, judges);

      // R3：胜出者整合全体意见，产出最终版
      const final = await this.#teamFinalize(winner, task, attempt, inputs, proposals, judges);

      const workDir = this.#workDirFor(task, attempt);
      const { files, execResults } = applyActions(final.actions, {
        workDir,
        commandTimeoutMs: this.engineOpts.commandTimeoutMs,
      });

      const artifact = this.artifacts.submit({
        name: task.outputs[0],
        producer: winner.id,
        taskId: task.id,
        baseArtifacts: inputs.map((a) => a.id),
        summary: final.summary,
        text: final.text,
        files,
        meta: {
          attempt,
          execResults,
          team: {
            members: memberIds,
            proposals: proposals.map((p) => ({ agentId: p.agentId, summary: p.parsed.summary ?? '' })),
            judges: judges.map((j) => ({ agentId: j.agentId, pick: j.pick, score: j.score, notes: j.notes })),
            winner: winner.id,
            rationale: (judges.find((j) => j.agentId === winner.id)?.notes ?? '') || '团队互评择优',
          },
        },
      });
      task.result = { summary: final.summary, knownIssues: final.knownIssues, artifactId: artifact.id };
      task.teamResult = { winner: winner.id, members: memberIds };
      this.tasks.transition(task.id, 'submitted', { result: { ...task.result } });
    } catch (err) {
      task.lastError = err.message;
      this.tasks.transition(task.id, 'failed', { lastError: err.message });
      for (const m of members) this.agents.setState(m.id, 'failed', { lastError: err.message });
    } finally {
      this.running -= 1;
      for (const m of members) this.agents.setState(m.id, 'idle');
    }
  }

  /** 团队成员独立产出一版方案（标准产出协议，仅取 summary/text 供讨论） */
  async #teamProduce(agent, task, attempt, inputs) {
    const provider = this.providers.get(agent.provider);
    const { system, user } = buildPrompt({ agent, task, inputs });
    const raw = await this.#callProvider(provider, {
      system,
      user,
      model: agent.model,
      role: agent.role,
      task: { id: task.id, name: task.name },
      attempt,
      inputs,
      mode: 'team-produce',
      member: agent.id,
    });
    const parsed = parseModelOutput(raw);
    if (!parsed.done) throw new Error(`团队成员 ${agent.id} 输出 done=false：${parsed.summary || '未完成'}`);
    return { agentId: agent.id, parsed };
  }

  /** 团队互评：每人审阅全组方案，输出 {pick, score, notes} */
  async #teamJudge(agent, task, proposals) {
    const provider = this.providers.get(agent.provider);
    const user = [
      `# 团队方案评审（任务 ${task.id}：${task.name}）`,
      `你是"${agent.title || agent.role}"。以下是同组各成员提出的方案，请阅读全部后：`,
      '1) 给每个方案打分（1-100 整数）；2) 选出你认为最优的方案（pick=对应成员 id）；3) 给出可执行的改进意见（notes）。',
      '',
      ...proposals.map((p, i) => [
        `--- 方案 ${i + 1}（成员 ${p.agentId}）---`,
        `摘要：${p.parsed.summary ?? ''}`,
        `正文：${truncate(p.parsed.text ?? '', 2200)}`,
      ].join('\n')),
      '',
      '输出严格 JSON（不得输出其它解释）：',
      '{"summary":"评审小结","scores":{"成员id":90},"pick":"成员id","score":90,"notes":"对最优方案的改进意见"}',
      '- pick 必须为上述成员 id 之一；score 为整体最优评分。',
    ].join('\n');
    const raw = await this.#callProvider(provider, {
      system: agent.prompt,
      user,
      model: agent.model,
      role: agent.role,
      task: { id: task.id, name: task.name },
      mode: 'team-judge',
      member: agent.id,
    });
    const parsed = parseOutputLoose(raw) ?? {};
    let pick = parsed.pick;
    if (!pick || !proposals.some((p) => p.agentId === pick)) {
      // 未指定有效 pick 则选自己（无法自评才回退）
      pick = proposals.some((p) => p.agentId === agent.id)
        ? (parsed.scores ? Object.keys(parsed.scores).sort((a, b) => (parsed.scores[b] ?? 0) - (parsed.scores[a] ?? 0))[0] : agent.id)
        : agent.id;
    }
    return {
      agentId: agent.id,
      pick,
      score: Number.isFinite(Number(parsed.score)) ? Number(parsed.score) : 0,
      notes: parsed.notes || parsed.text || '',
      summary: parsed.summary || '',
    };
  }

  /** 择优：多数互选胜出；平局由组长（members[0]）仲裁 */
  #pickTeamWinner(members, judges) {
    const count = new Map(members.map((m) => [m.id, 0]));
    for (const j of judges) {
      if (count.has(j.pick)) count.set(j.pick, count.get(j.pick) + 1);
    }
    const best = Math.max(...count.values());
    const leaders = members.filter((m) => count.get(m.id) === best);
    const winnerId = leaders.length === 1 ? leaders[0].id : members[0].id;
    return members.find((m) => m.id === winnerId) ?? members[0];
  }

  /** 胜出者整合：综合全体方案与评审意见，输出最终版（标准产出协议） */
  async #teamFinalize(winner, task, attempt, inputs, proposals, judges) {
    const provider = this.providers.get(winner.provider);
    const user = [
      `# 团队方案整合（任务 ${task.id}：${task.name}）`,
      `你在团队互评中胜出。请综合以下材料，输出本任务的最终交付（严格 JSON，标准产出协议）：`,
      '',
      '## 全体成员方案（只读）',
      ...proposals.map((p) => `- [${p.agentId}] ${truncate(p.parsed.text ?? p.parsed.summary ?? '', 2500)}`),
      '',
      '## 评审意见（只读）',
      ...judges.map((j) => `- [${j.agentId}] pick=${j.pick} score=${j.score} 意见：${truncate(j.notes ?? '', 900)}`),
      '',
      '请把最优方案的亮点与评审意见融合进最终产出，输出标准 JSON：',
      '{"summary":"最终交付摘要","text":"实现说明","actions":[{"type":"write","path":"文件名","content":"完整内容"}],"knownIssues":[],"done":true}',
      '- done 必须为 true；actions 只写本任务应交付的文件。',
    ].join('\n');
    const raw = await this.#callProvider(provider, {
      system: winner.prompt,
      user,
      model: winner.model,
      role: winner.role,
      task: { id: task.id, name: task.name },
      attempt,
      inputs,
      mode: 'team-finalize',
      member: winner.id,
    });
    const parsed = parseModelOutput(raw);
    if (!parsed.done) throw new Error(`团队成员 ${winner.id}（整合轮）输出 done=false`);
    return parsed;
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
      this.#trackInflight(this.#decideMeeting(meeting, task).catch((err) => {
        this.meetings.escalate(meeting.id, `自动决策失败: ${err.message}`);
        task.meta.humanBlocked = true;
        task.lastError = `会议 ${meeting.id} 待人工决策（自动决策失败: ${err.message}）`;
        if (task.state === 'waiting') this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
        this.bus.emit('task.blocked_human', { id: task.id, meetingId: meeting.id });
      }));
      return;
    }
    // 未超上限：自动重试
    this.tasks.transition(task.id, 'needs_revision');
    this.bus.emit('task.needs_revision', { id: task.id, attempt: attempts, issues });
  }

  // ---------- 会议决策（白天单决策者 / 夜班多角色讨论） ----------

  /** 会议决策入口：夜班走多角色讨论 + 夜班文档；白天按 autoDecide 或人工 */
  async #decideMeeting(meeting, task) {
    if (this.#isNightShift()) {
      await this.#nightMeeting(meeting, task);
      return;
    }
    if (!this.engineOpts.meeting.autoDecide) {
      this.meetings.escalate(meeting.id, '未开启自动决策，需要人工处理');
      task.meta.humanBlocked = true;
      task.lastError = `会议 ${meeting.id} 待人工决策`;
      this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
      this.bus.emit('task.blocked_human', { id: task.id, meetingId: meeting.id });
      return;
    }
    const decided = await this.#askManagerDecision(meeting, task);
    if (!decided) {
      this.meetings.escalate(meeting.id, '未配置可决策的 agent（manager/meeting 角色）');
      task.meta.humanBlocked = true;
      task.lastError = `会议 ${meeting.id} 待人工决策（无决策 agent）`;
      this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
      this.bus.emit('task.blocked_human', { id: task.id, meetingId: meeting.id });
      return;
    }
    this.meetings.recordDecision({ meetingId: meeting.id, ...decided });
    task.escalations += 1;
    task.meta.pendingDecisionId = meeting.id;
    this.tasks.transition(task.id, 'needs_revision');
    this.bus.emit('task.decided_retry', { id: task.id, meetingId: meeting.id, escalations: task.escalations });
  }

  /** 夜班会议：多角色依次发言 → 主持人归纳决策 → 形成夜班文档 */
  async #nightMeeting(meeting, task) {
    const problem = [meeting.reason];
    const analysis = [];
    const panel = this.#discussionPanel(task);
    for (const agent of panel) {
      try {
        const opinion = await this.#askOpinion(agent, meeting, task);
        analysis.push(`${agent.title || agent.role}（${agent.id}）：${opinion}`);
      } catch (err) {
        analysis.push(`${agent.id}：发言失败（${err.message}）`);
      }
    }
    meeting.discussion = [...analysis];

    const chair = panel.find((a) => a.role === 'manager') ?? panel[panel.length - 1] ?? null;
    let decided = null;
    if (chair) {
      try {
        decided = await this.#askChairDecision(meeting, task, chair, analysis);
      } catch (err) {
        decided = null;
      }
    }
    if (decided) {
      this.meetings.recordDecision({ meetingId: meeting.id, ...decided });
      this.#logNight(meeting, problem, analysis, decided);
      task.escalations += 1;
      task.meta.pendingDecisionId = meeting.id;
      this.tasks.transition(task.id, 'needs_revision');
      this.bus.emit('meeting.decided', { id: meeting.id, decision: this.meetings.get(meeting.id).decision, night: true });
      this.bus.emit('task.decided_retry', { id: task.id, meetingId: meeting.id, escalations: task.escalations, night: true });
      return;
    }
    this.#logNight(meeting, problem, analysis, null);
    this.meetings.escalate(meeting.id, '夜班会议未能形成决策，升级待人工复核');
    task.meta.humanBlocked = true;
    task.lastError = `夜班会议 ${meeting.id} 未能形成决策，待人工复核`;
    this.tasks.transition(task.id, 'failed', { lastError: task.lastError });
    this.bus.emit('task.blocked_human', { id: task.id, meetingId: meeting.id, night: true });
  }

  /** 白天/共同决策：单个 manager（或 meeting 角色）输出决策与分工 actions */
  async #askManagerDecision(meeting, task) {
    const decider = this.agents.byRole('manager')[0] ?? this.agents.byRole('meeting')[0];
    if (!decider) return null;
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
    const raw = await this.#callProvider(provider, {
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
    return {
      decision: parsed.summary || parsed.text || '会议作出决策',
      reason: parsed.text,
      decidedBy: decider.id,
      actions,
    };
  }

  /** 夜班讨论参与者：架构师、生产者、审核者、协调者（去重、按启用过滤） */
  #discussionPanel(task) {
    const panel = [];
    const seen = new Set();
    const want = [];
    for (const role of ['architect', 'reviewer', 'manager']) {
      const agent = this.agents.byRole(role)[0];
      if (agent && !seen.has(agent.id)) {
        seen.add(agent.id);
        panel.push(agent);
      }
    }
    if (this.agents.has(task.agentId)) {
      const producer = this.agents.get(task.agentId);
      if (!seen.has(producer.id)) panel.push(producer);
    }
    return panel;
  }

  /** 某角色发言（夜班分析过程） */
  async #askOpinion(agent, meeting, task) {
    const provider = this.providers.get(agent.provider);
    const user = [
      `# 夜班会议：${meeting.subject}`,
      `问题：${meeting.reason}`,
      `你是项目里的"${agent.title || agent.role}"，请从你的角色视角分析问题并给出解决方案建议（简要、可执行）。`,
      '输出严格 JSON（不得输出其它解释）：{"summary":"你的观点与建议","text":"详细分析","actions":[],"knownIssues":[],"done":true}',
    ].join('\n');
    const raw = await this.#callProvider(provider, {
      system: agent.prompt,
      user,
      model: agent.model,
      role: agent.role,
      mode: 'discuss',
      task: { id: task.id, name: task.name },
    });
    const parsed = parseOutputLoose(raw);
    return (parsed?.text || parsed?.summary || raw).trim();
  }

  /** 主持人归纳（夜班决定） */
  async #askChairDecision(meeting, task, chair, analysis) {
    const provider = this.providers.get(chair.provider);
    const refs = (meeting.contextRefs ?? [])
      .filter((id) => this.artifacts.has(id))
      .map((id) => this.artifacts.get(id));
    const user = [
      `# 夜班会议决策：${meeting.subject}`,
      `问题：${meeting.reason}`,
      '',
      '## 参会者分析',
      ...analysis.map((a) => `- ${a}`),
      '',
      '## 相关产物（只读）',
      ...refs.map((a) => formatInput(a, { maxText: 3000, maxFile: 2000 })),
      '',
      '请作为会议主持人输出严格 JSON（不得输出其它解释），归纳出"最佳解决方案"并分工：',
      '{"summary":"决策结论","text":"给出这样决策的理由","actions":[{"taskId":"任务ID","instruction":"补救指令"}],"knownIssues":[],"done":true}',
      '- actions 每项必须含 taskId 与 instruction，用于分工解决。',
    ].join('\n');
    const raw = await this.#callProvider(provider, {
      system: chair.prompt,
      user,
      model: chair.model,
      role: 'decision',
      mode: 'discuss',
      task: { id: task.id, name: task.name },
    });
    const parsed = parseModelOutput(raw, { rawActions: true });
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.filter((a) => a && typeof a.taskId === 'string' && typeof a.instruction === 'string')
      : [];
    if (!parsed.summary && !parsed.text) return null;
    return {
      decision: parsed.summary || parsed.text || '会议作出决策',
      reason: parsed.text,
      decidedBy: chair.id,
      actions,
    };
  }

  /** 夜班文档：问题 / 分析过程 / 决定（写入 NightShiftLog） */
  #logNight(meeting, problem, analysis, decided) {
    if (!this.nightShiftLog) return;
    this.nightShiftLog.add({
      date: this.clock(),
      kind: decided ? 'decision' : 'issue',
      title: meeting.subject,
      problem,
      analysis,
      decision: decided?.decision ?? '',
      decisionsBy: decided?.decidedBy ?? '',
      actions: decided?.actions ?? [],
    });
  }

  /** 当前是否处于夜班静默时段（时钟可注入，便于测试） */
  #isNightShift() {
    const ns = this.engineOpts.nightShift;
    return !!ns?.enabled && isInNightShift(ns.ranges ?? [], this.clock(), ns.timezone ?? 'UTC');
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
    const raw = await this.#callProvider(provider, {
      system,
      user: fullUser,
      model: reviewer.model,
      role: reviewer.role,
      task: { id: task.id, name: task.name },
      gate: gateData,
      mode: 'review',
    });
    const parsed = parseModelOutput(raw);
    const failed = parsed.summary.toUpperCase().startsWith('FAIL');
    return {
      verdict: failed ? 'fail' : 'pass',
      issues: failed ? [...parsed.knownIssues, ...(parsed.summary ? [truncate(parsed.summary, 200)] : [])] : [],
      comments: parsed.text || parsed.summary,
    };
  }

  // ---------- 恢复续跑 ----------

  /** 从持久化快照恢复后的状态清理：running 任务重入队；waiting 任务按会议是否已审批分流 */
  resumeState() {
    for (const t of this.tasks.list({ state: 'running' })) {
      t.lastError = '中断恢复：任务重新入队';
      this.tasks.transition(t.id, 'failed', { lastError: t.lastError });
    }
    for (const t of this.tasks.list({ state: 'waiting' })) {
      const mid = t.meta?.pendingMeetingId;
      const m = mid ? this.meetings.get(mid) : null;
      if (m && m.status === 'decided') {
        this.tasks.transition(t.id, 'needs_revision');
      } else {
        t.meta = { ...(t.meta ?? {}), humanBlocked: true };
        t.lastError = `等待会议/人工处理（会议 ${mid ?? '未知'}）`;
        this.tasks.transition(t.id, 'failed', { lastError: t.lastError });
      }
    }
  }

  // ---------- 工具 ----------

  /** 跟踪进行中的会议决策 promise（内部已吞掉拒绝，这里只负责登记/清理） */
  #trackInflight(promise) {
    this.#inflight.add(promise);
    promise.then(
      () => this.#inflight.delete(promise),
      () => this.#inflight.delete(promise),
    );
  }

  #approve(task, artifact) {
    this.tasks.transition(task.id, 'approved');
    this.artifacts.transition(artifact.id, 'approved');
    this.bus.emit('task.approved', { id: task.id, artifactId: artifact.id });
  }

  #recordReview(task, reviewerId, checks, verdict, issues, comments) {
    this.reviews.add({ taskId: task.id, reviewerId, builtinChecks: checks, verdict, issues, comments });
  }

  /** 选取审核者：优先 accepts 与任务匹配的 reviewer（按产物名或生产者角色）；
   *  无匹配时按语义回退——评审者不自审、架构/规划类设计产物由内建门自审，其余取第一个 reviewer 兜底。
   *  团队任务取全部成员判断角色（任一成员为评审/架构/规划角色即交给内建门）。 */
  #reviewerFor(task) {
    const reviewers = this.agents.byRole('reviewer');
    if (reviewers.length === 0) return null;

    const ids = Array.isArray(task.team) && task.team.length ? task.team : [task.agentId];
    const producers = ids
      .map((id) => { try { return this.agents.get(id); } catch { return null; } })
      .filter(Boolean);

    const matched = (r) => {
      const accepts = Array.isArray(r.accepts) ? r.accepts : [];
      if (accepts.length === 0) return false; // 通用兜底，不参与精确匹配
      const byOutput = (task.outputs ?? []).some((o) => accepts.some((a) => o === a || o.startsWith(`${a}-`)));
      const byRole = accepts.includes(task.agentId);
      return byOutput || byRole;
    };

    const exact = reviewers.find(matched);
    if (exact) {
      // 唯一候选就是（单 agent 任务的）生产者本人 → 不自我审核
      if (!Array.isArray(task.team) && exact.id === task.agentId) return null;
      return exact;
    }

    // 无精确匹配：评审/架构/规划角色的产出由内建质量门自审，不额外安排评审者
    if (producers.some((p) => ['reviewer', 'architect', 'planner'].includes(p.role))) return null;
    return reviewers.find((r) => !Array.isArray(r.accepts) || r.accepts.length === 0) ?? reviewers[0];
  }

  #collectRules() {
    const fromConfig = this.config.workflow?.rules ?? [];
    const arch = this.artifacts.latestApproved('architecture');
    if (!arch) return [...fromConfig];
    const rulesFile = arch.files.find((f) => f.path === 'rules.json');
    if (!rulesFile) return [...fromConfig];
    try {
      const data = JSON.parse(rulesFile.content);
      return [...fromConfig, ...(Array.isArray(data.rules) ? data.rules : [])];
    } catch {
      return [...fromConfig];
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
      nightShift: this.#isNightShift(),
      needsHuman: blocked.map((t) => ({ id: t.id, taskName: t.name, reason: t.lastError ?? '等待会议决策/人工处理' })),
      tasks: tasks.map((t) => ({
        id: t.id, name: t.name, state: t.state,
        agentId: t.agentId ?? null,
        team: Array.isArray(t.team) ? t.team : null,
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