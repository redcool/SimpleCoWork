import test from "node:test";
import assert from "node:assert/strict";
import { loadStudioConfig, agentMap } from "../src/studio/config.js";
test("loads editable Studio agents and provider",()=>{const c=loadStudioConfig("./examples/studio-small/agents.json");assert.equal(c.agents.length,3);assert.equal(agentMap(c).artist.model,"agnes-2.5-flash");assert.deepEqual(c.registry.list(),["agnes"]);});
