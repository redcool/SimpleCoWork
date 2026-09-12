import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStudioDb, closeStudioDb, StudioEventLog, StudioVersionStore } from "../src/studio/index.js";
test("creates project/version and logs event",()=>{const root=mkdtempSync(join(tmpdir(),"studio-cowork-"));const db=openStudioDb(join(root,".cowork","project.db"));const log=new StudioEventLog(join(root,".cowork","events.jsonl"));const s=new StudioVersionStore({db,eventLog:log,projectRoot:root});const p=s.createProject({name:"demo"});const v=s.createVersion({projectId:p.id,version:"0.1.0.0"});assert.equal(v.status,"planning");assert.match(readFileSync(join(root,".cowork","events.jsonl"),"utf8"),/version.created/);closeStudioDb(db);});
test("requires approval before seal",()=>{const root=mkdtempSync(join(tmpdir(),"studio-cowork-"));const db=openStudioDb(join(root,".cowork","project.db"));const s=new StudioVersionStore({db,projectRoot:root});const p=s.createProject({name:"demo"});const v=s.createVersion({projectId:p.id,version:"0.1.0.0"});assert.throws(()=>s.seal(v.id),/approved/);closeStudioDb(db);});