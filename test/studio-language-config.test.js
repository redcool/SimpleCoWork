import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadStudioFrameworkConfig, validateStudioFrameworkConfig, languageDirective, withLanguageSuffix, DEFAULT_LANGUAGES } from "../src/studio/studio-config.js";
import { runStudioLayer } from "../src/studio/layers.js";

test("framework config falls back to defaults when file missing", () => {
  const root = mkdtempSync(join(tmpdir(), "fwcfg-"));
  const fw = loadStudioFrameworkConfig(root);
  assert.equal(fw.source, "default");
  assert.deepEqual(fw.languages, ["zh"]);
  assert.deepEqual(DEFAULT_LANGUAGES, ["zh"]);
});

test("framework config reads languages and warns on unknown keys", () => {
  const root = mkdtempSync(join(tmpdir(), "fwcfg-"));
  writeFileSync(join(root, "studio_config.json"), JSON.stringify({ version: 1, languages: ["zh", "en"], futureOption: 1 }));
  const fw = loadStudioFrameworkConfig(root);
  assert.equal(fw.source, "file");
  assert.deepEqual(fw.languages, ["zh", "en"]);
  assert.ok(fw.warnings.some(w => w.includes("futureOption")));
});

test("framework config rejects invalid languages", () => {
  assert.equal(validateStudioFrameworkConfig({ languages: [] }).ok, false);
  assert.equal(validateStudioFrameworkConfig({ languages: ["chinese"] }).ok, false);
  assert.equal(validateStudioFrameworkConfig({ languages: "zh" }).ok, false);
  assert.equal(validateStudioFrameworkConfig({ languages: ["zh", "zh"] }).ok, false);
  assert.equal(validateStudioFrameworkConfig({ languages: ["zh-TW"] }).ok, true);
  const root = mkdtempSync(join(tmpdir(), "fwcfg-"));
  writeFileSync(join(root, "studio_config.json"), "{ broken");
  assert.throws(() => loadStudioFrameworkConfig(root), /不是有效 JSON/);
  const root2 = mkdtempSync(join(tmpdir(), "fwcfg-"));
  writeFileSync(join(root2, "studio_config.json"), JSON.stringify({ languages: [] }));
  assert.throws(() => loadStudioFrameworkConfig(root2), /languages 不能为空/);
});

test("language suffix inserts code before extension", () => {
  assert.equal(withLanguageSuffix("requirements.md", "zh"), "requirements.zh.md");
  assert.equal(withLanguageSuffix("asset-spec.json", "en"), "asset-spec.en.json");
  assert.equal(withLanguageSuffix("plan", "zh"), "plan.zh");
  assert.match(languageDirective("zh"), /简体中文/);
  assert.match(languageDirective("en"), /English/);
});

test("layer generates one document per configured language", async () => {
  const root = mkdtempSync(join(tmpdir(), "lang-layer-"));
  const seen = [];
  const provider = { name: "cap", model: "m", generate: async req => { seen.push(req.user); return "# doc"; } };
  const result = await runStudioLayer({ mode: "qa", input: root, output: join(root, "out"), provider, languages: ["zh", "en"] });
  assert.deepEqual(result.languages, ["zh", "en"]);
  assert.deepEqual(result.files, ["qa-report.zh.md", "qa-report.en.md", "bug-list.zh.md", "bug-list.en.md", "performance-security.zh.md", "performance-security.en.md"]);
  for (const f of result.files) assert.ok(existsSync(join(root, "out", f)));
  assert.equal(seen.length, 6);
  assert.ok(seen[0].includes("简体中文"));
  assert.ok(seen[1].includes("English"));
  const manifest = JSON.parse(readFileSync(join(root, "out", "layer-manifest.json"), "utf8"));
  assert.deepEqual(manifest.languages, ["zh", "en"]);
});

test("layer defaults to zh suffix and validates languages argument", async () => {
  const root = mkdtempSync(join(tmpdir(), "lang-layer-"));
  const result = await runStudioLayer({ mode: "requirements", input: join(root, "idea"), output: join(root, "out") });
  assert.deepEqual(result.files, ["requirements.zh.md", "feature-list.zh.md", "asset-spec.zh.md", "acceptance.zh.md"]);
  await assert.rejects(() => runStudioLayer({ mode: "qa", input: root, output: join(root, "o2"), languages: [] }), /languages 必须是非空语言代码数组/);
  await assert.rejects(() => runStudioLayer({ mode: "qa", input: root, output: join(root, "o3"), languages: ["klingon"] }), /语言代码非法|必须是非空/);
});
