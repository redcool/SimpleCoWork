// 零依赖 Web 面板服务器（node:http）：
// - GET  /            面板页面
// - GET  /api/state   项目状态摘要（从 .cowork/state.json 读取）
// - GET  /api/night   夜班文档列表；?day=YYYY-MM-DD 返回 markdown
// - POST /api/decisions  人工审批：{meetingId, decision, reason, actions[]} → 写回 state.json
import { createServer as httpCreateServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const UI_HTML = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.html'), 'utf8');

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function buildStateView(projectDir) {
  const st = readJson(join(projectDir, '.cowork', 'state.json'));
  if (!st) return { error: '尚无运行状态：请先 node bin/cowork.js run <dir>' };
  const tasks = st.tasks ?? [];
  const artifacts = st.artifacts ?? [];
  const meetings = st.meetings ?? [];
  const reviews = st.reviews ?? [];
  const approved = tasks.filter((t) => t.state === 'approved').length;
  const humanBlocked = tasks.some((t) => t.meta?.humanBlocked) || tasks.some((t) => t.state === 'waiting');
  const allFinal = tasks.every((t) => ['approved', 'failed', 'cancelled'].includes(t.state));
  const needsHuman = tasks
    .filter((t) => t.meta?.humanBlocked || t.state === 'waiting')
    .map((t) => ({ id: t.id, taskName: t.name, reason: t.lastError ?? '等待会议决策/人工处理' }));
  return {
    project: { name: 'CoWork 项目' },
    summary: {
      state: humanBlocked ? 'blocked' : (allFinal ? (approved === tasks.length ? 'completed' : 'failed') : 'running'),
      total: tasks.length,
      approved,
      progressPct: tasks.length > 0 ? Math.round((approved / tasks.length) * 100) : 0,
      needsHuman,
    },
    tasks: tasks.map((t) => ({
      id: t.id, name: t.name, agentId: t.agentId, state: t.state,
      attempts: t.attempts, escalations: t.escalations, lastError: t.lastError,
    })),
    artifacts: artifacts.map((a) => ({
      id: a.id, name: a.name, version: a.version, state: a.state,
      producer: a.producer, summary: a.summary, files: (a.files ?? []).map((f) => f.path),
    })),
    reviews: reviews.map((r) => ({ id: r.id, taskId: r.taskId, verdict: r.verdict, issues: r.issues })),
    meetings: meetings.map((m) => ({
      id: m.id, subject: m.subject, status: m.status, taskId: m.taskId, decision: m.decision,
    })),
  };
}

function listNightDays(projectDir) {
  const dir = join(projectDir, 'night-shift');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
}

/** 审批写回：把 escalated 会议置为 decided，并把关联任务改回 needs_revision（等待 run --resume 继续） */
export function applyDecision(projectDir, { meetingId, decision, reason = '', actions = [] }) {
  const stateFile = join(projectDir, '.cowork', 'state.json');
  const st = readJson(stateFile);
  if (!st) return { error: '没有可审批的状态' };
  const meeting = st.meetings?.find((m) => m.id === meetingId);
  if (!meeting) return { error: `未知会议 ${meetingId}` };
  if (meeting.status !== 'escalated') return { error: `会议 ${meetingId} 当前状态 ${meeting.status}，不可审批` };
  meeting.status = 'decided';
  meeting.decision = {
    decision: String(decision ?? ''),
    reason: String(reason ?? ''),
    decidedBy: 'human',
    actions: (actions ?? []).map((a) => ({ taskId: a.taskId, instruction: String(a.instruction ?? '') })),
    at: new Date().toISOString(),
  };
  meeting.escalatedReason = undefined;
  // 关联任务：解除人工阻塞，回到 needs_revision（等待 run --resume 推进）
  const task = st.tasks?.find((t) => t.id === meeting.taskId);
  if (task) {
    task.state = 'needs_revision';
    task.meta = { ...(task.meta ?? {}), humanBlocked: false, pendingDecisionId: meetingId };
    task.lastError = `已由人工审批（${meetingId}），等待 run --resume 继续`;
  }
  writeFileSync(stateFile, JSON.stringify(st, null, 2), 'utf8');
  return { ok: true, meetingId, taskId: meeting.taskId ?? null };
}

/** 创建面板服务器；调用方自行 listen */
export function createPanelServer({ projectDir }) {
  return httpCreateServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let body = '';
      if (req.method === 'POST') {
        for await (const chunk of req) body += chunk;
      }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(UI_HTML);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        json(res, 200, buildStateView(projectDir));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/night') {
        const day = url.searchParams.get('day');
        if (day) {
          const file = join(projectDir, 'night-shift', `${day}.md`);
          json(res, existsSync(file) ? 200 : 404, existsSync(file)
            ? { day, markdown: readFileSync(file, 'utf8') }
            : { error: `未找到 ${day}` });
          return;
        }
        json(res, 200, { days: listNightDays(projectDir) });
        return;
      }
      if (req.method === 'POST' && url.pathname === '/api/decisions') {
        let payload;
        try {
          payload = JSON.parse(body || '{}');
        } catch {
          json(res, 400, { error: '请求体不是合法 JSON' });
          return;
        }
        if (!payload.meetingId || !payload.decision) {
          json(res, 400, { error: '缺少 meetingId 或 decision' });
          return;
        }
        const out = applyDecision(projectDir, payload);
        json(res, out.error ? 409 : 200, out);
        return;
      }
      json(res, 404, { error: `未知路径 ${url.pathname}` });
    } catch (err) {
      json(res, 500, { error: err.message });
    }
  });
}

/** 启动服务器：port=0 时由系统分配（测试用） */
export function startPanelServer({ projectDir, port = 8765, host = '127.0.0.1' } = {}) {
  const server = createPanelServer({ projectDir });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ server, port: addr.port, url: `http://${host}:${addr.port}` });
    });
  });
}