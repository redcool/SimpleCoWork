import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
export class StudioEventLog {
  constructor(path,{db=null}={}){this.path=path;this.db=db;mkdirSync(dirname(path),{recursive:true});}
  append(type,payload={},actor="system"){const event={id:randomUUID(),ts:new Date().toISOString(),type,actor,payload};if(this.db)this.db.prepare("INSERT INTO event_outbox(id,event_id,type,actor,payload,created_at) VALUES(?,?,?,?,?,?)").run(randomUUID(),event.id,type,actor,JSON.stringify(payload),event.ts);else appendFileSync(this.path,JSON.stringify(event)+"\n");return event;}
  exportedIds(){try{return new Set(readFileSync(this.path,"utf8").split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line).id;}catch{return null;}}).filter(Boolean));}catch{return new Set();}}
  exportPending(){if(!this.db)return 0;const existing=this.exportedIds();const rows=this.db.prepare("SELECT * FROM event_outbox WHERE exported_at IS NULL ORDER BY created_at").all();let count=0;for(const row of rows){if(!existing.has(row.event_id)){appendFileSync(this.path,JSON.stringify({id:row.event_id,ts:row.created_at,type:row.type,actor:row.actor,payload:JSON.parse(row.payload)})+"\n");existing.add(row.event_id);count++;}this.db.prepare("UPDATE event_outbox SET exported_at=? WHERE id=?").run(new Date().toISOString(),row.id);}return count;}
  reconcile(){if(!this.db)return 0;return this.db.prepare("SELECT COUNT(*) AS n FROM event_outbox WHERE exported_at IS NULL").get().n;}
}
