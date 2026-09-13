import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 1;
export function openStudioDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, root_path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), version TEXT NOT NULL, status TEXT NOT NULL, base_version_id TEXT, workspace_path TEXT NOT NULL, release_path TEXT, UNIQUE(project_id, version));
    CREATE TABLE IF NOT EXISTS stages (id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions(id), stage_key TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT, completed_at TEXT, UNIQUE(version_id, stage_key));
    CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions(id), type TEXT NOT NULL, name TEXT NOT NULL, state TEXT NOT NULL, source_artifact TEXT, inherit_mode TEXT, checksum TEXT);
    CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, artifact_id TEXT, version_id TEXT NOT NULL REFERENCES versions(id), approver_type TEXT NOT NULL, decision TEXT NOT NULL, comment TEXT);
    CREATE TABLE IF NOT EXISTS bug_impacts (bug_id TEXT NOT NULL REFERENCES bugs(id), artifact_id TEXT, target_stage TEXT NOT NULL, impact_type TEXT NOT NULL, requires_user_approval INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (bug_id, artifact_id, target_stage));
    CREATE TABLE IF NOT EXISTS bugs (id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES versions(id), title TEXT NOT NULL, severity TEXT NOT NULL, priority TEXT NOT NULL, status TEXT NOT NULL);`);
  db.prepare("INSERT OR REPLACE INTO schema_meta(key,value) VALUES (?,?)").run("schema_version", String(SCHEMA_VERSION));
  return db;
}
export function closeStudioDb(db) { db.close(); }