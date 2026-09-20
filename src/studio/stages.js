import { randomUUID } from "node:crypto";
const ORDER=["planning","design","asset-spec","production","playable"];
const ALLOWED={pending:["active","skipped"],active:["reviewing","blocked"],reviewing:["user_pending","approved","blocked"],user_pending:["approved","blocked"],blocked:["active","reviewing"],approved:[],skipped:[]};
export class StageGateStore {
  constructor({db,eventLog}){this.db=db;this.events=eventLog;}
  get(versionId,key){return this.db.prepare("SELECT * FROM stages WHERE version_id=? AND stage_key=?").get(versionId,key);}
  start(versionId,key){const s=this.get(versionId,key);if(!s)throw new Error("未知阶段");if(s.status!=="pending"&&s.status!=="blocked")throw new Error("阶段不可启动");const prev=ORDER[ORDER.indexOf(key)-1];if(prev){const p=this.get(versionId,prev);if(!p||p.status!=="approved")throw new Error("上游阶段未批准");}this.db.prepare("UPDATE stages SET status=?,started_at=? WHERE id=?").run("active",new Date().toISOString(),s.id);this.events?.append("stage.started",{versionId,stage:key});return this.get(versionId,key);}
  transition(versionId,key,to,{actor=null,force=false}={}){const s=this.get(versionId,key);if(!s)throw new Error("未知阶段");if(!ALLOWED[s.status]?.includes(to))throw new Error("非法阶段迁移 "+s.status+" -> "+to);this.db.prepare("UPDATE stages SET status=?,completed_at=? WHERE id=?").run(to,to==="approved"?new Date().toISOString():null,s.id);this.events?.append("stage."+to,{versionId,stage:key,actor:actor?.id||actor});return this.get(versionId,key);}
  list(versionId){return this.db.prepare("SELECT * FROM stages WHERE version_id=? ORDER BY rowid").all(versionId);}
}
export { ORDER as STUDIO_STAGES };