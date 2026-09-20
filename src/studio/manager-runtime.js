import { buildStudioSnapshot } from "./snapshot.js";
import { StudioControlLoop } from "./control-loop.js";
export class StudioManagerRuntime {
  constructor({versions,stages,tasks,bugs=null,reviews=null,confirmations=null,planner,executor,eventLog,actor,versionId,maxParallel=4}){this.versionId=versionId;this.stores={versions,stages,tasks,bugs,reviews};this.loop=new StudioControlLoop({actor,confirmationQueue:confirmations,planner,executor,eventLog,maxParallel,observer:async()=>buildStudioSnapshot({versionId,versions,stages,tasks,bugs,reviews,pendingApprovals:confirmations?.list()||[]})});}
  async round(context={}){return this.loop.round({...context,versionId:this.versionId});}
  snapshot(){return buildStudioSnapshot({...this.stores,versionId:this.versionId,pendingApprovals:[]});}
}
