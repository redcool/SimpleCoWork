import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
export function buildManifest({version,versionId,baseVersionId=null,artifacts=[],approvals=[],tests=[],createdAt=new Date().toISOString()}){return {format:1,version,versionId,baseVersionId,status:"release-candidate",createdAt,artifacts,approvals,tests};}
export function writeManifest(releaseDir,manifest){mkdirSync(releaseDir,{recursive:true});const path=join(releaseDir,"manifest.json");writeFileSync(path,JSON.stringify(manifest,null,2),"utf8");return path;}