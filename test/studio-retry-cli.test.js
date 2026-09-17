import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStudioDb,closeStudioDb,StudioVersionStore,StudioTaskStore } from "../src/studio/index.js";
test("task idempotency and retry limit",()=>{const root=mkdtempSync(join(tmpdir(),"studio-retry-"));const db=openStudioDb(join(root,".cowork","project.db"));const v=new StudioVersionStore({db,projectRoot:root});const p=v.createProject({name:"retry"});const ver=v.createVersion({projectId:p.id,version:"0.1.3.0"});const tasks=new StudioTaskStore({db});const a=tasks.create({versionId:ver.id,stageKey:"planning",name:"plan",agentRole:"manager",idempotencyKey:"plan-1",maxAttempts:1});const b=tasks.create({versionId:ver.id,stageKey:"planning",name:"other",agentRole:"manager",idempotencyKey:"plan-1"});assert.equal(a.id,b.id);tasks.transition(a.id,"ready");tasks.transition(a.id,"running");tasks.transition(a.id,"failed");assert.throws(()=>tasks.retry(a.id),/最大/);closeStudioDb(db);});
