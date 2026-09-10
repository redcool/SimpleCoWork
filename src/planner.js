// 规划器：用户给一个主题 → agents（默认 planner 角色，无则回退架构师）分析拆解为
// 模块任务 DAG（任务/角色/依赖/验收/架构规则）→ 生成 plan.json（可机检）与 plan.md（人类可读）
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseModelOutput } from './runner.js';

/** 主题 → 文件系统友好的 slug */
export function slugOf(theme) {
  const s = String(theme ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || 'plan';
}

/** 把 plan.modules 规范化为任务列表（角色→agentId、依赖→输入产物、验收→verify、校验环形依赖） */
export function normalizePlanTasks(plan, config) {
  const modules = Array.isArray(plan.modules) ? plan.modules : [];
  if (modules.length === 0) throw new Error('规划未产生任何模块（modules 为空）');

  // 角色 → agentId：plan 模块的 role 字段映射到配置中同角色的第一个 agent
  const roleToAgent = (role) => {
    const hit = config.agents.find((a) => a.role === role);
    if (hit) return hit.id;
    const fallback = config.agents[0];
    if (fallback) return fallback.id;
    throw new Error(`配置中没有可用 agent，无法为模块角色 ${role ?? '?'} 分配执行者`);
  };

  const outName = (m) => (Array.isArray(m.outputs) && m.outputs.length ? m.outputs[0] : `${m.id}-out`);
  const outOf = new Map(modules.map((m) => [m.id, outName(m)]));

  // 依赖校验：requires 必须引用既有模块 id
  for (const m of modules) {
    for (const r of m.requires ?? []) {
      if (!modules.some((x) => x.id === r)) throw new Error(`模块 ${m.id} 依赖 ${r}，但规划中没有该模块`);
    }
  }
  // 环形依赖校验（DFS 三色）
  const color = new Map(modules.map((m) => [m.id, 0]));
  const parents = new Map(modules.map((m) => [m.id, null]));
  const visit = (id) => {
    color.set(id, 1);
    const m = modules.find((x) => x.id === id);
    for (const r of m?.requires ?? []) {
      if (color.get(r) === 0) {
        parents.set(r, id);
        visit(r);
      } else if (color.get(r) === 1) {
        throw new Error(`模块依赖存在环：${id} -> ${r}`);
      }
    }
    color.set(id, 2);
  };
  for (const m of modules) if (color.get(m.id) === 0) visit(m.id);

  const tasks = modules.map((m) => {
    const task = {
      id: m.id,
      name: m.name || m.id,
      agentId: roleToAgent(m.role),
      requires: [...(m.requires ?? [])],
      inputs: (m.requires ?? []).map((r) => outOf.get(r)).filter(Boolean),
      outputs: Array.isArray(m.outputs) && m.outputs.length ? [...m.outputs] : [outName(m)],
      risk: m.risk ?? 'medium',
    };
    if (Array.isArray(m.acceptance) && m.acceptance.length > 0) task.verify = m.acceptance;
    return task;
  });
  return tasks;
}

/** 渲染人类可读计划文档（中文） */
export function renderPlanMarkdown(plan, config) {
  const tasks = plan.tasks ?? [];
  const lines = [
    `# 协作计划：${plan.theme}`,
    '',
    `> 生成时间：${plan.generatedAt ?? ''}；由 ${plan.plannerAgent ?? '—'} 规划。`,
    '',
    plan.summary ? `## 规划摘要\n\n${plan.summary}\n` : '',
    '## 模块拆解',
    '',
    '| 任务 | 模块 | 角色 | 依赖 | 输出产物 | 验收要点 |',
    '|---|---|---|---|---|---|',
    ...tasks.map((t) => {
      const acc = Array.isArray(t.verify) && t.verify.length
        ? t.verify.map((r) => r.description || r.detail || `${r.type}:${r.file}`).join('；')
        : '—';
      return `| ${t.id} | ${t.name} | ${t.agentId} | ${(t.requires ?? []).join(', ') || '—'} | ${(t.outputs ?? []).join(', ')} | ${acc} |`;
    }),
    '',
    '## 架构规则（跨模块一致性 / Oracle 校验）',
    '',
  ];
  const rules = plan.rules ?? [];
  if (rules.length === 0) lines.push('- （无）');
  for (const r of rules) {
    const extra = r.text ? `（${r.text}）` : '';
    lines.push(`- [${r.severity}] ${r.id ?? ''} ${extra}${r.description || `${r.type} ${r.file}`}`);
  }
  lines.push('',
    '## 执行',
    '',
    `- 运行：node bin/cowork.js run <项目目录> --plan=plan/${slugOf(plan.theme)}.json`,
    `- 全部模块通过质量门后视为完成；未通过自动重试/会议，人工可在 Web 面板审批。`,
    '',);
  return lines.join('\n');
}

/** 执行一次规划：调用 planner/architect agent 生成模块拆分（异步，可注入 clock 无关）
 * @returns {Promise<{plan:object, tasks:object[], markdown:string, files:string[]}>}
 */
export async function runPlanner(project, { theme, role = 'planner', outDir = null }) {
  if (!theme || !String(theme).trim()) throw new Error('缺少主题：用法 node bin/cowork.js plan <dir> "主题"');
  const agent = project.agentRegistry.byRole(role)[0] ?? project.agentRegistry.byRole('architect')[0];
  if (!agent) throw new Error(`配置中没有 ${role} 或 architect 角色的 agent，无法规划`);
  const provider = project.providerRegistry.get(agent.provider);
  const user = [
    `# 项目主题\n\n${String(theme).trim()}`,
    '',
    '请把主题拆解为可并行开发的模块任务 DAG，并给出跨模块架构规则。输出严格 JSON（不得输出其它解释）：',
    '{',
    '  "summary": "一句话规划结论",',
    '  "text": "模块拆解与依赖说明",',
    '  "modules": [',
    '    { "id": "m-1", "name": "模块名", "role": "developer", "requires": ["m-0"], "outputs": ["模块-输出名"],',
    '      "acceptance": [ { "id": "A1", "severity": "high", "type": "contains|file_exists|not_contains|regex|js_syntax", "file": "src/xxx.js", "text": "期望内容", "description": "验收描述" } ] }',
    '  ],',
    '  "rules": [ 跨模块 Oracle 架构规则，格式同 acceptance。可为 [] ],',
    '  "actions": [], "knownIssues": [], "done": true',
    '}',
    '- 依赖用 requires 引用其他模块 id；无依赖则为 []。',
    '- outputs 至少一个产物名；验收 acceptance 与规则可留 []。',
    '- 模块粒度要可独立开发验证，总量 2-8 个为宜。',
    '- 重要：acceptance/rules 是"跨产物校验"，只针对特定文件的内容类规则（contains/not_contains/regex/js_syntax）请设置 "ifPresent": true，避免其它模块的产物因缺少该文件被误判失败；真正要求全部产物都满足的规则才不设 ifPresent。',
  ].join('\n');
  const raw = await provider.generate({
    system: agent.prompt,
    user,
    model: agent.model,
    role,
    mode: 'plan',
    task: { id: 'plan', name: theme },
  });
  const parsed = parseModelOutput(raw, { rawActions: true, keepRaw: true });
  if (!parsed.done) throw new Error(`规划 agent 返回 done=false：${parsed.summary || '未完成'}`);
  const modules = Array.isArray(parsed.raw?.modules) ? parsed.raw.modules : [];
  const rules = Array.isArray(parsed.raw?.rules) ? parsed.raw.rules : [];
  const plan = {
    theme: String(theme).trim(),
    summary: parsed.summary,
    text: parsed.text,
    plannerAgent: agent.id,
    generatedAt: new Date().toISOString(),
    modules,
    rules,
    tasks: [],
  };
  plan.tasks = normalizePlanTasks(plan, project.config);
  const markdown = renderPlanMarkdown(plan, project.config);

  const files = [];
  const dir = outDir ? join(outDir, slugOf(theme)) : null;
  if (dir) {
    mkdirSync(dir, { recursive: true });
    const json = join(dir, 'plan.json');
    const md = join(dir, 'plan.md');
    writeFileSync(json, JSON.stringify(plan, null, 2), 'utf8');
    writeFileSync(md, markdown, 'utf8');
    files.push(json, md);
  }
  return { plan, tasks: plan.tasks, markdown, files };
}