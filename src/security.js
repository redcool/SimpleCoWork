// 安全基元：路径越界防护、符号链接防护、原子写、夜班日期校验、shell 命令白名单
// 统一入口，供 runner / exec / server / bin 复用（也便于 security.test.js 直接覆盖测试）
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { lstatSync, writeFileSync, renameSync, rmSync, existsSync } from 'node:fs';

/** 夜班文档命名只能是 YYYY-MM-DD（/api/night 路径穿越防护；含月份/日语义范围校验） */
export const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** 若 p 解析后仍在 base 目录内则返回其绝对路径，否则抛错（防 ../ 与绝对路径逃逸、盘符穿越） */
export function safeJoin(base, p) {
  const abs = resolve(base, String(p));
  const rel = relative(base, abs);
  if (rel.startsWith('..') || isAbsolute(rel) || rel === '') {
    // rel === '' 表示指向 base 本身（write 到目录路径），同样不允许
    throw new Error(`路径越界或非法: ${p}`);
  }
  return abs;
}

/**
 * 逐级检查 base→target 的路径：任何已存在的组件或最终目标是符号链接即拒绝。
 * 防止 write / ship 跟随链接把内容写到项目目录之外（符号链接绕过）。
 */
export function assertNoSymlink(base, target) {
  const abs = safeJoin(base, target);
  const chain = [];
  let cur = dirname(abs);
  for (;;) {
    chain.unshift(cur);
    if (cur === base || cur === dirname(base)) break;
    const next = dirname(cur);
    if (next === cur) break;
    cur = next;
  }
  for (const d of chain) {
    if (existsSync(d)) {
      let st = null;
      try {
        st = lstatSync(d);
      } catch {
        continue; // 并发删除等竞态，按不存在处理
      }
      if (st.isSymbolicLink()) throw new Error(`路径含符号链接，拒绝写入: ${d === base ? base : relative(base, d)}`);
      if (!st.isDirectory()) throw new Error(`路径组件不是目录: ${relative(base, d)}`);
    }
  }
  if (existsSync(abs)) {
    let st = null;
    try {
      st = lstatSync(abs);
    } catch {
      return abs;
    }
    if (st.isSymbolicLink()) throw new Error(`目标为符号链接，拒绝写入: ${relative(base, abs)}`);
  }
  return abs;
}

/** 原子写：先写临时文件再 rename（避免崩溃/并发读写出半截 state.json） */
export function atomicWrite(file, data) {
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmp, data, 'utf8');
  try {
    renameSync(tmp, file);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      /* 忽略清理失败 */
    }
    throw err;
  }
}

/** 提取 shell 命令的首个 token（白名单判定用；重定向/管道等留在 shell 内），支持引号包裹的可执行路径 */
export function firstTokenOf(command) {
  const t = String(command ?? '').trim();
  if (!t) return '';
  if (t.startsWith('"')) {
    const m = t.match(/^"((?:[^"\\]|\\.)*)"/);
    if (m) return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  const m = t.match(/^([^\s|;&<>]+)/);
  return m ? m[1] : '';
}

/** 白名单键：可执行文件 basename（去 .exe/.cmd/.bat），如 node.exe → node */
export function commandKeyOf(token) {
  const base = String(token ?? '').split(/[\\/]/).pop() || '';
  return base.replace(/\.(exe|cmd|bat)$/i, '').toLowerCase();
}

/** 命令白名单：allowAll=true 时放行一切（旧行为，文档标注风险）；否则首命令 basename 必须命中 allow */
export function isAllowedCommand(command, { allow, allowAll } = {}) {
  if (allowAll === true) return true;
  const tok = firstTokenOf(command);
  if (tok === '') return false;
  const key = commandKeyOf(tok);
  return Array.isArray(allow) && allow.map((a) => String(a).toLowerCase()).includes(key);
}