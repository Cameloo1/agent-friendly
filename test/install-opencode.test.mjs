import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(root, "scripts", "install-opencode.mjs");

function runInstaller(configDir, ...extra) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installer, "--config-dir", configDir, ...extra], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("OpenCode installer preserves unrelated config and installs portable paths", async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), "is-it-agent-ready-opencode-"));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  const configPath = path.join(configDir, "opencode.json");
  await writeFile(configPath, `${JSON.stringify({ theme: "system", mcp: { existing: { type: "remote", url: "https://example.org/mcp" } } }, null, 2)}\n`);

  const result = await runInstaller(configDir);
  assert.equal(result.code, 0, result.stderr);
  const installed = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(installed.theme, "system");
  assert.equal(installed.mcp.existing.url, "https://example.org/mcp");
  const command = installed.mcp["is-it-agent-ready"].command;
  assert.equal(command[0], "node");
  assert.equal(path.isAbsolute(command[1]), true);
  assert.match(await readFile(path.join(configDir, "skills", "is-it-agent-ready", "SKILL.md"), "utf8"), /^---\nname: is-it-agent-ready\n/);
  assert.match(await readFile(path.join(configDir, "is-it-agent-ready", "scripts", "mcp-proxy.mjs"), "utf8"), /stdio-server\.mjs/);
  assert.match(result.stdout, /Previous config backup:/);
});

test("OpenCode installer emits the V2 mcp.servers shape when requested", async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), "is-it-agent-ready-opencode-"));
  t.after(() => rm(configDir, { recursive: true, force: true }));

  const result = await runInstaller(configDir, "--v2");
  assert.equal(result.code, 0, result.stderr);
  const installed = JSON.parse(await readFile(path.join(configDir, "opencode.json"), "utf8"));
  assert.equal(installed.mcp.servers["is-it-agent-ready"].type, "local");
  assert.equal(installed.mcp.servers["is-it-agent-ready"].codemode, false);
});

test("OpenCode installer rejects incompatible config without overwriting it", async (t) => {
  const configDir = await mkdtemp(path.join(tmpdir(), "is-it-agent-ready-opencode-"));
  t.after(() => rm(configDir, { recursive: true, force: true }));
  const configPath = path.join(configDir, "opencode.json");
  const original = '{"mcp":"legacy-shape"}\n';
  await writeFile(configPath, original);

  const result = await runInstaller(configDir);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Refusing to replace non-object OpenCode setting: mcp/);
  assert.equal(await readFile(configPath, "utf8"), original);
});

test("OpenCode installer dry-run performs no writes", async (t) => {
  const parent = await mkdtemp(path.join(tmpdir(), "is-it-agent-ready-opencode-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const configDir = path.join(parent, "new-config");

  const result = await runInstaller(configDir, "--dry-run");
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /is-it-agent-ready/);
  await assert.rejects(() => readFile(path.join(configDir, "opencode.json"), "utf8"), { code: "ENOENT" });
});
