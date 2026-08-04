#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const plugin = path.join(root, "plugins", "is-it-agent-ready");

function fail(message) {
  throw new Error(message);
}

async function text(relative) {
  const value = await readFile(path.join(root, relative), "utf8");
  if (value.charCodeAt(0) === 0xfeff) fail(`${relative} contains a UTF-8 BOM.`);
  return value;
}

async function json(relative) {
  return JSON.parse(await text(relative));
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) fail("SKILL.md must start with YAML frontmatter.");
  const entries = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) fail(`Invalid frontmatter line: ${line}`);
    entries[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { entries, body: markdown.slice(match[0].length) };
}

const requiredFiles = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  "opencode.json",
  "opencode.v2.json",
  "plugins/is-it-agent-ready/.codex-plugin/plugin.json",
  "plugins/is-it-agent-ready/.claude-plugin/plugin.json",
  "plugins/is-it-agent-ready/.mcp.json",
  "plugins/is-it-agent-ready/skills/is-it-agent-ready/SKILL.md",
  "plugins/is-it-agent-ready/skills/is-it-agent-ready/agents/openai.yaml",
  "plugins/is-it-agent-ready/LICENSE",
  "README.md",
  "LICENSE",
  "docs/compatibility.md",
  ".github/workflows/ci.yml",
];
await Promise.all(requiredFiles.map((file) => text(file)));

for (const obsolete of [
  ".codex-plugin/plugin.json",
  ".mcp.json",
  "skills/is-it-agent-ready/SKILL.md",
]) {
  try {
    await text(obsolete);
    fail(`Obsolete pre-marketplace file is still present: ${obsolete}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const skillRelative = "plugins/is-it-agent-ready/skills/is-it-agent-ready/SKILL.md";
const skill = parseFrontmatter(await text(skillRelative));
if (JSON.stringify(Object.keys(skill.entries).sort()) !== JSON.stringify(["description", "name"])) {
  fail("Portable SKILL.md frontmatter must contain only name and description.");
}
if (skill.entries.name !== "is-it-agent-ready") fail("SKILL.md name must match its directory.");
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.entries.name) || skill.entries.name.length > 64) {
  fail("SKILL.md name is not portable lowercase kebab-case.");
}
if (skill.entries.description.length < 1 || skill.entries.description.length > 1024) {
  fail("SKILL.md description must fit OpenCode's portable 1-1024 character boundary.");
}
for (const phrase of ["Use when", "asks whether a site is agent-ready", "audit", "re-tested", "remediation"]) {
  if (!skill.entries.description.includes(phrase)) fail(`SKILL.md description lacks trigger intent: ${phrase}`);
}
if (skill.body.split(/\r?\n/).length > 500) fail("SKILL.md exceeds the 500-line progressive-disclosure budget.");

const codex = await json("plugins/is-it-agent-ready/.codex-plugin/plugin.json");
const claude = await json("plugins/is-it-agent-ready/.claude-plugin/plugin.json");
if (codex.name !== "is-it-agent-ready" || claude.name !== "is-it-agent-ready") fail("Manifest names disagree.");
if (codex.version !== claude.version || codex.version !== "1.0.0") fail("Manifest versions disagree.");
if (codex.skills !== "./skills/" || claude.skills !== "./skills/") fail("Manifest skill paths must be ./skills/.");
if (!codex.mcpServers || Array.isArray(codex.mcpServers) || typeof codex.mcpServers !== "object") {
  fail("Codex manifest must embed its platform-specific MCP server map.");
}
if (claude.mcpServers !== "./.mcp.json") fail("Claude manifest must use its platform-specific MCP config.");

const claudeMcp = await json("plugins/is-it-agent-ready/.mcp.json");
const codexServer = codex.mcpServers["is-it-agent-ready"];
const claudeServer = claudeMcp.mcpServers?.["is-it-agent-ready"];
if (codexServer?.command !== "node" || codexServer?.args?.[0] !== "./scripts/mcp-proxy.mjs") {
  fail("Codex MCP config must launch the bundled gateway from the plugin root.");
}
if (claudeServer?.command !== "node" || !claudeServer?.args?.[0]?.startsWith("${CLAUDE_PLUGIN_ROOT}/")) {
  fail("Claude MCP config must resolve the gateway through CLAUDE_PLUGIN_ROOT.");
}
for (const server of [codexServer, claudeServer]) {
  const serialized = JSON.stringify(server);
  if (/api.?key|authorization|bearer/i.test(serialized)) fail("MCP config must not require credentials.");
}

const opencode = await json("opencode.json");
const openCodeServer = opencode.mcp?.["is-it-agent-ready"];
if (openCodeServer?.type !== "local" || !Array.isArray(openCodeServer.command) || openCodeServer.enabled !== true) {
  fail("Stable OpenCode MCP config must use mcp.<name> with an enabled local command array.");
}
const opencodeV2 = await json("opencode.v2.json");
const openCodeV2Server = opencodeV2.mcp?.servers?.["is-it-agent-ready"];
if (!opencodeV2.skills?.includes("./plugins/is-it-agent-ready/skills")) fail("OpenCode V2 skill source is missing.");
if (openCodeV2Server?.type !== "local" || !Array.isArray(openCodeV2Server.command) || openCodeV2Server.codemode !== false) {
  fail("OpenCode V2 MCP config must use mcp.servers with a local command array.");
}

const codexMarket = await json(".agents/plugins/marketplace.json");
const claudeMarket = await json(".claude-plugin/marketplace.json");
if (codexMarket.plugins?.[0]?.source?.path !== "./plugins/is-it-agent-ready") fail("Codex marketplace path is invalid.");
if (claudeMarket.plugins?.[0]?.source !== "./plugins/is-it-agent-ready") fail("Claude marketplace path is invalid.");

const readme = await text("README.md");
for (const heading of ["## Codex", "## Claude Code", "## OpenCode", "## Safety boundaries", "## Limitations", "## License"]) {
  if (!readme.includes(heading)) fail(`README is missing ${heading}.`);
}
if (!/not authored[^\n]+endorsed by Cloudflare/i.test(readme)) fail("README lacks the unofficial integration notice.");

const workflow = await text(".github/workflows/ci.yml");
for (const contract of [
  "os: [ubuntu-latest, macos-latest, windows-latest]",
  "node: [22, 24, 26]",
  "actions/checkout@v6",
  "actions/setup-node@v6",
  "npm run validate",
  "npm test",
  "npm run smoke:offline",
  "npm run test:live",
]) {
  if (!workflow.includes(contract)) fail(`CI workflow is missing required contract: ${contract}`);
}

const allJson = [
  ".agents/plugins/marketplace.json",
  ".claude-plugin/marketplace.json",
  "opencode.json",
  "opencode.v2.json",
  "package.json",
  "plugins/is-it-agent-ready/.codex-plugin/plugin.json",
  "plugins/is-it-agent-ready/.claude-plugin/plugin.json",
  "plugins/is-it-agent-ready/.mcp.json",
];
await Promise.all(allJson.map((file) => json(file)));

process.stdout.write(`PASS: Codex, Claude Code, stable OpenCode, OpenCode V2, MCP, skill, README, and JSON package contracts validated at ${plugin}.\n`);
