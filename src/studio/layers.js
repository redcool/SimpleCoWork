import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, appendFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_LANGUAGES, LANGUAGE_CODE_RE, languageDirective, withLanguageSuffix } from "./studio-config.js";

export const STUDIO_LAYERS=["requirements","engineering","development","qa"];
const templates={requirements:["requirements.md","feature-list.md","asset-spec.md","acceptance.md"],engineering:["quantified-spec.md","architecture.md","task-breakdown.md","test-plan.md"],development:["implementation-plan.md","change-list.md","risk-register.md"],qa:["qa-report.md","bug-list.md","performance-security.md"]};
function files(root,limit=200){const out=[];function walk(dir){for(const name of readdirSync(dir)){if([".git","node_modules",".cowork"].includes(name))continue;const p=join(dir,name);const s=statSync(p);if(s.isDirectory())walk(p);else if(out.length<limit)out.push(relative(root,p));}}walk(root);return out;}
const INPUT_FILE_MAX_CHARS=8000;
const INPUT_TOTAL_MAX_CHARS=30000;

/** 目录输入：逐文件读取内容进提示词（单文件/总量设上限，超出部分明确标注），修复跨层交接只见文件名的问题。 */
function readDirectoryText(root,paths){let total=0;const skipped=[];const sections=[];for(const rel of paths){if(total>=INPUT_TOTAL_MAX_CHARS){skipped.push(rel);continue;}let content;try{content=readFileSync(join(root,rel),"utf8");}catch{skipped.push(rel);continue;}let text=content.length>INPUT_FILE_MAX_CHARS?content.slice(0,INPUT_FILE_MAX_CHARS)+"\n…（单文件截断）":content;if(text.length>INPUT_TOTAL_MAX_CHARS-total){text=text.slice(0,INPUT_TOTAL_MAX_CHARS-total)+"\n…（总量截断）";}total+=text.length;sections.push("### "+rel+"\n"+text);}if(skipped.length)sections.push("### （未读文件，已达输入总量上限）\n"+skipped.join(", "));return sections.join("\n\n");}

function context(input,mode){const p=resolve(input);if(mode==="requirements"&&!statSync(p,{throwIfNoEntry:false}))return {input,mode,kind:"idea",files:[],text:String(input)};const isDir=statSync(p).isDirectory();const dirFiles=isDir?files(p):[];return {input:p,mode,kind:isDir?"directory":"file",files:dirFiles,text:isDir?readDirectoryText(p,dirFiles):readFileSync(p,"utf8").slice(0,30000)};}
function fallback(mode,ctx,file){return "# "+file.replace(/[-_]/g," ")+"\n\nLayer: "+mode+"\nInput: "+ctx.input+"\n\n## Working Notes\n\n- Inspect the input and record evidence.\n- Keep scope explicit and identify open questions.\n- Produce reviewable, testable handoff content.\n"+(ctx.files.length?"\nFiles inspected: "+ctx.files.length+"\n":"");}
function prompt(mode,ctx,file,lang){return "You are the "+mode+" layer of Studio CoWork. Produce the requested handoff document: "+file+". Input kind: "+ctx.kind+". Input path or idea: "+ctx.input+". Files: "+ctx.files.join(", ")+".\n\nInput content:\n"+ctx.text+"\n\nRules: be concrete, distinguish facts from assumptions, include acceptance/evidence, and do not claim code was changed. Return Markdown only.\n\nOutput language: "+languageDirective(lang);}

/** 独立层运行器：按 languages 为每份模板文档生成各语言变体（requirements.zh.md / requirements.en.md）。 */
export async function runStudioLayer({ mode, input, output, provider = null, system = "You are a careful Studio CoWork specialist.", logPath = null, languages = DEFAULT_LANGUAGES } = {}) {
  if (!STUDIO_LAYERS.includes(mode)) throw new Error(`未知 Studio layer: ${mode}`);
  if (!input) throw new Error("独立层需要 input");
  if (!Array.isArray(languages) || languages.length === 0 || !languages.every(l => typeof l === "string" && LANGUAGE_CODE_RE.test(l))) {
    throw new Error('languages 必须是非空语言代码数组（如 ["zh","en"]）');
  }
  const ctx = context(input, mode);
  const out = resolve(output || join(process.cwd(), "tmp", `studio-${mode}-${Date.now()}`));
  mkdirSync(out, { recursive: true });
  const log = (event) => { if (logPath) appendFileSync(resolve(logPath), JSON.stringify({ ts: new Date().toISOString(), ...event }) + "\n"); };
  log({ event: "layer.started", mode, input: ctx.input, provider: provider?.name || "offline", languages });
  const produced = [];
  for (const file of templates[mode]) {
    for (const lang of languages) {
      const target = withLanguageSuffix(file, lang);
      try {
        let text;
        if (provider) {
          const result = await provider.generate({ role: mode, model: provider.model, system, user: prompt(mode, ctx, file, lang) });
          text = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        } else text = fallback(mode, ctx, file);
        writeFileSync(join(out, target), text.endsWith("\n") ? text : text + "\n");
        produced.push(target);
        log({ event: "document.written", file: target, lang });
      } catch (error) {
        log({ event: "document.failed", file: target, lang, error: error.message });
        throw error;
      }
    }
  }
  const manifest = { id: randomUUID(), layer: mode, input: ctx.input, output: out, provider: provider?.name || "offline", languages, createdAt: new Date().toISOString(), files: produced, logPath: logPath ? resolve(logPath) : null };
  writeFileSync(join(out, "layer-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  log({ event: "layer.completed", files: produced.length, languages, manifest: join(out, "layer-manifest.json") });
  return manifest;
}
