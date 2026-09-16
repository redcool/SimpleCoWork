import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStudioDb, closeStudioDb, StudioVersionStore, StudioDocumentStore, StudioArtifactStore, StudioDocumentRunner, ApprovalStore } from "../src/studio/index.js";
import { createMockProvider } from "../src/providers/mock.js";

test("same-name documents remain immutable and authoritative input is rechecked", async () => {
  const root=mkdtempSync(join(tmpdir(),"studio-audit-"));
  const db=openStudioDb(join(root,".cowork","project.db"));
  const versions=new StudioVersionStore({db,projectRoot:root});
  const project=versions.createProject({name:"audit"});
  const version=versions.createVersion({projectId:project.id,version:"0.1.1.0"});
  const docs=new StudioDocumentStore({db,workspacePath:version.workspace_path});
  const one=docs.submit({versionId:version.id,type:"document",name:"plan",content:"one"});
  const two=docs.submit({versionId:version.id,type:"document",name:"plan",content:"two"});
  assert.notEqual(one.path,two.path); assert.equal(readFileSync(one.path,"utf8"),"one"); assert.equal(readFileSync(two.path,"utf8"),"two");
  const artifacts=new StudioArtifactStore({db}); const stale=artifacts.get(one.id);
  const provider=createMockProvider({script:{default:()=>({done:true,content:"out"})}});
  const runner=new StudioDocumentRunner({provider,documentStore:docs,artifactStore:artifacts});
  await assert.rejects(()=>runner.run({agent:{id:"x",role:"x"},task:{id:"t",versionId:version.id,name:"out"},inputs:[stale],name:"out"}),/未批准/);
  closeStudioDb(db);
});

test("approval rejects invalid owner and cross-version artifact",()=>{
  const root=mkdtempSync(join(tmpdir(),"studio-approval-")); const db=openStudioDb(join(root,".cowork","project.db"));
  const versions=new StudioVersionStore({db,projectRoot:root}); const project=versions.createProject({name:"x"});
  const a=versions.createVersion({projectId:project.id,version:"0.1.1.0"}); const b=versions.createVersion({projectId:project.id,version:"0.1.2.0"});
  const arts=new StudioArtifactStore({db}); const art=arts.create({versionId:a.id,type:"document",name:"x"}); const approvals=new ApprovalStore({db});
  assert.throws(()=>approvals.decide({versionId:b.id,artifactId:art.id,approverType:"unknown",decision:"approved"}),/审批者/);
  assert.throws(()=>approvals.decide({versionId:b.id,artifactId:art.id,approverType:"user",decision:"approved"}),/不属于/); closeStudioDb(db);
});
