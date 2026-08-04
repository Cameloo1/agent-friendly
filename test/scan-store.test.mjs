import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  ScanStore,
  ScanStoreError,
  resolveScanRoot,
} from "../plugins/is-it-agent-ready/src/scan-store.mjs";

test("resolves platform-specific scan roots without writing to the repository", () => {
  assert.equal(
    resolveScanRoot({
      env: { LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local" },
      platform: "win32",
      homeDirectory: "C:\\Users\\tester",
    }),
    path.win32.join("C:\\Users\\tester\\AppData\\Local", "is-it-agent-ready", "scans"),
  );
  assert.equal(
    resolveScanRoot({
      env: { XDG_STATE_HOME: "/var/tmp/state" },
      platform: "linux",
      homeDirectory: "/home/tester",
    }),
    path.posix.join("/var/tmp/state", "is-it-agent-ready", "scans"),
  );
  assert.equal(
    resolveScanRoot({ env: {}, platform: "darwin", homeDirectory: "/Users/tester" }),
    path.posix.join("/Users/tester", "Library", "Application Support", "is-it-agent-ready", "scans"),
  );
});

test("requires an absolute explicit storage path", () => {
  assert.throws(
    () => resolveScanRoot({ env: { IS_IT_AGENT_READY_SCAN_DIR: "relative/scans" } }),
    ScanStoreError,
  );
});

test("atomically saves JSON, Markdown, and the offline HTML viewer", async (t) => {
  const rootDirectory = await mkdtemp(path.join(os.tmpdir(), "is-it-agent-ready-store-"));
  t.after(() => rm(rootDirectory, { recursive: true, force: true }));
  const store = new ScanStore({
    rootDirectory,
    now: () => new Date("2026-08-04T12:34:56.789Z"),
    idFactory: () => "fixed-id",
  });
  const request = { url: "https://www.example.com/", profile: "content" };
  const result = {
    content: [{
      type: "text",
      text: "# Agent Readiness: https://www.example.com/\n\n## Discoverability (1/2 passing)\n- PASS robotsTxt: robots.txt exists\n- FAIL sitemap -- Publish a sitemap\n  sitemap.xml not found",
    }],
    _meta: { partial: false },
  };

  const saved = await store.save({ request, result });
  assert.equal(saved.id, "2026-08-04T12-34-56-789Z--www-example-com--fixed-id");
  assert.equal(path.dirname(saved.jsonPath), saved.directory);
  assert.equal(path.dirname(saved.markdownPath), saved.directory);

  const record = JSON.parse(await readFile(saved.jsonPath, "utf8"));
  assert.equal(record.schemaVersion, 2);
  assert.deepEqual(record.request, request);
  assert.deepEqual(record.result, result);
  assert.deepEqual(record.viewer, {
    scoreBasis: "applicable_check_pass_rate",
    score: 50,
    passing: 1,
    applicable: 2,
    excluded: 0,
    partial: false,
  });

  const markdown = await readFile(saved.markdownPath, "utf8");
  assert.match(markdown, /Scan ID: 2026-08-04T12-34-56-789Z--www-example-com--fixed-id/);
  assert.match(markdown, /Profile: content/);
  assert.match(markdown, /sitemap\.xml not found/);

  const viewer = await readFile(saved.viewerPath, "utf8");
  assert.match(viewer, />50<span>\/100<\/span>/);
  assert.match(viewer, /<code>sitemap<\/code>/);
  assert.match(viewer, /<strong>Evidence:<\/strong> sitemap\.xml not found/);
  assert.doesNotMatch(viewer, /<script/i);
});
