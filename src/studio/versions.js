import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
const VERSION_RE = /^\d+\.\d+\.\d+\.\d+$/;
const STAGES=["planning","design","asset-spec","production","playable"];
const now=()=>new Date().toISOString();
export class StudioVersionStore {
  constructor({db,eventLog,projectRoot}) { this.db=db; this.events=eventLog; this.root=resolve(projectRoot); }
  createProject({id=randomUUID(),name}) { const ts=now(); this.db.prepare("INSERT INTO projects(id,name,root_path,created_at) VALUES(?,?,?,?)").run(id,name,this.root,ts); this.events?.append("project.created",{projectId:id,name}); return {id,name}; }
  createVersion({projectId,version,baseVersionId=null}) { if(!VERSION_RE.test(version)) throw new Error("版本必须是 major.minor.patch.build 四段格式"); const p=this.db.prepare("SELECT * FROM projects WHERE id=?").get(projectId); if(!p) throw new Error("未知项目"); const id=randomUUID(); const workspace=join(p.root_path,"workspaces",version); mkdirSync(workspace,{recursive:true}); for(const d of ["documents","source","assets","tests","build"]) mkdirSync(join(workspace,d),{recursive:true}); this.db.prepare("INSERT INTO versions(id,project_id,version,status,base_version_id,workspace_path) VALUES(?,?,?,?,?,?)").run(id,projectId,version,"planning",baseVersionId,workspace); for(const stage of STAGES) this.db.prepare("INSERT INTO stages(id,version_id,stage_key,status) VALUES(?,?,?,?)").run(randomUUID(),id,stage,"pending"); this.events?.append("version.created",{versionId:id,version,workspace}); return this.get(id); }
  get(id) { const v=this.db.prepare("SELECT * FROM versions WHERE id=?").get(id); if(!v) throw new Error("未知版本"); return v; }
  approve(id) { this.db.prepare("UPDATE versions SET status=? WHERE id=?").run("approved",id); return this.get(id); }
  seal(id) { const v=this.get(id); if(v.status!=="approved") throw new Error("版本必须先 approved"); const release=join(this.root,"releases",new Date().toISOString().slice(0,10)+"-v"+v.version); mkdirSync(release,{recursive:true}); const manifest=join(release,"manifest.json"); writeFileSync(manifest,JSON.stringify({version:v.version,versionId:id,sealedAt:now()},null,2)); this.db.prepare("UPDATE versions SET status=?,release_path=? WHERE id=?").run("released",release,id); this.events?.append("release.sealed",{versionId:id,release}); return this.get(id); }
}