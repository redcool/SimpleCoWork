import { writeFileSync, mkdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";
const FORMATS=new Set(["md","json","csv"]);
const sha256=(v)=>createHash("sha256").update(v).digest("hex");
const safeName=(name)=>{if(typeof name!=="string"||!/^[A-Za-z0-9_.-]+$/.test(name))throw new Error("文档名非法");return name;};
export class StudioDocumentStore {
  constructor({db,eventLog,workspacePath}){this.db=db;this.events=eventLog;this.workspace=resolve(workspacePath);}
  submit({versionId,type,name,format="md",content,producer="agent",state="submitted",baseArtifacts=[]}){if(typeof content!=="string"||!content.trim())throw new Error("文档内容不能为空");if(!FORMATS.has(format))throw new Error("不支持的文档格式");safeName(name);if(format==="json"){try{JSON.parse(content);}catch{throw new Error("JSON 文档格式无效");}}const dir=join(this.workspace,"documents");mkdirSync(dir,{recursive:true});const path=join(dir,name+"."+format);writeFileSync(path,content,"utf8");const id=randomUUID();const checksum=sha256(content);this.db.prepare("INSERT INTO artifacts(id,version_id,type,name,state,producer,checksum) VALUES(?,?,?,?,?,?,?)").run(id,versionId,type,name,state,producer,checksum);for(const dep of baseArtifacts)this.db.prepare("INSERT INTO artifact_dependencies(artifact_id,depends_on_artifact_id,relation) VALUES(?,?,?)").run(id,dep,"input");this.events?.append("document.submitted",{id,versionId,type,name,path,checksum});return {id,path,relativePath:relative(this.workspace,path),checksum};}
}