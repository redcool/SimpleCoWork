import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createProviderRegistry } from "../providers/index.js";
const env=(v)=>typeof v==="string"?v.replace(/\$\{([A-Z0-9_]+)\}/g,(_,k)=>process.env[k]||""):v;
export function loadStudioConfig(file){const path=resolve(file);if(!existsSync(path))throw new Error(`Studio 配置不存在: ${path}`);const raw=JSON.parse(readFileSync(path,"utf8"));const providers={};for(const [name,cfg] of Object.entries(raw.providers||{})){providers[name]={...cfg,apiKey:env(cfg.apiKey),baseURL:env(cfg.baseURL)};}for(const a of raw.agents||[]){if(!a.provider) a.provider=Object.keys(providers)[0]||"mock";}const registry=createProviderRegistry(providers);return {...raw,agents:(raw.agents||[]).map(a=>({...a,prompt:a.prompt||`你是${a.role}。`,providerInstance:registry.get(a.provider)})),providers,registry};}
export function agentMap(config){return Object.fromEntries(config.agents.map(a=>[a.id,a]));}
export function createStudioProviders(config){return config.registry;}