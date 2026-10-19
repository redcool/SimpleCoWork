import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runStudioLayer } from "../src/studio/layers.js";

test("directory input passes file contents into the layer prompt", async () => {
  const root = mkdtempSync(join(tmpdir(), "layer-input-"));
  const input = join(root, "upstream");
  mkdirSync(input);
  writeFileSync(join(input, "small.md"), "上游核心内容ABC");
  writeFileSync(join(input, "big.md"), "X".repeat(9000));
  const seen = [];
  const provider = { name: "cap", model: "m", generate: async req => { seen.push(req.user); return "# doc"; } };
  await runStudioLayer({ mode: "qa", input, output: join(root, "out"), provider, languages: ["zh"] });
  const prompt = seen[0];
  assert.ok(prompt.includes("### small.md"));
  assert.ok(prompt.includes("上游核心内容ABC"));
  assert.ok(prompt.includes("### big.md"));
  assert.ok(prompt.includes("（单文件截断）"), "超长文件应被截断并标注");
  assert.ok(prompt.length < 40000, "提示词应受总量上限约束");
});

test("directory input marks unread files at total cap", async () => {
  const root = mkdtempSync(join(tmpdir(), "layer-input-cap-"));
  const input = join(root, "upstream");
  mkdirSync(input);
  for (let i = 0; i < 6; i++) writeFileSync(join(input, `f${i}.md`), "Y".repeat(9000));
  const seen = [];
  const provider = { name: "cap", model: "m", generate: async req => { seen.push(req.user); return "# doc"; } };
  await runStudioLayer({ mode: "qa", input, output: join(root, "out"), provider, languages: ["zh"] });
  assert.ok(seen[0].includes("（未读文件，已达输入总量上限）"));
  assert.ok(seen[0].includes("f5.md"));
});
