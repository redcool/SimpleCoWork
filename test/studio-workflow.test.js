import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStudioDb,closeStudioDb,StudioVersionStore,StudioTaskStore,StudioPlanBuilder,StageGateStore,StudioStageOrchestrator,StudioScheduler,StudioDocumentStore,StudioDocumentRunner,StudioArtifactStore,StudioReviewStore,StudioBugStore,ApprovalStore } from "../src/studio/index.js";
import { createMockProvider } from "../src/providers/mock.js";

test("stage plan runs through user approval and bug fix task", async () => {
 const root=mkdtempSync(join(tmpdir(),"studio-workflow-"));
 const db=openStudioDb(join(root,".cowork","project.db"));
 const versions=new StudioVersionStore({db,projectRoot:root}); const project=versions.createProject({name:"workflow"});
 const version=versions.createVersion({projectId:project.id,version:"0.1.2.0"});
 const tasks=new StudioTaskStore({db}); const plan=new StudioPlanBuilder({tasks});
 plan.create({versionId:version.id,plan:{planning:[{name:"plan",role:"manager"}],design:[{name:"design",role:"designer"}]}});
 const docs=new StudioDocumentStore({db,workspacePath:version.workspace_path}); const arts=new StudioArtifactStore({db});
 const provider=createMockProvider({script:{default:()=>({done:true,content:"# output"})}});
 const runner=new StudioDocumentRunner({provider,documentStore:docs,artifactStore:arts}); const reviews=new StudioReviewStore({db});
 const scheduler=new StudioScheduler({tasks,runner,artifacts:arts,reviews}); const gates=new StageGateStore({db}); const approvals=new ApprovalStore({db});
 const orch=new StudioStageOrchestrator({db,stages:gates,tasks,scheduler,approvals});
 const agents={manager:{id:"manager",role:"manager"},designer:{id:"designer",role:"designer"}};
 const first=await orch.runStage({versionId:version.id,stageKey:"planning",agents,reviewer:async()=>({reviewer:"reviewer",decision:"approved",evidence:["ok"]})});
 assert.equal(first.complete,true); orch.requestUserApproval({versionId:version.id,stageKey:"planning"});
 assert.throws(()=>orch.approveStage({versionId:version.id,stageKey:"planning",approverType:"manager"}),/用户/);
 orch.approveStage({versionId:version.id,stageKey:"planning",approverType:"user"});
 const second=await orch.runStage({versionId:version.id,stageKey:"design",agents,reviewer:async()=>({reviewer:"reviewer",decision:"approved"})}); assert.equal(second.complete,true);
 const bugs=new StudioBugStore({db,tasks}); const bug=bugs.create({versionId:version.id,title:"design issue"}); bugs.route({bugId:bug.id,targetStage:"design"});
 const fix=bugs.createFixTask({bugId:bug.id,stageKey:"design"}); assert.equal(fix.stage_key,"design"); closeStudioDb(db);
});
