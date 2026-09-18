import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStudioDb,closeStudioDb,StudioVersionStore,StudioEventLog } from "../src/studio/index.js";
test("outbox export is idempotent by event id",()=>{const root=mkdtempSync(join(tmpdir(),"studio-c036-"));const db=openStudioDb(join(root,".cowork","project.db"));const log=new StudioEventLog(join(root,"events.jsonl"),{db});log.append("x",{n:1});assert.equal(log.exportPending(),1);assert.equal(log.exportPending(),0);assert.equal(readFileSync(join(root,"events.jsonl"),"utf8").trim().split(/\r?\n/).length,1);closeStudioDb(db);});
test("version state rejects repeat approval and seal",()=>{const root=mkdtempSync(join(tmpdir(),"studio-c036-state-"));const db=openStudioDb(join(root,".cowork","project.db"));const v=new StudioVersionStore({db,projectRoot:root});const p=v.createProject({name:"state"});const ver=v.createVersion({projectId:p.id,version:"0.1.8.0"});assert.throws(()=>v.approve(ver.id),/阶段/);assert.throws(()=>v.seal(ver.id),/approved/);closeStudioDb(db);});
