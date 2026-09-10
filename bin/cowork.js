#!/usr/bin/env node
// CoWork CLI：init / run（--night/--resume）/ serve / status / report / artifacts
import { resolve, join } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createProject, NightShiftLog, startPanelServer } from '../src/index.js';
import { buildReport } from '../src/reporter.js';

const [, , cmd, arg] = process.argv;

const dirOf = (p) => resolve(process.cwd(), p ?? '.');
const storeOf = (p) => join(p, '.cowork');

async function main() {
  try {
    switch (cmd) {
      case 'init': initProject(arg); break;
      case 'run': await runProject(arg); break;
      case 'serve': await servePanel(arg); break;
      case 'status': await readOnly(arg, async (project) => {
        for (const t of project.taskStore.list()) {
          const line = `- ${t.id}\t${t.state.padEnd(14)}\t尝试${t.attempts}/升级${t.escalations}\t${t.name}`;
          console.log(t.lastError ? `${line}\t⚠ ${t.lastError}` : line);
        }
        const s = project.engine.summary();
        console.log(`\n状态: ${s.state}（进度 ${s.approved}/${s.total}）${s.needsHuman.length ? `，待人工: ${s.needsHuman.length}` : ''}`);
      }); break;
      case 'report': await readOnly(arg, async (project) => {
        const { markdown } = await buildReport(project, project.engine, { withNarrative: false });
        console.log(markdown);
      }); break;
      case 'artifacts': await readOnly(arg, async (project) => {
        for (const a of project.artifactStore.list()) {
          console.log(`- ${a.id.padEnd(28)} ${a.state.padEnd(10)} 生产者 ${a.producer.padEnd(10)} 文件: ${a.files.map((f) => f.path).join(', ') || '-'}`);
        }
      }); break;
      default: usage();
    }
  } catch (err) {
    console.error(`\n[cowork] 错误: ${err.message}`);
    process.exit(1);
  }
}

function initProject(p) {
  const dir = dirOf(p ?? 'my-project');
  if (existsSync(join(dir, 'cowork.config.js'))) throw new Error(`${join(dir, 'cowork.config.js')} 已存在`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'cowork.config.js'), TEMPLATE, 'utf8');
  console.log(`已初始化项目目录: ${dir}`);
  console.log('下一步：编辑 cowork.config.js，然后运行  node bin/cowork.js run <dir>');
}

