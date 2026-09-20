export const ACTOR_TYPES=new Set(["manager","producer","planner","designer","developer","artist","qa","reviewer","user","system","control"]);
export function createActor({id,role,capabilities=[]}={}){if(!id||!role)throw new Error("Actor 需要 id 和 role");if(!ACTOR_TYPES.has(role))throw new Error(`不支持的 Actor role: ${role}`);return Object.freeze({id,role,capabilities:[...capabilities]});}
export function assertCapability(actor,capability){if(!actor||!actor.id)throw new Error("缺少 Actor 身份");if(!actor.capabilities?.includes(capability))throw new Error(`Actor ${actor.id} 缺少 capability: ${capability}`);return true;}
export function actorName(actor){return actor?.id||"anonymous";}
