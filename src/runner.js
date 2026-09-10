// Runner：把"任务 + 输入产物 + agent 人设"组装成提示词；解析模型输出；执行 write/exec 动作
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from './exec.js';

const OUTPUT_FORMAT = `
# 输出协议（强制）
只输出一个 JSON 对象，不要任何 JSON 之外的解释、前言或 Markdown 围栏之外的文字：
{"summary":"一句话总结本次成果","text":"主要成果文本（Markdown，作为产物正文）","actions":[{"type":"write","path":"src/xxx.js","content":"文件内容"},{"type":"exec","command":"node test/run.js > out.log 2>&1","outFile":"out.log","expectedExit":0}],"knownIssues":["已知问题"],"done":true}
- summary 必填；text 可为空字符串。
- actions 可为空数组；write 用于创建/修改产物文件；exec 用于运行测试或命令，输出请自行重定向到 outFile（沙箱环境不经管道捕获输出）。
- done 为 false 表示未完成（系统将判为失败重试）。`;

export const DEFAULT_OUTPUT_FORMAT = OUTPUT_FORMAT;

/** 生成给模型的 system / user 消息 */
export function buildPrompt({ agent, task, inputs = [], extra = {} }) {
  const system = agent.prompt || `你是${agent.role}。`;
  const blocks = [
    `# 任务：${task.name}`,
    `任务 ID：${task.id}`,
    `你的角色：${task.agentId}（${agent.role}）`,
    '',
    '## 验收标准',
    ...(task.acceptance.length > 0 ? task.acceptance.map((a) => `- ${a}`) : ['- 无显式验收标准，按角色理解执行']),
  ];
  if (extra.gateIssues?.length) {
    blocks.push('', '## 上一轮审查未通过的问题（必须修复）', ...extra.gateIssues.map((i) => `- ${i}`));
  }
  if (extra.decision) {
    blocks.push('', '## 会议决策（必须执行）', `- 决策：${extra.decision.decision}`, `- 原因：${extra.decision.reason || ''}`);
  }
  if (inputs.length > 0) {
    blocks.push('', '## 输入产物（只读，勿修改）');
    for (const art of inputs) blocks.push(formatInput(art));
  }
  blocks.push(OUTPUT_FORMAT);
  return { system, user: blocks.join('\n') };
}

export function formatInput(art, opts = {}) {
  const maxText = opts.maxText ?? 6000;
  const maxFile = opts.maxFile ?? 4000;
  const head = `\n### 产物 ${art.id}（${art.state}，生产者 ${art.producer}）`;
  const summary = art.summary ? `\n摘要：${art.summary}` : '';
  const text = art.text ? `\n内容：\n\`\`\`markdown\n${truncate(art.text, maxText)}\n\`\`\`` : '';
  const files = Array.isArray(art.files) && art.files.length
    ? '\n文件：' + art.files.map((f) => `\n#### ${f.path}\n\`\`\`\n${truncate(f.content ?? '', maxFile)}\n\`\`\``).join('')
    : '';
  return head + summary + text + files;
}

export function truncate(s, n) {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}\n…[已截断，共 ${t.length} 字符]` : t;
}

/** 解析模型输出（JSON），容错：```json 围栏 / 首个平衡 JSON 对象
 * opts.rawActions=true 时保留 actions 原样（会议决策等自定义 action 结构）
 */
export function parseModelOutput(text, { rawActions = false } = {}) {
  const cleaned = stripFences(String(text ?? '')).trim();
  let obj = null;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    const idx = cleaned.indexOf('{');
    if (idx >= 0) obj = tryParseBalanced(cleaned.slice(idx));
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('模型输出不包含合法 JSON 结果对象');
  }
  const summary = String(obj.summary ?? '');
  const outText = String(obj.text ?? '');
  const knownIssues = Array.isArray(obj.knownIssues) ? obj.knownIssues.map(String) : [];
  const done = obj.done !== false;
  let actions = [];
  if (Array.isArray(obj.actions)) {
    if (rawActions) {
      actions = obj.actions.map((a) => ({ ...a }));
    } else {
      actions = obj.actions.map((a) => {
        if (a?.type === 'write') {
          if (typeof a.path !== 'string' || typeof a.content !== 'string') {
            throw new Error('write 动作需要 string 类型的 path 与 content');
          }
          return { type: 'write', path: normalizePath(a.path), content: a.content };
        }
        if (a?.type === 'exec') {
          if (typeof a.command !== 'string' || !a.command) throw new Error('exec 动作需要非空 command');
          return {
            type: 'exec',
            command: a.command,
            outFile: a.outFile ? normalizePath(a.outFile) : null,
            expectedExit: Number.isInteger(a.expectedExit) ? a.expectedExit : 0,
            cwd: a.cwd ? normalizePath(a.cwd) : null,
          };
        }
        throw new Error(`未知 action 类型: ${JSON.stringify(a?.type)}`);
      });
    }
  }
  return { summary, text: outText, actions, knownIssues, done };
}

/** 执行动作，返回 { files: [{path,content}], execResults: [] } */
export function applyActions(actions, { workDir = null, commandTimeoutMs = 60000 } = {}) {
  const files = [];
  const execResults = [];
  for (const action of actions) {
    if (action.type === 'write') {
      files.push({ path: action.path, content: action.content });
      if (workDir) {
        const abs = join(workDir, action.path);
        mkdirSync(requireDir(abs), { recursive: true });
        writeFileSync(abs, action.content, 'utf8');
      }
    } else if (action.type === 'exec') {
      const cwd = action.cwd ? (workDir ? join(workDir, action.cwd) : action.cwd) : workDir;
      execResults.push(
        runCommand(action.command, { cwd: cwd ?? undefined, timeoutMs: commandTimeoutMs, expectedExit: action.expectedExit }),
      );
    }
  }
  return { files, execResults };
}

function requireDir(filePath) {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx <= 0 ? '.' : filePath.slice(0, idx);
}

function stripFences(t) {
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```\s*$/);
  return m ? m[1] : t;
}

function tryParseBalanced(s) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(0, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function normalizePath(p) {
  return String(p).replace(/\\/g, '/').replace(/^\/+/, '');
}