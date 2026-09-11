// Oracle：把架构预期（规则）与产物文件对照，产出可审计的检查结果
// 进程内完成（含 JS 语法校验 via vm.Script），不依赖子进程
import { createHash } from 'node:crypto';
import vm from 'node:vm';

export function checksum(content) {
  return createHash('sha256').update(String(content ?? '')).digest('hex');
}

/** 仅对"内容类"规则生效：规则声明 ifPresent 时，产物不含该文件则跳过判定 */
const CONTENT_RULES = new Set([
  'contains', 'not_contains', 'regex', 'js_syntax', 'min_size', 'json_valid', 'file_magic', 'image_dimensions',
]);

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
const fileBuf = (file) => Buffer.from(String(file?.content ?? ''), 'latin1'); // 资产文件按字节存储（binary 字符串）

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
      case 'file_magic': {
        // 文件头魔数校验：rule.magic 为十六进制前缀，或 rule.mime 取 png/jpeg/json
        res.passed = false;
        if (rule.magic) {
          try {
            const want = Buffer.from(String(rule.magic).replace(/\s+/g, ''), 'hex');
            const have = file ? fileBuf(file) : null;
            res.passed = !!have && have.length >= want.length
              && Buffer.compare(have.subarray(0, want.length), want) === 0;
            res.detail = res.passed ? `${rule.file} 文件头匹配 0x${rule.magic}` : `${rule.file} 文件头不匹配 0x${rule.magic}（可能是改名/占位文件）`;
          } catch {
            res.detail = `${rule.file} 的 file_magic.magic 不是合法十六进制`;
          }
        } else if (rule.mime === 'png') {
          const have = file ? fileBuf(file) : null;
          res.passed = !!have && have.length >= PNG_SIG.length && Buffer.compare(have.subarray(0, PNG_SIG.length), PNG_SIG) === 0;
          res.detail = res.passed ? `${rule.file} 是 PNG 图片（文件头匹配）` : `${rule.file} 不是 PNG 图片（文件头不匹配）`;
        } else if (rule.mime === 'jpeg') {
          const have = file ? fileBuf(file) : null;
          res.passed = !!have && have.length >= JPEG_SIG.length && Buffer.compare(have.subarray(0, JPEG_SIG.length), JPEG_SIG) === 0;
          res.detail = res.passed ? `${rule.file} 是 JPEG 图片（文件头匹配）` : `${rule.file} 不是 JPEG 图片（文件头不匹配）`;
        } else if (rule.mime === 'json') {
          const t = (file?.content ?? '').trimStart();
          res.passed = t.startsWith('{') || t.startsWith('[');
          res.detail = res.passed ? `${rule.file} 以 JSON 结构开头` : `${rule.file} 不是 JSON 结构`;
        } else {
          res.detail = `${rule.file} 的 file_magic 需要 magic 或 mime(png/jpeg/json)`;
        }
        break;
      }
      case 'image_dimensions': {
        // 零依赖解析 PNG(IHDR) / JPEG(SOF) 宽高，校验 min/max 边界
        const fmt = rule.format || 'png';
        const minW = rule.minWidth ?? 0;
        const minH = rule.minHeight ?? 0;
        const maxW = rule.maxWidth ?? Number.MAX_SAFE_INTEGER;
        const maxH = rule.maxHeight ?? Number.MAX_SAFE_INTEGER;
        let w = null;
        let h = null;
        if (file) {
          const buf = fileBuf(file);
          if (fmt === 'png' && buf.length >= 24 && Buffer.compare(buf.subarray(0, PNG_SIG.length), PNG_SIG) === 0) {
            w = buf.readUInt32BE(16);
            h = buf.readUInt32BE(20);
          } else if (fmt === 'jpeg' && buf.length >= 4 && Buffer.compare(buf.subarray(0, JPEG_SIG.length), JPEG_SIG) === 0) {
            let i = 2;
            while (i + 9 < buf.length) {
              if (buf[i] !== 0xff) { i += 1; continue; }
              const marker = buf[i + 1];
              if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                h = buf.readUInt16BE(i + 5);
                w = buf.readUInt16BE(i + 7);
                break;
              }
              i += 2 + buf.readUInt16BE(i + 2);
            }
          }
        }
        res.passed = w !== null && h !== null && w >= minW && h >= minH && w <= maxW && h <= maxH;
        res.detail = res.passed
          ? `${rule.file} 尺寸 ${w}×${h} 满足 [${minW}-${maxW}]×[${minH}-${maxH}]`
          : `${rule.file} ${w && h ? `尺寸 ${w}×${h} 不满足 [${minW}-${maxW}]×[${minH}-${maxH}]` : '无法解析尺寸（非 ' + fmt + ' 图片）'}`;
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