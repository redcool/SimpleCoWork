#!/usr/bin/env node
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { openStudioDb, closeStudioDb, StudioEventLog, StudioVersionStore, StageGateStore, StudioTaskStore, StudioPlanBuilder, StudioBugStore } from "../src/studio/index.js";
const [, , command, projectArg, value] = process.argv;
const root=resolve(projectArg||".");
const dbPath=join(root,".cowork","project.db");
function runtime(){const db=openStudioDb(dbPath);const log=new StudioEventLog(join(root,".cowork","events.jsonl"),{db});return {db,log,store:new StudioVersionStore({db,eventLog:log,projectRoot:root}),tasks:new StudioTaskStore({db,eventLog:log}),bugs:new StudioBugStore({db,eventLog:log})};}
try {
  if(command==="init"){const r=runtime();const p=r.store.createProject({name:value||root.split(/[\\/]/).pop()});console.log(JSON.stringify(p,null,2));closeStudioDb(r.db);}
  else if(command==="version" && value){const r=runtime();const p=r.db.prepare("SELECT id FROM projects LIMIT 1").get();if(!p)throw new Error("请先 studio init <dir>");const v=r.store.createVersion({projectId:p.id,version:value});console.log(JSON.stringify(v,null,2));closeStudioDb(r.db);}
  else if(command==="stage" && value){const r=runtime();const gates=new StageGateStore({db:r.db,eventLog:r.log});const [versionId,stageKey,action="start"]=value.split(":");const out=action==="start"?gates.start(versionId,stageKey):gates.transition(versionId,stageKey,action);console.log(JSON.stringify(out,null,2));closeStudioDb(r.db);}
  else if(command==="tasks" && value){const r=runtime();const [versionId]=value.split(":");console.log(JSON.stringify(r.tasks.list(versionId),null,2));closeStudioDb(r.db);}
  else if(command==="task-retry" && value){const r=runtime();console.log(JSON.stringify(r.tasks.retry(value),null,2));closeStudioDb(r.db);}
  else if(command==="approve-version" && value){const r=runtime();console.log(JSON.stringify(r.store.approve(value),null,2));closeStudioDb(r.db);}
  else if(command==="seal" && value){const r=runtime();console.log(JSON.stringify(r.store.seal(value),null,2));closeStudioDb(r.db);}
  else if(command==="fork" && value){const r=runtime();const [baseId,version]=value.split(":");console.log(JSON.stringify(r.store.forkVersion({baseVersionId:baseId,version}),null,2));closeStudioDb(r.db);}
  else if(command==="plan" && value){const r=runtime();const p=r.db.prepare("SELECT id FROM projects LIMIT 1").get();if(!p)throw new Error("请先 studio init <dir>");const v=r.db.prepare("SELECT id FROM versions WHERE version=?").get(value);if(!v)throw new Error("版本不存在");const plan=new StudioPlanBuilder({tasks:r.tasks,eventLog:r.log});console.log(JSON.stringify(plan.create({versionId:v.id}),null,2));closeStudioDb(r.db);}
  else if(command==="recover"){const r=runtime();console.log(JSON.stringify(r.tasks.recoverRunning(),null,2));r.log.exportPending();closeStudioDb(r.db);}
  else if(command==="events-export"){const r=runtime();console.log(JSON.stringify({exported:r.log.exportPending(),pending:r.log.reconcile()},null,2));closeStudioDb(r.db);}
  else if(command==="bug-fix" && value){const r=runtime();const [bugId,stageKey,agentRole="developer"]=value.split(":");console.log(JSON.stringify(r.bugs.createFixTask({bugId,stageKey,agentRole}),null,2));closeStudioDb(r.db);}
  else if(command==="status"){const r=runtime();console.log(JSON.stringify(r.db.prepare("SELECT * FROM versions ORDER BY rowid").all(),null,2));closeStudioDb(r.db);}
  else { console.log(["studio init <dir> [name]", "studio version <dir> <x.y.z.w>", "studio status <dir>", "studio plan <dir> <version>", "studio stage <dir> <versionId:stage:action>", "studio recover <dir>", "studio events-export <dir>", "studio bug-fix <dir> <bugId:stage:agentRole>", "studio approve-version <dir> <versionId>", "studio seal <dir> <versionId>", "studio fork <dir> <baseVersionId:version>"].join("\n")); process.exitCode=2; }
} catch(err){console.error(`[studio] ${err.message}`);process.exitCode=1;}
