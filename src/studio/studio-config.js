import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Studio 框架级配置：每次框架工作时从工作根目录读取 studio_config.json。 */
export const FRAMEWORK_CONFIG_FILE = "studio_config.json";
export const DEFAULT_LANGUAGES = ["zh"];
export const LANGUAGE_CODE_RE = /^[a-z]{2}(-[A-Za-z]{2})?$/;

const LANGUAGE_NAMES = { zh: "简体中文", en: "English" };

/** 校验框架配置：已知项校验，未知项告警不拒绝（为未来全局控制项保留扩展位）。 */
export function validateStudioFrameworkConfig(raw) {
  const errors = [];
  const warnings = [];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["studio_config.json 顶层必须是对象"], warnings };
  }
  if (raw.languages !== undefined) {
    if (!Array.isArray(raw.languages)) errors.push("languages 必须是字符串数组");
    else {
      if (raw.languages.length === 0) errors.push("languages 不能为空数组");
      for (const l of raw.languages) {
        if (typeof l !== "string" || !LANGUAGE_CODE_RE.test(l)) errors.push(`语言代码非法: ${JSON.stringify(l)}（应为 zh / en / zh-TW 形式）`);
      }
      if (new Set(raw.languages).size !== raw.languages.length) errors.push("languages 存在重复项");
    }
  }
  const known = new Set(["version", "languages"]);
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) warnings.push(`未知的全局配置项: ${key}（当前版本忽略，为未来扩展保留）`);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** 读取 <root>/studio_config.json；文件不存在时返回默认（languages=["zh"]）。 */
export function loadStudioFrameworkConfig(root) {
  const path = join(root, FRAMEWORK_CONFIG_FILE);
  if (!existsSync(path)) return { path, source: "default", languages: [...DEFAULT_LANGUAGES], warnings: [] };
  let raw;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`studio_config.json 不是有效 JSON: ${error.message}`);
  }
  const check = validateStudioFrameworkConfig(raw);
  if (!check.ok) throw new Error(`studio_config.json 配置无效: ${check.errors.join("；")}`);
  return { path, source: "file", languages: Array.isArray(raw.languages) ? [...raw.languages] : [...DEFAULT_LANGUAGES], warnings: check.warnings };
}

/** 输出语言指令：拼进文档生成提示词，消灭中英混杂的根源。 */
export function languageDirective(lang) {
  if (lang === "zh") return "全文使用简体中文撰写（术语可保留英文原文）。";
  if (lang === "en") return "Write the entire document in English.";
  return `Write the entire document in language: ${lang}.`;
}

export function languageName(lang) { return LANGUAGE_NAMES[lang] || lang; }

/** requirements.md → requirements.zh.md；无扩展名则直接追加。 */
export function withLanguageSuffix(file, lang) {
  const i = file.lastIndexOf(".");
  return i > 0 ? `${file.slice(0, i)}.${lang}${file.slice(i)}` : `${file}.${lang}`;
}
