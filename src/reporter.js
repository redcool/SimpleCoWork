// 汇报生成：项目快照（进度/风险/下一步）+ 叙事总结（Manager agent 可选）+ Markdown 渲染
import { parseOutputLoose } from './runner.js';

export function buildReportSnapshot(project, engine) {
  const tasks = engine.tasks.list();
  const artifacts = engine.artifacts.list();
  const reviews = engine.reviews.list();
  const meetings = engine.meetings.list();

  const approved = tasks.filter((t) => t.state === 'approved').length;
  const total = tasks.length;
  const failedTasks = tasks.filter((t) => t.state === 'failed');
  const openMeetings = meetings.filter((m) => m.status === 'proposed' || m.status === 'escalated');

  const risks = [];
  for (const t of failedTasks) risks.push(`任务 ${t.id}（${t.name}）失败：${t.lastError ?? '未知原因'}`);
  for (const m of openMeetings) risks.push(`会议 ${m.id}（${m.subject}）${m.status === 'escalated' ? '已升级待人工' : '待决策'}`);
  const failedReviews = reviews.filter((r) => r.verdict === 'fail');
  // 仅把"仍未通过"（该任务最近一次审核仍为 fail）的审查失败列为风险；已解决的不再提示
  for (const r of failedReviews) {
    const latest = reviews.filter((rr) => rr.taskId === r.taskId).at(-1);
    if (latest && latest.verdict === 'pass') continue;
    for (const i of r.issues) {
      const s = typeof i === 'string' ? i : i.detail;
      if (s && !risks.some((x) => x === s)) risks.push(`审查发现：${s}`);
    }
  }

  const nextActions = [];
  for (const t of tasks) {
    if (t.state === 'pending') nextActions.push(`等待依赖 → 执行任务 ${t.id}（${t.name}）`);
    if (t.state === 'ready') nextActions.push(`执行任务 ${t.id}（${t.name}）`);
    if (t.state === 'needs_revision') nextActions.push(`修复任务 ${t.id}（${t.name}）`);
  }
  for (const m of openMeetings) nextActions.push(`处理会议 ${m.id}：${m.subject}`);

  return {
    generatedAt: new Date().toISOString(),
    project: {
      name: project.config.project.name,
      description: project.config.project.description,
    },
    summary: {
      total,
      approved,
      progressPct: total > 0 ? Math.round((approved / total) * 100) : 0,
      failed: failedTasks.length,
      pending: tasks.filter((t) => t.state === 'pending').length,
      ready: tasks.filter((t) => t.state === 'ready').length,
      running: tasks.filter((t) => t.state === 'running').length,
      needsRevision: tasks.filter((t) => t.state === 'needs_revision').length,
      openMeetings: openMeetings.length,
      state: engine.summary().state,
    },
    tasks: tasks.map((t) => ({
      id: t.id, name: t.name, agentId: t.agentId ?? null,
      team: Array.isArray(t.team) ? t.team : null,
      teamResult: t.teamResult ?? null,
      state: t.state,
      attempts: t.attempts, escalations: t.escalations, lastError: t.lastError, result: t.result,
    })),
    artifacts: artifacts.map((a) => ({
      id: a.id, name: a.name, version: a.version, state: a.state,
      producer: a.producer, taskId: a.taskId, summary: a.summary, files: a.files.map((f) => f.path),
    })),
    reviews: reviews.map((r) => ({
      id: r.id, taskId: r.taskId, verdict: r.verdict, issues: r.issues, comments: r.comments,
    })),
    meetings: meetings.map((m) => ({
      id: m.id, subject: m.subject, status: m.status, decision: m.decision, taskId: m.taskId,
    })),
    risks,
    nextActions,
  };
}

export function defaultNarrative(snapshot) {
  const s = snapshot.summary;
  const tail = s.progressPct === 100
    ? '全部任务已通过质量门并获批，项目可交付。'
    : s.failed > 0
      ? '存在失败/阻塞任务，请按"风险"与"下一步"处理。'
      : '流程仍在推进，请关注"下一步"。';
  return `当前项目 ${snapshot.project.name} 进度 ${s.progressPct}%（${s.approved}/${s.total}）。${tail}${s.openMeetings > 0 ? ` 有 ${s.openMeetings} 个会议待处理。` : ''}`;
}

