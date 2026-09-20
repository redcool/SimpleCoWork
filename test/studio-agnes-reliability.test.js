import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProviderCall,retryProviderCall,parseStructuredText,assertControlProposal } from "../src/providers/index.js";
import { StudioRunReport } from "../src/studio/index.js";
test("parses JSON and fenced Provider output",()=>{assert.equal(parseStructuredText("```json\n{\"summary\":\"ok\",\"actions\":[]}\n```").value.summary,"ok");assert.throws(()=>assertControlProposal({}),/Proposal/);});
test("retries transient Provider failures with bounded attempts",async()=>{let n=0;const r=await retryProviderCall(async()=>{n++;if(n<3){const e=new Error("rate limit");e.status=429;throw e;}return "ok";},{maxAttempts:3,baseDelayMs:1});assert.equal(r.ok,true);assert.equal(r.attempts,3);});
test("run report records reliability metrics",()=>{const r=new StudioRunReport({runId:"r",versionId:"v",mode:"agnes"});r.round().record("taskStarted",2).record("providerFailure").record("recoveredTask");const out=r.finish({pendingConfirmations:1,openBugs:2});assert.equal(out.tasksStarted,2);assert.equal(out.providerFailures,1);assert.equal(out.recoveredTasks,1);});
