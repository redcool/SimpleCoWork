// 夜班静默模式：
// 1) 时间段判定（HH:MM 字符串、支持跨零点、时区换算，零依赖 Intl）
// 2) 夜班事件日志与文档渲染（night-shift/YYYY-MM-DD.md：问题 / 分析过程 / 决定）
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** "HH:MM" → 当日分钟数（0-1439） */
export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) throw new Error(`时间段格式非法: "${hhmm}"（应为 HH:MM，如 22:00）`);
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) throw new Error(`时间段超出范围: "${hhmm}"`);
  return h * 60 + mi;
}

/** 单个时间段是否覆盖某分钟；支持跨天（start > end 表示跨零点） */
export function rangeCovers(range, minutes) {
  const s = toMinutes(range.start);
  const e = toMinutes(range.end);
  if (s <= e) return minutes >= s && minutes <= e;
  return minutes >= s || minutes <= e;
}

/** 给定日期在目标时区下的当日分钟数（hour12:false 的 en-GB 可能返回 24:xx，需归零） */
export function minutesInZone(date, timeZone = 'UTC') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let h = get('hour');
  if (h === 24) h = 0;
  return h * 60 + get('minute');
}

/** 目标时区下的日期键 YYYY-MM-DD */
export function dateKey(date, timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** 当前（可注入的）时间是否落在任一夜班时段 */
export function isInNightShift(ranges, date, timeZone = 'UTC') {
  const minutes = minutesInZone(date, timeZone);
  return (ranges ?? []).some((r) => rangeCovers(r, minutes));
}

/** 夜班记录：按"目标时区的那一天"聚合事件，可渲染/落盘 Markdown */
export class NightShiftLog {
  /** @param {{dir?:string|null, timeZone?:string, clock?:()=>Date}} opts */
  constructor({ dir = null, timeZone = 'Asia/Shanghai', clock = () => new Date() } = {}) {
    this.dir = dir;
    this.timeZone = timeZone;
    this.clock = clock;
    this.days = new Map(); // YYYY-MM-DD -> events[]
  }

  /** 追加一个事件：kind=issue|decision */
  add({ date, kind = 'issue', title, problem = [], analysis = [], decision = '', decisionsBy = '', actions = [] }) {
    const dt = date ?? this.clock();
    const key = dateKey(dt, this.timeZone);
    const evt = {
      ts: dt.toISOString(),
      kind,
      title: String(title ?? ''),
      problem: [...problem],
      analysis: [...analysis],
      decision: String(decision ?? ''),
      decisionsBy: String(decisionsBy ?? ''),
      actions: (actions ?? []).map((a) => ({ taskId: a.taskId, instruction: String(a.instruction ?? '') })),
    };
    const day = this.days.get(key) ?? [];
    day.push(evt);
    this.days.set(key, day);
    if (this.dir) this.writeDay(key);
    return evt;
  }

  dayEvents(key) {
    return this.days.get(key) ?? [];
  }

  listDays() {
    return [...this.days.keys()];
  }

  eventCount() {
    return [...this.days.values()].reduce((n, arr) => n + arr.length, 0);
  }

  renderDay(key) {
    const events = this.dayEvents(key);
    const resolved = events.filter((e) => e.kind === 'decision').length;
    const lines = [
      `# 夜班记录 ${key}`,
      '',
      `> 时区 ${this.timeZone}；本夜班共 ${events.length} 个问题，${resolved} 个已由 agents 会议解决。`,
      '',
    ];
    events.forEach((e, i) => {
      lines.push(`## 事件 ${i + 1}：${e.title}`, '');
      lines.push('### 问题', '');
      if (e.problem.length === 0) lines.push('- （无描述）');
      for (const p of e.problem) lines.push(`- ${p}`);
      lines.push('', '### 分析过程', '');
      if (e.analysis.length === 0) lines.push('- （无讨论记录）');
      for (const a of e.analysis) lines.push(`- ${a}`);
      lines.push('', '### 决定', '');
      if (e.kind === 'decision' && e.decision) {
        lines.push(`- 决策：${e.decision}${e.decisionsBy ? `（决策者 ${e.decisionsBy}）` : ''}`);
        if (e.actions.length > 0) {
          for (const a of e.actions) lines.push(`- 分工：${a.taskId} ← ${a.instruction}`);
        } else {
          lines.push('- 无补救分工。');
        }
      } else {
        lines.push('- 未解决，待人工复核。');
      }
      lines.push('');
    });
    return lines.join('\n');
  }

  writeDay(key) {
    if (!this.dir) return;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, `${key}.md`), this.renderDay(key), 'utf8');
  }
}