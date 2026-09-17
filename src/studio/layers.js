import { mkdirSync, readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { randomUUID } from "node:crypto";
export const STUDIO_LAYERS=["requirements","engineering","development","qa"];
const templates={requirements:["requirements.md","feature-list.md","asset-spec.md","acceptance.md"],engineering:["quantified-spec.md","architecture.md","task-breakdown.md","test-plan.md"],development:["implementation-plan.md","change-list.md","risk-register.md"],qa:["qa-report.md","bug-list.md","performance-security.md"]};
function files(root,limit=200){const out=[];function walk(dir){for(const name of readdirSync(dir)){if([".git","node_modules",".cowork"].includes(name))continue;const p=join(dir,name);const s=statSync(p);if(s.isDirectory())walk(p);else if(out.length<limit)out.push(relative(root,p));}}walk(root);return out;}
function context(input,mode){const p=resolve(input);if(mode==="requirements"&&!statSync(p,{throwIfNoEntry:false}))return {input,mode,kind:"idea",files:[],text:String(input)};const isDir=statSync(p).isDirectory();return {input:p,mode,kind:isDir?"directory":"file",files:isDir?files(p):[],text:isDir?"":readFileSync(p,"utf8").slice(0,30000)};}
function fallback(mode,ctx){const text=mode==="requirements"?`# Requirements

## User idea

Input: ${ctx.input}

## Scope

- Define users and goals.
- Define core flow and acceptance criteria.
- Identify required assets and open questions.`:mode==="engineering"?`# Quantified Engineering Specification

Input: ${ctx.input}

## Deliverables

- Convert requirements into measurable tasks.
- Define interfaces, data, dependencies and test evidence.`:mode==="development"?`# Development Plan

Source: ${ctx.input}

## Plan

- Inspect existing code.
- Implement the smallest safe change.
- Add regression tests and document risks.`:`# QA Report

Target: ${ctx.input}

## Review scope

- Functional defects
- Regression risk
- Performance and security observations

## Evidence

Files inspected: ${ctx.files.length}`;return text;}
export async function runStudioLayer({mode,input,output,provider=null}){if(!STUDIO_LAYERS.includes(mode))throw new Error(`未知 Studio layer: ${mode}`);const ctx=context(input,mode);const out=resolve(output||join(process.cwd(),`.studio-${mode}-${Date.now()}`));mkdirSync(out,{recursive:true});const produced=[];for(const file of templates[mode]){let text=provider?await provider.generate({role:mode,task:{name:file},inputs:[ctx],model:provider.model}):fallback(mode,ctx);if(typeof text!=="string")text=JSON.stringify(text,null,2);writeFileSync(join(out,file),text+"\n");produced.push(file);}const manifest={id:randomUUID(),layer:mode,input:ctx.input,output:out,createdAt:new Date().toISOString(),files:produced};writeFileSync(join(out,"layer-manifest.json"),JSON.stringify(manifest,null,2)+"\n");return manifest;}
