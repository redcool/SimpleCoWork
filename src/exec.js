// 子进程执行：stdio inherit（规避沙箱对捕获管道输出的限制 EPERM），结果只取退出码
// 安全：shell:true 由 engine.commands 白名单约束（默认仅 node/npm/npx/git；allowAll 明确开启才放行任意命令）
import { spawnSync } from 'node:child_process';
import { isAllowedCommand, firstTokenOf } from './security.js';

/**
 * 执行一条命令并返回退出码。
 * 注意：不经管道捕获输出（沙箱限制）；如需留档，请在命令里用 shell 重定向写文件。
 * commandPolicy: { allow: ['node','npm',...], allowAll: false } —— allow 未命中或 allowAll 未开即拒绝（denied:true）
 */
export function runCommand(command, { cwd, timeoutMs = 60000, expectedExit = 0, commandPolicy = null } = {}) {
  const policy = commandPolicy ?? {};
  if (!isAllowedCommand(command, policy)) {
    return {
      command,
      ok: false,
      exitCode: null,
      denied: true,
      error: `命令未在 engine.commands 白名单中（首命令: ${firstTokenOf(command) || '(空)'}）；如需放行请配置 engine.commands.allow 或 allowAll:true`,
      elapsedMs: 0,
      cwd: cwd ?? process.cwd(),
    };
  }
  const started = Date.now();
  let result;
  try {
    result = spawnSync(command, { cwd, shell: true, stdio: 'inherit', timeout: timeoutMs });
  } catch (err) {
    return { command, ok: false, exitCode: null, error: err.message, elapsedMs: Date.now() - started, cwd };
  }
  const exitCode = result.status; // 超时被杀时为 null
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  return {
    command,
    exitCode,
    ok: !timedOut && exitCode === expectedExit,
    timedOut: !!timedOut,
    error: result.error ? String(result.error.message ?? '') : null,
    elapsedMs: Date.now() - started,
    cwd: cwd ?? process.cwd(),
  };
}