import { randomUUID } from "node:crypto";
export class ApprovalStore {
  constructor({db,eventLog}){this.db=db;this.events=eventLog;}
  decide({versionId,artifactId=null,approverType,decision,comment=""}){if(!["approved","rejected","requested_changes"].includes(decision))throw new Error("非法审批决定");const id=randomUUID();this.db.prepare("INSERT INTO approvals(id,artifact_id,version_id,approver_type,decision,comment) VALUES(?,?,?,?,?,?)").run(id,artifactId,versionId,approverType,decision,comment);this.events?.append("approval."+decision,{id,versionId,artifactId,approverType});return this.db.prepare("SELECT * FROM approvals WHERE id=?").get(id);}
  listFor({versionId,artifactId=null}){return artifactId?this.db.prepare("SELECT * FROM approvals WHERE version_id=? AND artifact_id=? ORDER BY rowid").all(versionId,artifactId):this.db.prepare("SELECT * FROM approvals WHERE version_id=? ORDER BY rowid").all(versionId);}
}