import { randomUUID } from "node:crypto";
const TYPES=new Set(["manager","reviewer","user","qa","producer"]);
export class ApprovalStore {
  constructor({db,eventLog}){this.db=db;this.events=eventLog;}
  decide({versionId,artifactId=null,approverType,actorId=null,decision,comment=""}){if(!TYPES.has(approverType))throw new Error("非法审批者类型");actorId=actorId||approverType;if(!["approved","rejected","requested_changes"].includes(decision))throw new Error("非法审批决定");if(artifactId){const a=this.db.prepare("SELECT version_id FROM artifacts WHERE id=?").get(artifactId);if(!a)throw new Error("Artifact 不存在");if(a.version_id!==versionId)throw new Error("Artifact 不属于审批版本");}const id=randomUUID();this.db.prepare("INSERT INTO approvals(id,artifact_id,version_id,approver_type,decision,comment) VALUES(?,?,?,?,?,?)").run(id,artifactId,versionId,approverType,decision,comment);this.events?.append("approval."+decision,{id,versionId,artifactId,approverType,actorId});return this.db.prepare("SELECT * FROM approvals WHERE id=?").get(id);}
  listFor({versionId,artifactId=null}){return artifactId?this.db.prepare("SELECT * FROM approvals WHERE version_id=? AND artifact_id=? ORDER BY rowid").all(versionId,artifactId):this.db.prepare("SELECT * FROM approvals WHERE version_id=? ORDER BY rowid").all(versionId);}
}
