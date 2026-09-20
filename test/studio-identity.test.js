import test from "node:test";
import assert from "node:assert/strict";
import { createActor, assertCapability } from "../src/studio/index.js";
test("actor identity and capability are explicit",()=>{const a=createActor({id:"manager",role:"manager",capabilities:["process-monitoring"]});assert.equal(a.id,"manager");assert.equal(assertCapability(a,"process-monitoring"),true);assert.throws(()=>assertCapability(a,"seal-release"),/capability/);});
