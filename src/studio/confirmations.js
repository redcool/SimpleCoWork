import { randomUUID } from "node:crypto";
export class ConfirmationQueue {
  constructor({eventLog=null}={}){this.events=eventLog;this.items=[];}
  request({type,payload={},requestedBy="system",reason=""}){if(!type)throw new Error("确认请求类型不能为空");const item={id:randomUUID(),type,payload,requestedBy,reason,status:"pending",createdAt:new Date().toISOString()};this.items.push(item);this.events?.append("confirmation.requested",item);return item;}
  list(){return this.items.filter(x=>x.status==="pending");}
  decide(id,{approved,actorId,comment=""}){const item=this.items.find(x=>x.id===id);if(!item)throw new Error("确认请求不存在");if(item.status!=="pending")throw new Error("确认请求已处理");if(!actorId)throw new Error("确认必须提供 actorId");item.status=approved?"approved":"rejected";item.actorId=actorId;item.comment=comment;item.decidedAt=new Date().toISOString();this.events?.append("confirmation."+item.status,item);return item;}
}
