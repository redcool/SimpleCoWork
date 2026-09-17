import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openStudioDb, closeStudioDb, StudioVersionStore, StudioTaskStore, StudioPlanBuilder, StageGateStore, StudioScheduler, StudioDocumentStore, StudioDocumentRunner, StudioArtifactStore, StudioReviewStore, StudioStageOrchestrator, ApprovalStore } from "../../src/studio/index.js";
import { createMockProvider } from "../../src/providers/mock.js";

const root=mkdtempSync(join(tmpdir(),"studio-small-offline-"));
const db=openStudioDb(join(root,".cowork","project.db"));
const versions=new StudioVersionStore({db,projectRoot:root});
const project=versions.createProject({name:"studio-small-offline"});
const version=versions.createVersion({projectId:project.id,version:"0.1.4.0"});
const tasks=new StudioTaskStore({db});
new StudioPlanBuilder({tasks}).create({versionId:version.id,plan:{planning:[{name:"version-plan",role:"manager"}],design:[{name:"technical-design",role:"developer"},{name:"visual-design",role:"artist"}]}});
const docs=new StudioDocumentStore({db,workspacePath:version.workspace_path});
const artifacts=new StudioArtifactStore({db});
const provider=createMockProvider({script:{default:({role})=>({summary:role+" offline output",content:"# "+role+"\n\nOffline Studio artifact.",done:true})}});
const runner=new StudioDocumentRunner({provider,documentStore:docs,artifactStore:artifacts});
const reviews=new StudioReviewStore({db});
const scheduler=new StudioScheduler({tasks,runner,artifacts,reviews});
const gates=new StageGateStore({db});
const orchestration=new StudioStageOrchestrator({db,stages:gates,tasks,scheduler,approvals:new ApprovalStore({db})});
const agents={manager:{id:"manager",role:"manager"},developer:{id:"developer",role:"developer"},artist:{id:"artist",role:"artist"}};
const results=[];
for(const stage of ["planning","design"]){let complete=false;let rounds=0;let count=0;while(!complete&&rounds++<5){const result=await orchestration.runStage({versionId:version.id,stageKey:stage,agents,reviewer:async()=>({reviewer:"offline-reviewer",decision:"approved",evidence:["mock"]})});complete=result.complete;count+=result.results.length;}if(!complete)throw new Error(`阶段未完成: ${stage}`);orchestration.requestUserApproval({versionId:version.id,stageKey:stage});orchestration.approveStage({versionId:version.id,stageKey:stage,approverType:"user"});results.push({stage,complete,results:count});}
console.log(JSON.stringify({mode:"offline",root,versionId:version.id,version:version.version,stages:results},null,2));
closeStudioDb(db);
