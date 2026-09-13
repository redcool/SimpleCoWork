import { randomUUID } from "node:crypto";
export class ChangeSetStore {
  constructor({db,eventLog}){this.db=db;this.events=eventLog;}
  create({versionId,baseVersionId=null,title,changes=[]}){const id=randomUUID();this.events?.append("changeset.created",{id,versionId,baseVersionId,title,changes});return {id,versionId,baseVersionId,title,changes};}
}