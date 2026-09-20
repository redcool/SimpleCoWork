import { buildControlProposal, validateControlProposal, executableActions } from "../../src/studio/control.js";
const proposal=buildControlProposal({summary:"三人 Studio 离线控制循环",observations:[{type:"stage_ready",stageKey:"planning"}],actions:[{type:"export_events",reason:"审计"},{type:"approve_stage",stageKey:"planning",requiresUserApproval:true}],requiresUserDecision:[{type:"approve_stage",stageKey:"planning"}]});
console.log(JSON.stringify({mode:"offline",proposal,validation:validateControlProposal(proposal),executable:executableActions(proposal)},null,2));
