import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
export class StudioArtifactStore {
  constructor({db,eventLog}){this.db=db;this.events=eventLog;}
  create({versionId,type,name,state="submitted",sourceArtifact=null,inheritMode=null,checksum=null}){const id=randomUUID();this.db.prepare("INSERT INTO artifacts(id,version_id,type,name,state,source_artifact,inherit_mode,checksum) VALUES(?,?,?,?,?,?,?,?)").run(id,versionId,type,name,state,sourceArtifact,inheritMode,checksum);this.events?.append("artifact.created",{id,versionId,name,inheritMode});return this.get(id);}
  inherit({versionId,sourceArtifactId,inheritMode="reuse"}){if(!["reuse","fork","replace","reference"].includes(inheritMode))throw new Error("非法继承模式");const source=this.get(sourceArtifactId);if(!source.checksum)throw new Error("来源 Artifact 缺少 checksum");if(["stale","rejected","deprecated","superseded"].includes(source.state))throw new Error("不可从当前状态 Artifact 继承");if(inheritMode==="reuse"||inheritMode==="reference"){if(!["approved","user-approved"].includes(source.state))throw new Error("reuse/reference 只允许批准的 Artifact");}const state=inheritMode==="reuse"||inheritMode==="reference"?source.state:"submitted";return this.create({versionId,type:source.type,name:source.name,state,sourceArtifact:source.id,inheritMode,checksum:source.checksum});}
  get(id){const a=this.db.prepare("SELECT * FROM artifacts WHERE id=?").get(id);if(!a)throw new Error("未知 Artifact");return a;}
  markStale(id,reason="dependency changed"){this.db.prepare("UPDATE artifacts SET state=? WHERE id=?").run("stale",id);this.events?.append("artifact.stale",{id,reason});return this.get(id);}
  list(versionId){return this.db.prepare("SELECT * FROM artifacts WHERE version_id=? ORDER BY rowid").all(versionId);}
}