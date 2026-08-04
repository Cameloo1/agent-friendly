#!/usr/bin/env node

import { cp, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginRoot = path.join(packageRoot, "plugins", "is-it-agent-ready");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a path.`);
  return path.resolve(value);
}

function defaultConfigDir() {
  return process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "opencode")
    : path.join(homedir(), ".config", "opencode");
}

async function readConfig(configPath) {
  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    if (error instanceof SyntaxError) {
      throw new Error(`Refusing to modify malformed JSON at ${configPath}: ${error.message}`);
    }
    throw error;
  }
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Refusing to replace non-object OpenCode setting: ${label}`);
  }
  return value;
}

async function assertDirectoryOrMissing(directory) {
  try {
    const info = await stat(directory);
    if (!info.isDirectory()) throw new Error(`OpenCode config path is not a directory: ${directory}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

async function main() {
  const configDir = argumentValue("--config-dir") || defaultConfigDir();
  const dryRun = process.argv.includes("--dry-run");
  const v2 = process.argv.includes("--v2");
  await assertDirectoryOrMissing(configDir);

  const runtimeDir = path.join(configDir, "is-it-agent-ready");
  const skillDir = path.join(configDir, "skills", "is-it-agent-ready");
  const configPath = path.join(configDir, "opencode.json");
  const config = await readConfig(configPath);

  requireObject(config, "root");

  config.$schema ||= "https://opencode.ai/config.json";
  config.mcp ||= {};
  requireObject(config.mcp, "mcp");
  if (v2) {
    config.mcp.servers ||= {};
    requireObject(config.mcp.servers, "mcp.servers");
    config.mcp.servers["is-it-agent-ready"] = {
      type: "local",
      command: ["node", path.join(runtimeDir, "scripts", "mcp-proxy.mjs")],
      codemode: false,
    };
  } else {
    if ("servers" in config.mcp) {
      throw new Error("Detected an OpenCode V2 mcp.servers config; rerun with --v2.");
    }
    config.mcp["is-it-agent-ready"] = {
      type: "local",
      command: ["node", path.join(runtimeDir, "scripts", "mcp-proxy.mjs")],
      enabled: true,
    };
  }

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ mode: v2 ? "v2" : "stable", configDir, runtimeDir, skillDir, config }, null, 2)}\n`);
    return;
  }

  await mkdir(path.join(configDir, "skills"), { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  await cp(path.join(pluginRoot, "src"), path.join(runtimeDir, "src"), { recursive: true, force: true });
  await mkdir(path.join(runtimeDir, "scripts"), { recursive: true });
  await cp(
    path.join(pluginRoot, "scripts", "mcp-proxy.mjs"),
    path.join(runtimeDir, "scripts", "mcp-proxy.mjs"),
    { force: true },
  );
  await cp(path.join(pluginRoot, "skills", "is-it-agent-ready"), skillDir, { recursive: true, force: true });

  const configText = `${JSON.stringify(config, null, 2)}\n`;
  const tempPath = path.join(configDir, `.opencode.json.is-it-agent-ready-${process.pid}.tmp`);
  await writeFile(tempPath, configText, "utf8");

  let backupPath = null;
  try {
    await stat(configPath);
    backupPath = path.join(configDir, `opencode.json.backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
    await rename(configPath, backupPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  try {
    await rename(tempPath, configPath);
  } catch (error) {
    if (backupPath) await rename(backupPath, configPath);
    throw error;
  }

  process.stdout.write(`Installed is-it-agent-ready for OpenCode ${v2 ? "V2" : "stable"}.\nConfig: ${configPath}\n`);
  if (backupPath) process.stdout.write(`Previous config backup: ${backupPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
});
