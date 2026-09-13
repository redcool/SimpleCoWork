#!/usr/bin/env node
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { openStudioDb, closeStudioDb, StudioEventLog, StudioVersionStore } from "../src/studio/index.js";
const [, , command, projectArg, value] = process.argv;
const root=resolve(projectArg||".");
const dbPath=join(root,".cowork","project.db");
function runtime(){const db=openStudioDb(dbPath);const log=new StudioEventLog(join(root,".cowork","events.jsonl"));return {db,log,store:new StudioVersionStore({db,eventLog:log,projectRoot:root})};}
try {
  if(command==="init"){const r=runtime();const p=r.store.createProject({name:value||root.split(/[\\/]/).pop()});console.log(JSON.stringify(p,null,2));closeStudioDb(r.db);}
  else if(command==="version" && value){const r=runtime();const p=r.db.prepare("SELECT id FROM projects LIMIT 1").get();if(!p)throw new Error("请先 studio init <dir>");const v=r.store.createVersion({projectId:p.id,version:value});console.log(JSON.stringify(v,null,2));closeStudioDb(r.db);}
  else if(command==="status"){const r=runtime();console.log(JSON.stringify(r.db.prepare("SELECT * FROM versions ORDER BY rowid").all(),null,2));closeStudioDb(r.db);}
  else { console.log(["studio init <dir> [name]", "studio version <dir> <x.y.z.w>", "studio status <dir>"].join("\n")); process.exitCode=2; }
} catch(err){console.error(`[studio] ${err.message}`);process.exitCode=1;}
