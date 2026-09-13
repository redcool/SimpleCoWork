import { randomUUID } from "node:crypto";
export class StudioArtifactStore {
  constructor({db,eventLog}){this.db=db;this.events=eventLog;}
  create({versionId,type,name,state="submitted",sourceArtifact=null,inheritMode=null,checksum=null}){const id=randomUUID();this.db.prepare("INSERT INTO artifacts(id,version_id,type,name,state,source_artifact,inherit_mode,checksum) VALUES(?,?,?,?,?,?,?,?)").run(id,versionId,type,name,state,sourceArtifact,inheritMode,checksum);this.events?.append("artifact.created",{id,versionId,name,inheritMode});return this.get(id);}
  inherit({versionId,sourceArtifactId,inheritMode="reuse"}){if(!["reuse","fork","replace","reference"].includes(inheritMode))throw new Error("非法继承模式");const source=this.get(sourceArtifactId);return this.create({versionId,type:source.type,name:source.name,state:"approved",sourceArtifact:source.id,inheritMode,checksum:source.checksum});}
  get(id){const a=this.db.prepare("SELECT * FROM artifacts WHERE id=?").get(id);if(!a)throw new Error("未知 Artifact");return a;}
  markStale(id,reason="dependency changed"){this.db.prepare("UPDATE artifacts SET state=? WHERE id=?").run("stale",id);this.events?.append("artifact.stale",{id,reason});return this.get(id);}
  list(versionId){return this.db.prepare("SELECT * FROM artifacts WHERE version_id=? ORDER BY rowid").all(versionId);}
}