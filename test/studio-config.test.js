import test from "node:test";
import assert from "node:assert/strict";
import { loadStudioConfig, agentMap, validateStudioConfig, layerAgent } from "../src/studio/config.js";
test("loads editable Studio agents and provider",()=>{const c=loadStudioConfig("./examples/studio-small/agents.json");assert.equal(c.agents.length,3);assert.equal(agentMap(c).artist.model,"agnes-2.5-flash");assert.deepEqual(c.registry.list(),["agnes"]);});
test("maps standard layers to available agents",()=>{const c=loadStudioConfig("./examples/studio-standard/agents.json");assert.equal(layerAgent(c,"qa").role,"qa");assert.equal(layerAgent(c,"development").role,"technical-designer");});
test("reports duplicate agent ids",()=>{const result=validateStudioConfig({agents:[{id:"x",role:"a"},{id:"x",role:"b"}],providers:{mock:{kind:"mock"}}});assert.equal(result.ok,false);assert.match(result.errors.join(" "),/重复/);});
