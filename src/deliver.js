// ship 核心：把已批准产物安全写入项目目录（safeJoin + 符号链接防护），供 bin/ship 与测试复用
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertNoSymlink } from './security.js';

function requireDir(filePath) {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return idx <= 0 ? '.' : filePath.slice(0, idx);
}

/**
 * 把产物文件写入 dir。
 * 安全：每个文件路径经 assertNoSymlink（safeJoin 防 ../ 与绝对路径逃逸 + 逐级 lstat 防符号链接绕过）。
 * 返回 { paths, count }——paths 为写入的相对路径（去重）。
 */
export function writeApprovedArtifacts(dir, artifacts) {
  const written = [];
  const seen = new Set();
  for (const a of artifacts) {
    for (const f of (a.files ?? [])) {
      const abs = assertNoSymlink(dir, f.path);
      mkdirSync(requireDir(abs), { recursive: true });
      writeFileSync(abs, String(f.content ?? ''), f.encoding ?? 'utf8');
      if (!seen.has(f.path)) {
        seen.add(f.path);
        written.push(f.path);
      }
    }
  }
  return { paths: written, count: seen.size };
}