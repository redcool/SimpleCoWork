// CoWork 示例项目：架构→双开发（并行）→质量门→审核→会议（自动决策补救）→汇报
// 全程使用内置 mock 模型，离线可跑：
//   node bin/cowork.js run examples/demo
//   node bin/cowork.js status examples/demo
//   node bin/cowork.js report examples/demo
// 设计意图：t-dev-api 第一版故意违反架构规则（含 TODO、缺失 module.exports），
// 触发质量门失败 → 重试上限(1) → 会议(自动决策) → 补救重试 → 通过。
// t-dev-db 与 t-dev-api 并行执行（maxConcurrent=2），演示"异步、互不干扰"。
export default {
  project: {
    name: 'demo-app',
    description: '示例：架构→双路开发→Oracle 一致性检查→审核→会议决策→协调者汇报（全部 mock，离线可跑）',
  },

  providers: {
    mock: {
      kind: 'mock',
      script: {
        // 架构师：产出架构文档 + 可机检规则 rules.json；夜班讨论时给出规则视角意见
        architect: async (ctx) => {
          if (ctx.mode === 'discuss') {
            return {
              summary: '按架构规则复核：R1（module.exports）与 R2（无 TODO）未满足，修复方向是补齐导出并清理 TODO。',
              text: '架构规则是本项目的验收底线。当前实现违反 R1/R2，建议开发者按 rules.json 逐条修复并重跑质量门。',
              actions: [], knownIssues: [], done: true,
            };
          }
          return {
            summary: '完成分层架构设计并形式化 4 条可机检规则',
          text: '# Demo App 架构\n\n- 分层：api 与 db 分离\n- api 模块必须导出 module.exports\n- api.js 不允许遗留 TODO\n- 数据层文件 src/db.js 必须存在\n- 代码必须语法合法',
          actions: [
            {
              type: 'write',
              path: 'architecture.md',
              content: '# Demo App 架构\n\nAPI 与数据层分离；api.js 必须导出 module.exports；不允许 TODO 残留；db.js 必须存在；代码语法必须合法。',
            },
            {
              type: 'write',
              path: 'rules.json',
              content: JSON.stringify({
                rules: [
                  { id: 'R1', severity: 'high', type: 'contains', file: 'src/api.js', text: 'module.exports', ifPresent: true, description: 'api 模块必须导出 module.exports' },
                  { id: 'R2', severity: 'medium', type: 'not_contains', file: 'src/api.js', text: 'TODO', ifPresent: true, description: 'api 模块不允许遗留 TODO' },
                  { id: 'R3', severity: 'medium', type: 'file_exists', file: 'src/db.js', description: '数据层文件必须存在' },
                  { id: 'R4', severity: 'high', type: 'js_syntax', file: 'src/api.js', ifPresent: true, description: 'api.js 语法必须合法' },
                ],
              }, null, 2),
            },
          ],
          knownIssues: [],
          done: true,
        };
        },

        // 开发者：按任务分派；t-dev-api 第一版故意违规以演示质量门与会议；夜班讨论给出修复承诺
        developer: async (ctx) => {
          if (ctx.mode === 'discuss') {
            return {
              summary: '承认违规并给出修复方案：补上 module.exports、清除 TODO，重新提交 src/api.js。',
              text: '第一版遗留 TODO 且未导出 module.exports，违反了 R1/R2。修复计划：提供完整实现并去掉 TODO 注释，然后重跑质量门与审核。',
              actions: [], knownIssues: [], done: true,
            };
          }
          if (ctx.task?.id === 't-dev-api') {
            const attempt = ctx.attempt ?? 1;
            if (attempt === 1) {
              return {
                summary: '第一版 api.js（遗留 TODO 且未导出 module.exports，违反架构约束）',
                text: '第一版实现，待修复。',
                actions: [
                  {
                    type: 'write',
                    path: 'src/api.js',
                    content: '// TODO: 未完成的 API 模块\nconst api = {};\n', // 违反 R1（缺 module.exports）+ R2（TODO 残留）
                  },
                ],
                knownIssues: ['TODO 残留', 'R1/R2 架构约束未满足（演示用）'],
                done: true,
              };
            }
            return {
              summary: '按会议决策修复 api.js：导出 module.exports 且无 TODO',
              text: '修复版实现。',
              actions: [
                {
                  type: 'write',
                  path: 'src/api.js',
                  content: 'const api = { ping: () => "pong" };\nmodule.exports = api;\n',
                },
              ],
              knownIssues: [],
              done: true,
            };
          }
          if (ctx.task?.id === 't-dev-db') {
            return {
              summary: '实现数据层 db.js',
              text: '数据层实现。',
              actions: [
                {
                  type: 'write',
                  path: 'src/db.js',
                  content: 'const db = { connect: () => console.log("connected") };\nmodule.exports = db;\n',
                },
              ],
              knownIssues: [],
              done: true,
            };
          }
          return { summary: '未知开发任务', text: '', actions: [], knownIssues: ['未知任务'], done: false };
        },

        // 审核者：依据质量门数据判定（与引擎内置一致性检查一致，保证可复现）；夜班讨论给出核验意见
        reviewer: async (ctx) => {
          if (ctx.mode === 'discuss') {
            return {
              summary: '须按质量门独立复核：确认修复后可放行，但重申不得只信开发者自述。',
              text: '审核立场：以 Oracle 规则与自动化校验为准。当前问题由高严重性规则触发，开发者修复后必须重跑规则与语法校验，通过后才 approve。',
              actions: [], issues: [], done: true,
            };
          }
          const checks = ctx.gate?.checks ?? [];
          const highFail = checks.filter((c) => c.applicable !== false && c.severity === 'high' && !c.passed);
          if (highFail.length > 0) {
            return {
              summary: 'FAIL: 高严重性约束未满足',
              text: highFail.map((c) => `- [${c.ruleId}] ${c.detail}`).join('\n'),
              issues: highFail.map((c) => c.detail),
              actions: [],
              done: true,
            };
          }
          const medFail = checks.filter((c) => c.applicable !== false && c.severity === 'medium' && !c.passed);
          return {
            summary: 'PASS',
            text: medFail.length > 0 ? '通过，但有中等级别提醒：\n' + medFail.map((c) => `- ${c.detail}`).join('\n') : '全部检查通过',
            issues: [],
            actions: [],
            done: true,
          };
        },

        // 协调者：汇报任务 + 叙事生成 + 夜班讨论意见
        manager: async (ctx) => {
          if (ctx.mode === 'discuss') {
            return {
              summary: '协调视角：会议共识是让 t-dev-api 按架构规则修复后重新提交，我来跟进并记录夜班文档。',
              text: '建议立即修复 R1/R2 违规项，修复后重跑质量门；本夜班文档会后写入 night-shift/。',
              actions: [], knownIssues: [], done: true,
            };
          }
          if (ctx.task?.id === 't-report') {
            const lines = (ctx.inputs ?? []).map((a) => `- ${a.id}（${a.state}）— ${a.summary}`);
            return {
              summary: '完成项目汇报',
              text: `# 项目汇报\n\n## 交付产物\n${lines.join('\n')}\n\n## 结论\n架构、实现与质量门全部通过，示例项目可交付。`,
              actions: [{ type: 'write', path: 'report.md', content: '# 项目汇报\n\n示例演示完成。' }],
              knownIssues: [],
              done: true,
            };
          }
          // 叙事：从用户消息中的结构化快照提取并生成可读汇报
          try {
            const idx = ctx.user.indexOf('{"summary"');
            const data = JSON.parse(ctx.user.slice(idx));
            const s = data.summary ?? {};
            const parts = [
              `本项目 "${ctx.task?.name ?? '汇报'}" 当前进度 ${s.progressPct ?? 0}%（${s.approved ?? 0}/${s.total ?? 0}）。`,
              `失败任务 ${s.failed ?? 0} 个，待修复 ${s.needsRevision ?? 0} 个，待决策会议 ${s.openMeetings ?? 0} 个。`,
            ];
            if ((data.nextActions ?? []).length > 0) parts.push(`下一步：${data.nextActions.slice(0, 3).join('；')}。`);
            if ((data.risks ?? []).length > 0) parts.push(`主要风险：${data.risks.slice(0, 3).join('；')}。`);
            if (s.progressPct === 100) parts.push('全部任务已通过质量门并获批，项目可交付。');
            return { summary: parts.join(''), text: parts.join('\n'), actions: [], knownIssues: [], done: true };
          } catch {
            return { summary: '协调者默认回应', text: '', actions: [], knownIssues: [], done: true };
          }
        },

        // 会议决策：生成补救分工
        decision: async (ctx) => ({
          summary: '会议决策：修复 api.js 以符合架构约束',
          text: '经评估，t-dev-api 第一版违反 R1/R2：需导出 module.exports 且不得遗留 TODO。',
          actions: [
            {
              taskId: 't-dev-api',
              instruction: '确保 src/api.js 包含 module.exports 且不含 TODO，并重新通过架构规则校验。',
            },
          ],
          knownIssues: [],
          done: true,
        }),
      },
    },
  },

  agents: [
    { id: 'architect', role: 'architect', title: '架构师', provider: 'mock', model: 'mock-arch', prompt: '你是资深架构师：负责设计架构并把约束形式化为可机检规则。' },
    { id: 'dev', role: 'developer', title: '开发者', provider: 'mock', model: 'mock-dev', prompt: '你是资深开发者：严格按架构产物实现，遵循全部约束。' },
    { id: 'reviewer', role: 'reviewer', title: '审核者', provider: 'mock', model: 'mock-review', prompt: '你是严格审核者：独立核实产物是否满足验收标准与架构约束。' },
    { id: 'manager', role: 'manager', title: '协调者', provider: 'mock', model: 'mock-manager', prompt: '你是项目协调者：跟进进度、识别风险、产出决策与汇报。' },
  ],

  workflow: {
    tasks: [
      {
        id: 't-arch',
        name: '系统架构设计',
        agentId: 'architect',
        outputs: ['architecture'],
        risk: 'high',
        acceptance: ['产出 architecture.md 与 rules.json，规则可被 Oracle 机检'],
      },
      {
        id: 't-dev-api',
        name: '实现 API 模块',
        agentId: 'dev',
        requires: ['t-arch'],
        inputs: ['architecture'],
        outputs: ['code-api'],
        risk: 'high',
        acceptance: ['src/api.js 必须导出 module.exports', '不得遗留 TODO', '通过架构规则校验'],
      },
      {
        id: 't-dev-db',
        name: '实现数据层',
        agentId: 'dev',
        requires: ['t-arch'],
        inputs: ['architecture'],
        outputs: ['code-db'],
        risk: 'medium',
        acceptance: ['src/db.js 必须存在并发语法合法'],
      },
      {
        id: 't-report',
        name: '项目汇报',
        agentId: 'manager',
        requires: ['t-dev-api', 't-dev-db'],
        inputs: ['architecture', 'code-api', 'code-db'],
        outputs: ['report'],
        gate: false,
        risk: 'low',
        acceptance: ['产出汇报文本'],
      },
    ],
  },

  engine: {
    maxConcurrent: 2,
    maxReviewAttempts: 1, // 第一次审查失败即触发会议（演示会议流程）
    maxEscalations: 1,
    agentTimeoutMs: 30000,
    commandTimeoutMs: 30000,
    meeting: { autoDecide: true }, // 演示自动会议决策（白天）
    // 夜班静默模式：enabled=true 时，夜班时段内（22:00-08:30 跨天，Asia/Shanghai）遇问题不阻塞人工，
    // agents 自动开会多角色讨论 → 归纳决策 → 写入 <项目目录>/night-shift/YYYY-MM-DD.md（问题/分析过程/决定）
    // 手动体验：node bin/cowork.js run examples/demo --night（无需改配置，强制夜班）
    nightShift: {
      enabled: false,
      timezone: 'Asia/Shanghai',
      ranges: [{ start: '22:00', end: '08:30' }],
    },
  },
};