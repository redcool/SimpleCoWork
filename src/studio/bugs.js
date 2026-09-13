import { randomUUID } from "node:crypto";
export class StudioBugStore {
  constructor({db,eventLog}){this.db=db;this.events=eventLog;}
  create({versionId,title,severity="medium",priority="P2"}){const id=randomUUID();this.db.prepare("INSERT INTO bugs(id,version_id,title,severity,priority,status) VALUES(?,?,?,?,?,?)").run(id,versionId,title,severity,priority,"open");this.events?.append("bug.created",{id,versionId,title});return this.get(id);}
  get(id){const b=this.db.prepare("SELECT * FROM bugs WHERE id=?").get(id);if(!b)throw new Error("未知 Bug");return b;}
  route({bugId,targetStage,impactType="implementation",requiresUserApproval=false,artifactId=null}){this.get(bugId);this.db.prepare("INSERT INTO bug_impacts(bug_id,artifact_id,target_stage,impact_type,requires_user_approval) VALUES(?,?,?,?,?)").run(bugId,artifactId,targetStage,impactType,requiresUserApproval?1:0);this.db.prepare("UPDATE bugs SET status=? WHERE id=?").run("triaged",bugId);this.events?.append("bug.routed",{bugId,targetStage,artifactId});return this.get(bugId);}
}