async function runProject(p) {
  const dir = dirOf(p ?? '.');
  const cfg = await loadConfig(join(dir, 'cowork.config.js'));
  // --night：强制进入夜班静默模式（enabled + 覆盖全天时段，时间判定恒真）
  if (process.argv.includes('--night')) {
    cfg.engine.nightShift.enabled = true;
    cfg.engine.nightShift.ranges = [{ start: '00:00', end: '23:59' }];
  }
  const project = createProject({
    config: cfg,
    dir: storeOf(dir),
    persist: true,
    nightShiftLog: cfg.engine.nightShift.enabled
      ? new NightShiftLog({ dir: join(dir, 'night-shift'), timeZone: cfg.engine.nightShift.timezone })
      : null,
  });
  // --resume：从持久化状态继续（人工审批写回后的会议决策会自动带走 waiting/needs_revision 任务）
  if (process.argv.includes('--resume')) {
    if (!project.restoreState()) throw new Error('该目录尚无状态可恢复（缺失 .cowork/state.json），请先完整运行一次');
    project.engine.resumeState();
    console.log('↻ 已从持久化状态恢复并清理运行现场，继续推进…');
  }
  const summary = await project.engine.runUntil({});
  project.saveState();
  const { report, markdown } = await buildReport(project, project.engine, { withNarrative: true });
  mkdirSync(storeOf(dir), { recursive: true });
  writeFileSync(join(storeOf(dir), 'report.md'), markdown, 'utf8');
  writeFileSync(join(storeOf(dir), 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(markdown);
  if (summary.state === 'completed') {
    console.log('\n✔ 全部任务完成。报告已写入 .cowork/report.md');
    process.exitCode = 0;
  } else if (summary.state === 'blocked') {
    console.log('\n⚠ 有事项需人工处理（详细见 .cowork/report.md）。可在 Web 面板审批后恢复: node bin/cowork.js serve <dir>，再 node bin/cowork.js run <dir> --resume');
    process.exitCode = 2;
  } else if (summary.state === 'failed') {
    console.log('\n✘ 存在失败任务（详细见 .cowork/report.md）');
    process.exitCode = 1;
  } else {
    console.log(`\n… 流程未走完（状态 ${summary.state}），可再次运行推进。`);
    process.exitCode = 3;
  }
}

async function servePanel(p) {
  const dir = dirOf(p ?? '.');
  if (!existsSync(join(storeOf(dir), 'state.json'))) {
    throw new Error('该目录尚未运行过（缺少 .cowork/state.json），请先执行 node bin/cowork.js run <dir>');
  }
  const portArg = process.argv.find((a) => /^--port=/.test(a));
  const port = portArg ? Number(portArg.split('=')[1]) : 8765;
  const { url } = await startPanelServer({ projectDir: dir, port, host: '127.0.0.1' });
  console.log(`CoWork 面板已启动: ${url}`);
  console.log('（Ctrl+C 停止；审批写回后请执行 node bin/cowork.js run <dir> --resume 续跑）');
}

async function readOnly(p, fn) {
  const dir = dirOf(p ?? '.');
  const cfg = await loadConfig(join(dir, 'cowork.config.js'));
  const project = createProject({ config: cfg, dir: storeOf(dir), persist: true });
  if (!project.restoreState()) throw new Error('该目录尚未运行过（缺少 .cowork/state.json），请先执行 run');
  await fn(project);
}

function usage() {
  console.log(`CoWork — 多 Agent 协作系统

用法:
  node bin/cowork.js init [dir]                    初始化项目配置模板
  node bin/cowork.js run [dir] [--night] [--resume] 运行协作流程并生成报告
                                                    --night  强制夜班静默模式（问题自动开会+写文档）
                                                    --resume 从 .cowork/state.json 恢复续跑（人工审批后使用）
  node bin/cowork.js serve [dir] [--port=N]        启动 Web 面板（任务/产物/会议审批/夜班文档）
  node bin/cowork.js status [dir]                  查看任务/状态概览
  node bin/cowork.js report [dir]                  生成并打印汇报（读历史状态）
  node bin/cowork.js artifacts [dir]               列出全部产物版本

示例:
  node bin/cowork.js run examples/demo
  node bin/cowork.js run examples/demo --night     # 夜班模式：问题自动开会讨论并写 night-shift/ 文档
  node bin/cowork.js serve examples/demo           # 打开 http://127.0.0.1:8765 审批 / 查看夜班记录`);
}

const TEMPLATE = `// CoWork 项目配置模板
// 运行: node bin/cowork.js run <dir>
export default {
  project: { name: 'my-project', description: '示例项目' },
  providers: {
    // mock：内置确定性模型，离线可用（开发/测试）
    mock: {
      kind: 'mock',
      script: {
        architect: async () => ({
          summary: '完成架构设计',
          text: '分层架构：api / db 分离。',
          actions: [
            { type: 'write', path: 'rules.json', content: JSON.stringify({ rules: [] }) },
          ],
          knownIssues: [], done: true,
        }),
        developer: async (ctx) => ({
          summary: '完成代码实现',
          text: '实现 api 模块。',
          actions: [{ type: 'write', path: 'src/api.js', content: 'module.exports = { run: () => "ok" };\\n' }],
          knownIssues: [], done: true,
        }),
        reviewer: async (ctx) => ({ summary: 'PASS', text: '通过', issues: [], actions: [], done: true }),
        manager: async (ctx) => ({ summary: '完成汇报', text: '# 汇报\\n完成。', actions: [], knownIssues: [], done: true }),
        decision: async (ctx) => ({
          summary: '会议决策：修复并按架构约束实现',
          text: '开发者需按架构约束补齐实现。',
          actions: [{ taskId: ctx.task?.id, instruction: '按架构约束修复产物并重新提交。' }],
          knownIssues: [], done: true,
        }),
      },
    },
    // 真实模型（OpenAI 兼容协议，可对接 Ollama / LM Studio / 本地网关）:
    // local: { kind: 'openai', baseURL: 'http://127.0.0.1:11434/v1', apiKey: '', defaultModel: 'qwen2.5-coder' },
  },
  agents: [
    { id: 'architect', role: 'architect', title: '架构师', provider: 'mock', model: 'mock-arch', prompt: '你是资深架构师：设计清晰架构并把约束形式化为可机检规则。' },
    { id: 'dev', role: 'developer', title: '开发者', provider: 'mock', model: 'mock-dev', prompt: '你是资深开发者：严格按输入产物实现，遵循架构约束。' },
    { id: 'reviewer', role: 'reviewer', title: '审核者', provider: 'mock', model: 'mock-review', prompt: '你是严格审核者：独立核实产物是否满足验收标准。' },
    { id: 'manager', role: 'manager', title: '协调者', provider: 'mock', model: 'mock-manager', prompt: '你是项目协调者：跟进进度、产出决策与汇报。' },
  ],
  workflow: {
    tasks: [
      { id: 't-arch', name: '系统架构设计', agentId: 'architect', outputs: ['architecture'], risk: 'high' },
      { id: 't-dev', name: '代码实现', agentId: 'dev', requires: ['t-arch'], inputs: ['architecture'], outputs: ['code'] },
      { id: 't-report', name: '项目汇报', agentId: 'manager', requires: ['t-dev'], inputs: ['architecture', 'code'], outputs: ['report'], gate: false },
    ],
  },
  engine: { maxConcurrent: 2, maxReviewAttempts: 2, maxEscalations: 1, meeting: { autoDecide: false } },
};
`;

main();