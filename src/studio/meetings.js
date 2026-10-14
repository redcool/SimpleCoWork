import { randomUUID } from "node:crypto";

function now() { return new Date().toISOString(); }

/** 经理组会议：提议 → 讨论 → 决定/升级为用户处理 */
export class StudioMeetingStore {
  constructor({ db, eventLog } = {}) { this.db = db; this.events = eventLog; }

  convene({ versionId, runId = null, subject, reason = "", trigger = "supervisor", participants = [] } = {}) {
    if (!subject) throw new Error("会议主题不能为空");
    const id = randomUUID();
    this.db.prepare("INSERT INTO studio_meetings(id,version_id,run_id,subject,reason,trigger_kind,participants,status,discussion,decision,decided_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, versionId, runId, subject, reason, trigger, JSON.stringify(participants || []), "proposed", "[]", null, null, now());
    this.events?.append("studio.meeting.convened", { meetingId: id, versionId, runId, subject, trigger });
    return this.get(id);
  }

  #decode(m) {
    return {
      ...m,
      trigger: m.trigger_kind,
      participants: JSON.parse(m.participants || "[]"),
      discussion: JSON.parse(m.discussion || "[]"),
      decision: m.decision ? JSON.parse(m.decision) : null,
    };
  }

  get(id) {
    const m = this.db.prepare("SELECT * FROM studio_meetings WHERE id=?").get(id);
    if (!m) throw new Error("未知会议");
    return this.#decode(m);
  }

  recordDiscussion(id, entries) {
    this.get(id);
    this.db.prepare("UPDATE studio_meetings SET discussion=? WHERE id=?").run(JSON.stringify(entries || []), id);
    this.events?.append("studio.meeting.discussion", { meetingId: id, count: (entries || []).length });
    return this.get(id);
  }

  recordDecision(id, decision) {
    const m = this.get(id);
    if (m.status === "decided") throw new Error("会议已有决定");
    this.db.prepare("UPDATE studio_meetings SET status='decided',decision=?,decided_by=?,decided_at=? WHERE id=?")
      .run(JSON.stringify(decision || {}), decision?.decidedBy || null, now(), id);
    this.events?.append("studio.meeting.decided", { meetingId: id, decision: decision?.decision });
    return this.get(id);
  }

  escalate(id, reason = "") {
    this.get(id);
    this.db.prepare("UPDATE studio_meetings SET status='escalated',decision=?,decided_at=? WHERE id=?")
      .run(JSON.stringify({ escalated: true, reason }), now(), id);
    this.events?.append("studio.meeting.escalated", { meetingId: id, reason });
    return this.get(id);
  }

  list({ versionId = null, runId = null, status = null, limit = 10 } = {}) {
    const clauses = []; const args = [];
    if (versionId) { clauses.push("version_id=?"); args.push(versionId); }
    if (runId) { clauses.push("run_id=?"); args.push(runId); }
    if (status) { clauses.push("status=?"); args.push(status); }
    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    return this.db.prepare(`SELECT * FROM studio_meetings ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...args, limit).map(m => this.#decode(m));
  }
}

async function askAgent({ provider, agent, system, user }) {
  if (!provider || !agent) return null;
  try {
    const raw = await provider.generate({ system, user, role: agent.role || "participant", model: agent.model }, { detail: true });
    const text = String(raw?.text ?? raw?.content ?? raw ?? "");
    const clean = text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    try { return JSON.parse(clean); } catch { return { opinion: text.slice(0, 500) }; }
  } catch (error) {
    return { opinion: `(参与失败: ${error.message})` };
  }
}

/** 运行一次经理组会议：参会者发言 → 主持人（manager 优先）形成决定。无法形成决定时升级。 */
export async function runManagerMeeting({ store, meeting, provider = null, agents = {}, eventLog = null, maxParticipants = 5 } = {}) {
  const participants = (meeting.participants || []).map(p => agents[p.id] || p).slice(0, maxParticipants);
  const discussion = [];
  for (const p of participants) {
    const answer = await askAgent({
      provider, agent: p,
      system: p.prompt || `你是${p.role || "与会者"}。`,
      user: `会议主题：${meeting.subject}\n背景：${meeting.reason || ""}\n请给出你的分析和建议，只输出 JSON：{"opinion":"","risk":"","suggest":""}`,
    });
    discussion.push({ actorId: p.id, role: p.role || "participant", ...(answer || { opinion: "(无响应)" }) });
  }
  store.recordDiscussion(meeting.id, discussion);
  const chair = participants.find(p => p.role === "manager") || participants[0];
  if (!chair || !provider) {
    store.escalate(meeting.id, "没有可用的主持人或 Provider，无法形成决定");
    return { meeting: store.get(meeting.id), escalated: true, decision: null };
  }
  const answer = await askAgent({
    provider, agent: chair,
    system: chair.prompt || "你是会议主持人（经理组）。",
    user: `会议主题：${meeting.subject}\n背景：${meeting.reason || ""}\n讨论记录：${JSON.stringify(discussion)}\n请形成决定，只输出 JSON：{"decision":"continue|replan|retry|escalate","summary":"","reason":"","actions":[{"type":"","taskId":""}]}`,
  });
  const decision = answer && typeof answer === "object" && !Array.isArray(answer) ? answer : null;
  if (!decision || decision.decision === "escalate" || !Array.isArray(decision.actions)) {
    store.escalate(meeting.id, decision?.summary || "会议未能形成可执行决定");
    return { meeting: store.get(meeting.id), escalated: true, decision };
  }
  store.recordDecision(meeting.id, { ...decision, decidedBy: chair.id });
  eventLog?.append("studio.meeting.summary", { meetingId: meeting.id, decision: decision.decision, participants: discussion.length });
  return { meeting: store.get(meeting.id), escalated: false, decision };
}
