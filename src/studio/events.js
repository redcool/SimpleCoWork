import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
export class StudioEventLog {
  constructor(path) { this.path=path; mkdirSync(dirname(path),{recursive:true}); }
  append(type,payload={},actor="system") { const event={id:randomUUID(),ts:new Date().toISOString(),type,actor,payload}; appendFileSync(this.path,JSON.stringify(event)+"\n"); return event; }
}