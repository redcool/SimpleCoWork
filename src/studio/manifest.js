import { writeFileSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
export function buildManifest({version,versionId,baseVersionId=null,artifacts=[],approvals=[],tests=[],files=[],dependencies=[],createdAt=new Date().toISOString()}){return {format:2,version,versionId,baseVersionId,status:"release-candidate",createdAt,artifacts,approvals,tests,files,dependencies};}
export function writeManifest(releaseDir,manifest){mkdirSync(releaseDir,{recursive:true});const path=join(releaseDir,"manifest.json");const tmp=path+".tmp-"+Date.now();writeFileSync(tmp,JSON.stringify(manifest,null,2),"utf8");renameSync(tmp,path);return path;}
