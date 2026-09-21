import { randomUUID, createHash } from "node:crypto";
function now(){ return new Date().toISOString(); }
function json(v){ return JSON.stringify(v ?? {}); }
export class StudioGoalStore {
  constructor({db,eventLog}={}){ this.db=db; this.events=eventLog; }
  create({id=randomUUID(),versionId,objective,acceptance={},policy={}}){ const t=now(); this.db.prepare("INSERT INTO studio_goals(id,version_id,objective,acceptance,policy,status,progress,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,versionId,objective,json(acceptance),json(policy),"active",json({}),t,t); return this.get(id); }
  get(id){ const g=this.db.prepare("SELECT * FROM studio_goals WHERE id=?").get(id); if(!g) throw new Error("未知 Studio Goal"); return {...g,versionId:g.version_id,acceptance:JSON.parse(g.acceptance),policy:JSON.parse(g.policy),progress:JSON.parse(g.progress||"{}")}; }
  updateStatus(id,status,progress={},reason=null){ this.db.prepare("UPDATE studio_goals SET status=?,progress=?,updated_at=?,completed_at=CASE WHEN ? IN ('completed','failed','cancelled') THEN ? ELSE completed_at END WHERE id=?").run(status,json(progress),now(),status,now(),id); this.events?.append("studio.goal."+status,{goalId:id,reason,progress}); return this.get(id); }
}
export class WorkflowRunStore {
  constructor({db,eventLog}={}){ this.db=db; this.events=eventLog; }
  start({goalId,versionId,id=randomUUID()}){ const t=now(); this.db.prepare("INSERT INTO studio_workflow_runs(id,goal_id,version_id,status,round,started_at,updated_at) VALUES(?,?,?,?,?,?,?)").run(id,goalId,versionId,"runnable",0,t,t); this.events?.append("studio.run.started",{runId:id,goalId,versionId}); return this.get(id); }
  get(id){ const r=this.db.prepare("SELECT * FROM studio_workflow_runs WHERE id=?").get(id); if(!r) throw new Error("未知 Workflow Run"); return {...r,goalId:r.goal_id,versionId:r.version_id}; }
  setStatus(id,status,reason=null){ this.db.prepare("UPDATE studio_workflow_runs SET status=?,termination_reason=?,updated_at=?,finished_at=CASE WHEN ? IN ('completed','failed','cancelled','blocked','stalled') THEN ? ELSE finished_at END WHERE id=?").run(status,reason,now(),status,now(),id); this.events?.append("studio.run."+status,{runId:id,reason}); return this.get(id); }
  pause(id){ return this.setStatus(id,"paused","user_pause"); }
  resume(id){ const r=this.get(id); if(!["paused","waiting_for_user"].includes(r.status)) throw new Error("运行实例当前不能 resume"); return this.setStatus(id,"runnable",null); }
  waitForUser(id,reason="confirmation_pending"){ return this.setStatus(id,"waiting_for_user",reason); }
  cancel(id,reason="user_cancel"){ return this.setStatus(id,"cancelled",reason); }
  latestCheckpoint(runId){const cp=this.db.prepare("SELECT * FROM studio_checkpoints WHERE run_id=? ORDER BY round DESC LIMIT 1").get(runId);if(cp)cp.state=JSON.parse(cp.state||"{}");return cp;}
  recover(runId){const r=this.get(runId);const cp=this.latestCheckpoint(runId);if(["completed","cancelled","blocked","stalled"].includes(r.status))return {run:r,checkpoint:cp,recoverable:false};if(cp&&r.status==="runnable")return {run:r,checkpoint:cp,recoverable:true};return {run:r,checkpoint:cp,recoverable:["paused","waiting_for_user","runnable"].includes(r.status)};}
  checkpoint({runId,round,state,snapshot=null,proposal=null,usage=null}){ this.events?.append("studio.checkpoint.created",{runId,round}); if(usage)this.db.prepare("UPDATE studio_workflow_runs SET provider_calls=provider_calls+1,provider_tokens=provider_tokens+?,provider_cost=provider_cost+? WHERE id=?").run(Number(usage.total_tokens||usage.totalTokens||0),Number(usage.cost||0),runId); const hash=x=>x?createHash("sha256").update(JSON.stringify(x)).digest("hex"):null; this.db.prepare("INSERT OR REPLACE INTO studio_checkpoints(id,run_id,round,snapshot_hash,proposal_hash,state,created_at) VALUES(?,?,?,?,?,?,?)").run(randomUUID(),runId,round,hash(snapshot),hash(proposal),json(state),now()); this.db.prepare("UPDATE studio_workflow_runs SET round=?,updated_at=? WHERE id=?").run(round,now(),runId); }
}
