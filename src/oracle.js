// Oracle：把架构预期（规则）与产物文件对照，产出可审计的检查结果
// 进程内完成（含 JS 语法校验 via vm.Script），不依赖子进程
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export function checksum(content) {
  return createHash('sha256').update(String(content ?? '')).digest('hex');
}

/** 仅对"内容类"规则生效：规则声明 ifPresent 时，产物不含该文件则跳过判定 */
const CONTENT_RULES = new Set(['contains', 'not_contains', 'regex', 'js_syntax', 'min_size', 'json_valid']);

/** 单个规则求值：返回 { ruleId, description, severity, check, passed, detail, applicable } */
export function evaluateRule(rule, fileMap) {
  const res = {
    ruleId: rule.id,
    description: rule.description || '',
    severity: rule.severity || 'medium',
    check: rule.type,
    passed: false,
    detail: '',
    applicable: true,
  };
  const file = fileMap.get(rule.file);
  try {
    if (rule.ifPresent && CONTENT_RULES.has(rule.type) && file === undefined) {
      res.passed = true;
      res.applicable = false;
      res.detail = `跳过：产物不含 ${rule.file}`;
      return res;
    }
    switch (rule.type) {
      case 'file_exists':
        res.passed = file !== undefined;
        res.detail = file !== undefined ? `存在 ${rule.file}` : `缺少文件 ${rule.file}`;
        break;
      case 'file_not_exists':
        res.passed = file === undefined;
        res.detail = res.passed ? `不存在 ${rule.file}` : `不应存在 ${rule.file}`;
        break;
      case 'contains':
        res.passed = !!file && file.content.includes(rule.text);
        res.detail = res.passed
          ? `${rule.file} 包含 "${short(rule.text)}"`
          : `${rule.file} 缺少 "${short(rule.text)}"`;
        break;
      case 'not_contains':
        res.passed = !file || !file.content.includes(rule.text);
        res.detail = res.passed ? `${rule.file} 不含 "${short(rule.text)}"` : `${rule.file} 含 "${short(rule.text)}"`;
        break;
      case 'regex':
        res.passed = !!file && new RegExp(rule.pattern).test(file.content);
        res.detail = res.passed ? `${rule.file} 匹配 ${rule.pattern}` : `${rule.file} 未匹配 ${rule.pattern}`;
        break;
      case 'js_syntax': {
        res.passed = !!file && isJsValid(file.content);
        res.detail = res.passed ? `${rule.file} 语法合法` : `${rule.file} 语法错误`;
        break;
      }
      case 'min_size': {
        const min = Number(rule.min ?? rule.size?.min ?? 1);
        const len = file ? (file.content ? file.content.length : file.size ?? 0) : 0;
        res.passed = !!file && len >= min;
        res.detail = res.passed
          ? `${rule.file} 内容长度 ${len} ≥ ${min}`
          : `${rule.file} 内容长度 ${len} 小于下限 ${min}（可能是空/占位资产）`;
        break;
      }
      case 'json_valid': {
        let ok = false;
        if (file) {
          try {
            JSON.parse(file.content);
            ok = true;
          } catch {
            ok = false;
          }
        }
        res.passed = ok;
        res.detail = ok ? `${rule.file} 是合法 JSON` : `${rule.file} 不是合法 JSON`;
        break;
      }
      default:
        res.detail = `未知规则类型: ${rule.type}`;
    }
  } catch (err) {
    res.detail = `求值异常: ${err.message}`;
  }
  return res;
}

/** 批量求值。rules: 数组，files: [{path, content}] */
export function evaluateRules(rules, files) {
  const fileMap = new Map((files ?? []).map((f) => [f.path, f]));
  return (rules ?? []).map((r) => evaluateRule(r, fileMap));
}

/** 汇总结论：按严重级别分层（忽略 applicable=false 的跳过项） */
export function verdictFor(checks) {
  const failed = (sev) =>
    checks.filter((c) => c.applicable !== false && c.severity === sev && !c.passed);
  const high = failed('high');
  const medium = failed('medium');
  if (high.length > 0) {
    return { verdict: 'fail', severity: 'high', issues: high, detail: `${high.length} 条高严重性约束未满足` };
  }
  if (medium.length > 0) {
    return { verdict: 'warn', severity: 'medium', issues: medium, detail: `${medium.length} 条中严重性约束未满足（放行）` };
  }
  return { verdict: 'pass', severity: 'ok', issues: [], detail: '全部约束满足' };
}

/** JS 语法校验：vm.Script 仅编译不执行（CommonJS 风格代码可用；ESM import 暂不支持） */
export function isJsValid(src) {
  try {
    new vm.Script(String(src));
    return true;
  } catch {
    return false;
  }
}

function short(s, n = 40) {
  const t = String(s);
  return t.length > n ? t.slice(0, n) + '…' : t;
}