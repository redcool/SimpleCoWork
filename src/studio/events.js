import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
export class StudioEventLog {
  constructor(path,{db=null}={}){this.path=path;this.db=db;mkdirSync(dirname(path),{recursive:true});}
  append(type,payload={},actor="system"){const event={id:randomUUID(),ts:new Date().toISOString(),type,actor,payload};if(this.db){this.db.prepare("INSERT INTO event_outbox(id,event_id,type,actor,payload,created_at) VALUES(?,?,?,?,?,?)").run(randomUUID(),event.id,type,actor,JSON.stringify(payload),event.ts);}else appendFileSync(this.path,JSON.stringify(event)+"\n");return event;}
  exportPending(){if(!this.db)return 0;const rows=this.db.prepare("SELECT * FROM event_outbox WHERE exported_at IS NULL ORDER BY created_at").all();for(const row of rows){appendFileSync(this.path,JSON.stringify({id:row.event_id,ts:row.created_at,type:row.type,actor:row.actor,payload:JSON.parse(row.payload)})+"\n");this.db.prepare("UPDATE event_outbox SET exported_at=? WHERE id=?").run(new Date().toISOString(),row.id);}return rows.length;}
  reconcile(){if(!this.db)return 0;return this.db.prepare("SELECT COUNT(*) AS n FROM event_outbox WHERE exported_at IS NULL").get().n;}
}