export async function buildReport(project, engine, { withNarrative = true } = {}) {
  const snapshot = buildReportSnapshot(project, engine);
  let narrative = defaultNarrative(snapshot);
  if (withNarrative) {
    const manager = engine.agents.byRole('manager')[0];
    if (manager) {
      try {
        const provider = engine.providers.get(manager.provider);
        const user = [
          '# 请撰写项目汇报叙事',
          '基于以下结构化快照，用中文写 3-6 句客观的进度汇报（不要编造数据）：',
          JSON.stringify({ summary: snapshot.summary, risks: snapshot.risks, nextActions: snapshot.nextActions }),
        ].join('\n');
        narrative = (await provider.generate({
          system: manager.prompt,
          user,
          model: manager.model,
          role: 'manager',
          task: null,
        })).trim();
        // 兼容两种输出：纯文本 / 协议 JSON（取 text 或 summary）
        try {
          const parsed = parseOutputLoose(narrative);
          narrative = (parsed?.text ?? parsed?.summary ?? narrative).trim();
        } catch {
          // 非 JSON，保留原文
        }
      } catch (err) {
        narrative = `${defaultNarrative(snapshot)}\n（协调者叙事生成失败：${err.message}）`;
      }
    }
  }
  const report = { ...snapshot, narrative, stats: engine.statsSummary() };
  return { report, markdown: renderMarkdown(report) };
}

function renderAgentCell(t) {
  if (Array.isArray(t.team) && t.team.length) {
    const winner = t.teamResult?.winner;
    return `${t.team.join('+')}${winner ? `（胜出 ${winner}）` : ''}`;
  }
  return t.agentId ?? '—';
}

export function renderMarkdown(report) {
  const s = report.summary;
  const rows = report.tasks
    .map((t) => `| ${t.id} | ${t.name} | ${renderAgentCell(t)} | ${t.state} | ${t.attempts} | ${t.escalations} | ${t.lastError ?? '—'} |`)
    .join('\n');
  return [
    `# 项目汇报：${report.project.name}`,
    '',
    `> ${report.project.description ?? ''}`,
    '',
    `- 生成时间：${report.generatedAt}`,
    `- 状态：**${s.state}**（进度 **${s.progressPct}%**，${s.approved}/${s.total}）`,
    `- 失败：${s.failed}，待修复：${s.needsRevision}，待决策会议：${s.openMeetings}`,
    '',
    '## 叙事总结',
    '',
    report.narrative,
    '',
    '## 任务',
    '',
    '| ID | 名称 | Agent | 状态 | 尝试 | 升级 | 错误 |',
    '|---|---|---|---|---|---|---|',
    rows,
    '',
    '## 产物',
    '',
    report.artifacts.length
      ? report.artifacts.map((a) => `- ${a.id}（${a.state}，生产者 ${a.producer}）— ${a.summary || '无摘要'}`).join('\n')
      : '- （无）',
    '',
    '## 审核记录',
    '',
    report.reviews.length
      ? report.reviews.map((r) => `- ${r.id} [${r.verdict}] 任务 ${r.taskId}${r.issues.length ? ` — 问题：${r.issues.join('；')}` : ''}`).join('\n')
      : '- （无）',
    '',
    '## 会议',
    '',
    report.meetings.length
      ? report.meetings.map((m) => `- ${m.id} [${m.status}] ${m.subject}${m.decision ? ` → 决策（${m.decision.decidedBy}）：${m.decision.decision}` : ''}`).join('\n')
      : '- （无）',
    '',
    '## 风险',
    '',
    report.risks.length ? report.risks.map((r) => `- ${r}`).join('\n') : '- 无',
    '',
    '## 下一步',
    '',
    report.nextActions.length ? report.nextActions.map((n) => `- ${n}`).join('\n') : '- 无',
    '',
    '## 运行统计',
    '',
    ...renderStats(report.stats),
    '',
  ].join('\n');
}

/** 运行统计渲染：调用次数/耗时/输出规模（含 token 计费数据，若有） */
function renderStats(stats) {
  if (!stats || stats.calls === 0) return ['- （无模型调用）'];
  const fmtMs = (ms) => (ms >= 60000 ? `${(ms / 60000).toFixed(1)} 分钟` : `${Math.round(ms)} ms`);
  const lines = [
    `- 模型调用 ${stats.calls} 次，总耗时 ${fmtMs(stats.totalMs)}，总输出 ${stats.totalChars} 字符`,
  ];
  if (stats.totalPromptTokens || stats.totalCompletionTokens) {
    lines.push(`- Token：prompt ${stats.totalPromptTokens}，completion ${stats.totalCompletionTokens}`);
  }
  lines.push('', '| 角色 | 调用 | 耗时 | 输出 |', '|---|---|---|---|');
  for (const r of stats.byRole ?? []) {
    lines.push(`| ${r.key} | ${r.calls} | ${fmtMs(r.ms)} | ${r.chars} 字符 |`);
  }
  return lines;
}