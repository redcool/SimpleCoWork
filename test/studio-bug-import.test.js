import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStudioDb,closeStudioDb,StudioVersionStore,StudioBugStore } from "../src/studio/index.js";
test("imports QA report into routed Bugs",()=>{const root=mkdtempSync(join(tmpdir(),"studio-qa-bugs-"));const db=openStudioDb(join(root,".cowork","project.db"));const v=new StudioVersionStore({db,projectRoot:root});const p=v.createProject({name:"qa"});const ver=v.createVersion({projectId:p.id,version:"0.1.9.0"});const bugs=new StudioBugStore({db});const out=bugs.importReport({versionId:ver.id,report:{bugs:[{title:"slow startup",severity:"medium",priority:"P1",targetStage:"production"}]}});assert.equal(out.length,1);assert.equal(bugs.get(out[0].id).status,"triaged");closeStudioDb(db);});
