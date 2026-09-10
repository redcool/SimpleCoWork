// 会议与决策：proposed → decided | escalated
export class MeetingStore {
  constructor(bus, opts = {}) {
    this.bus = bus;
    this.opts = opts;
    this.meetings = new Map();
  }

  fromSnapshot(list) {
    this.meetings = new Map((list ?? []).map((m) => [m.id, { ...m, decision: m.decision ? { ...m.decision } : null }]));
  }

  trigger({ subject, reason = '', participants = [], contextRefs = [], taskId = null }) {
    const id = `m-${this.meetings.size + 1}`;
    const now = new Date().toISOString();
    const meeting = {
      id,
      subject,
      reason,
      participants: [...participants],
      contextRefs: [...contextRefs],
      taskId,
      status: 'proposed',
      decision: null,
      createdAt: now,
      updatedAt: now,
    };
    this.meetings.set(id, meeting);
    this.bus.emit('meeting.triggered', { id, subject, taskId });
    return meeting;
  }

  recordDecision({ meetingId, decision, reason = '', decidedBy = '', actions = [] }) {
    const m = this.get(meetingId);
    m.decision = {
      decision: String(decision ?? ''),
      reason: String(reason ?? ''),
      decidedBy,
      actions: (actions ?? []).map((a) => ({ taskId: a.taskId, instruction: String(a.instruction ?? '') })),
      at: new Date().toISOString(),
    };
    m.status = 'decided';
    m.updatedAt = m.decision.at;
    this.bus.emit('meeting.decided', { id: m.id, decision: m.decision });
    return m;
  }

  escalate(meetingId, detail = '') {
    const m = this.get(meetingId);
    m.status = 'escalated';
    m.escalatedReason = String(detail);
    m.updatedAt = new Date().toISOString();
    this.bus.emit('meeting.escalated', { id: m.id, detail });
    return m;
  }

  get(id) {
    const m = this.meetings.get(id);
    if (!m) throw new Error(`未知会议: ${id}`);
    return m;
  }

  list() {
    return [...this.meetings.values()].map((m) => ({ ...m, decision: m.decision ? { ...m.decision } : null }));
  }

  open() {
    return this.list().filter((m) => m.status === 'proposed' || m.status === 'escalated');
  }

  snapshot() {
    return this.list();
  }
}