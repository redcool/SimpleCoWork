import test from "node:test";
import assert from "node:assert/strict";
import { buildControlProposal, validateControlProposal, executableActions } from "../src/studio/control.js";
test("control proposal separates low-risk and approval actions",()=>{const proposal=buildControlProposal({summary:"ready",actions:[{type:"start_ready_task",taskId:"x"},{type:"seal_release",requiresUserApproval:true}]});assert.equal(validateControlProposal(proposal).ok,true);assert.equal(executableActions(proposal).length,1);});
test("approval action cannot omit user approval",()=>{const proposal=buildControlProposal({summary:"bad",actions:[{type:"seal_release"}]});assert.equal(validateControlProposal(proposal).ok,false);});
