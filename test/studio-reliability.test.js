import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStudioDb,closeStudioDb,StudioVersionStore,StudioEventLog,StudioTaskStore } from "../src/studio/index.js";

test("database migrations and event outbox export",()=>{const root=mkdtempSync(join(tmpdir(),"studio-reliability-"));const db=openStudioDb(join(root,".cowork","project.db"));assert.equal(db.prepare("SELECT value FROM schema_meta WHERE key='schema_version'").get().value,"9");const log=new StudioEventLog(join(root,".cowork","events.jsonl"),{db});log.append("test.event",{ok:true});assert.equal(log.reconcile(),1);assert.equal(log.exportPending(),1);assert.equal(log.reconcile(),0);assert.match(readFileSync(join(root,".cowork","events.jsonl"),"utf8"),/test.event/);closeStudioDb(db);});

test("running Studio task can be recovered",()=>{const root=mkdtempSync(join(tmpdir(),"studio-recovery-"));const db=openStudioDb(join(root,".cowork","project.db"));const versions=new StudioVersionStore({db,projectRoot:root});const p=versions.createProject({name:"x"});const v=versions.createVersion({projectId:p.id,version:"0.1.2.0"});const tasks=new StudioTaskStore({db});const task=tasks.create({versionId:v.id,stageKey:"planning",name:"plan",agentRole:"manager"});tasks.transition(task.id,"ready");tasks.claim(task.id,{workerId:"legacy-test",leaseMs:1});const recovered=tasks.recoverRunning({now:new Date(Date.now()+1000)});assert.equal(recovered[0].status,"failed");assert.deepEqual(tasks.ready(v.id).map(x=>x.id),[task.id]);closeStudioDb(db);});
