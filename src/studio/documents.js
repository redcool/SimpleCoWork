import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
export class StudioDocumentStore {
  constructor({db,eventLog,workspacePath}){this.db=db;this.events=eventLog;this.workspace=resolve(workspacePath);}
  submit({versionId,type,name,format="md",content,producer="agent",state="submitted"}){if(typeof content!=="string"||!content.trim())throw new Error("文档内容不能为空");if(!["md","json","csv"].includes(format))throw new Error("不支持的文档格式");const dir=format==="md"?"documents":"documents";const path=join(this.workspace,dir,name+"."+format);mkdirSync(join(this.workspace,dir),{recursive:true});if(format==="json"){try{JSON.parse(content);}catch{throw new Error("JSON 文档格式无效");}}writeFileSync(path,content,"utf8");const id=randomUUID();this.db.prepare("INSERT INTO artifacts(id,version_id,type,name,state,producer,checksum) VALUES(?,?,?,?,?,?,?)").run(id,versionId,type,name,state,producer,null);this.events?.append("document.submitted",{id,versionId,type,name,path});return {id,path,relativePath:relative(this.workspace,path)};}
}