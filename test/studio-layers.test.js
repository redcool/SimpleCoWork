import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStudioLayer } from "../src/studio/layers.js";
test("standalone layers produce handoff documents without changing input",async()=>{const root=mkdtempSync(join(tmpdir(),"studio-layers-"));const input=join(root,"idea.md");writeFileSync(input,"粗略想法");const req=await runStudioLayer({mode:"requirements",input,output:join(root,"requirements")});assert.equal(req.files.length,4);const eng=await runStudioLayer({mode:"engineering",input:req.output,output:join(root,"engineering")});assert.equal(eng.files.length,4);const qa=await runStudioLayer({mode:"qa",input,output:join(root,"qa")});assert.equal(qa.files.length,3);assert.equal(readFileSync(input,"utf8"),"粗略想法");});
