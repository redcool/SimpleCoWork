import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStudioDb, closeStudioDb, StudioEventLog, StudioVersionStore, StageGateStore, StudioArtifactStore } from "../src/studio/index.js";
const root=mkdtempSync(join(tmpdir(),"studio-demo-"));
const db=openStudioDb(join(root,".cowork","project.db")); const log=new StudioEventLog(join(root,".cowork","events.jsonl"));
const versions=new StudioVersionStore({db,eventLog:log,projectRoot:root}); const project=versions.createProject({name:"studio-demo"});
const v=versions.createVersion({projectId:project.id,version:"0.1.0.0"});
const gates=new StageGateStore({db,eventLog:log}); for(const stage of ["planning","design","asset-spec","production","playable"]){gates.start(v.id,stage);gates.transition(v.id,stage,"reviewing");gates.transition(v.id,stage,"approved");}
writeFileSync(join(v.workspace_path,"documents","version-plan.md"),"# Studio Demo Version Plan\n");
const artifacts=new StudioArtifactStore({db,eventLog:log}); const gdd=artifacts.create({versionId:v.id,type:"document",name:"main-design",state:"approved",checksum:"demo"});
versions.approve(v.id); const release=versions.seal(v.id);
const next=versions.forkVersion({baseVersionId:v.id,version:"0.1.1.0"}); const inherited=artifacts.inherit({versionId:next.id,sourceArtifactId:gdd.id,inheritMode:"reuse"});
console.log(JSON.stringify({root,release:release.release_path,next:next.version,inherited:inherited.inherit_mode,events:readFileSync(join(root,".cowork","events.jsonl"),"utf8").trim().split("\n").length},null,2)); closeStudioDb(db);