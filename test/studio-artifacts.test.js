import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStudioDb,closeStudioDb,StudioVersionStore,StudioArtifactStore,StudioBugStore } from "../src/studio/index.js";
test("artifact inheritance, stale and bug routing",()=>{const root=mkdtempSync(join(tmpdir(),"studio-art-"));const db=openStudioDb(join(root,".cowork","project.db"));const s=new StudioVersionStore({db,projectRoot:root});const p=s.createProject({name:"x"});const v=s.createVersion({projectId:p.id,version:"0.1.0.0"});const a=new StudioArtifactStore({db});const base=a.create({versionId:v.id,type:"document",name:"gdd",state:"approved",checksum:"abc"});const copy=a.inherit({versionId:v.id,sourceArtifactId:base.id,inheritMode:"fork"});assert.equal(copy.source_artifact,base.id);assert.equal(a.markStale(copy.id).state,"stale");const bugs=new StudioBugStore({db});const b=bugs.create({versionId:v.id,title:"broken ui"});assert.equal(bugs.route({bugId:b.id,targetStage:"production"}).status,"triaged");closeStudioDb(db);});