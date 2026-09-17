import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStudioLayer } from "../src/studio/layers.js";
test("standalone layers produce handoff documents without changing input",async()=>{const root=mkdtempSync(join(tmpdir(),"studio-layers-"));const input=join(root,"idea.md");writeFileSync(input,"粗略想法");const req=await runStudioLayer({mode:"requirements",input,output:join(root,"requirements")});assert.equal(req.files.length,4);const eng=await runStudioLayer({mode:"engineering",input:req.output,output:join(root,"engineering")});assert.equal(eng.files.length,4);const qa=await runStudioLayer({mode:"qa",input,output:join(root,"qa")});assert.equal(qa.files.length,3);assert.equal(readFileSync(input,"utf8"),"粗略想法");});
test("standalone layer can use injected provider and preserves provider metadata",async()=>{const root=mkdtempSync(join(tmpdir(),"studio-layer-provider-"));const provider={name:"test-provider",model:"test-model",generate:async({user})=>"# provider output\n\n"+user.slice(0,40)};const result=await runStudioLayer({mode:"qa",input:root,output:join(root,"out"),provider,logPath:join(root,"layer.jsonl")});assert.equal(result.provider,"test-provider");assert.match(readFileSync(join(root,"out","qa-report.md"),"utf8"),/provider output/);assert.match(readFileSync(join(root,"layer.jsonl"),"utf8"),/layer.completed/);});
test("rejects missing input for non-requirements layer",async()=>{await assert.rejects(()=>runStudioLayer({mode:"qa",input:join(tmpdir(),"definitely-missing-studio-input")}),/ENOENT/);});
