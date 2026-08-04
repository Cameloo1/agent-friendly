import { randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildReportView, renderReportHtml } from "./report-viewer.mjs";

export class ScanStoreError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = "ScanStoreError";
    this.code = "scan_store_error";
  }
}

export function resolveScanRoot({
  env = process.env,
  platform = process.platform,
  homeDirectory = os.homedir(),
} = {}) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const explicit = env.IS_IT_AGENT_READY_SCAN_DIR?.trim();
  if (explicit) {
    if (!pathApi.isAbsolute(explicit)) {
      throw new ScanStoreError("IS_IT_AGENT_READY_SCAN_DIR must be an absolute path.");
    }
    return pathApi.normalize(explicit);
  }

  let stateDirectory;
  if (platform === "win32") {
    stateDirectory = env.LOCALAPPDATA?.trim() || pathApi.join(homeDirectory, "AppData", "Local");
  } else if (platform === "darwin") {
    stateDirectory = pathApi.join(homeDirectory, "Library", "Application Support");
  } else {
    stateDirectory = env.XDG_STATE_HOME?.trim() || pathApi.join(homeDirectory, ".local", "state");
  }
  return pathApi.join(stateDirectory, "is-it-agent-ready", "scans");
}

function hostSlug(url) {
  const hostname = new URL(url).hostname.toLowerCase();
  const slug = hostname.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "site";
}

function markdownReport(record) {
  const text = record.result.content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n");
  const scope = record.request.profile
    ? `Profile: ${record.request.profile}`
    : `Enabled checks: ${(record.request.enabledChecks || []).join(", ")}`;

  return [
    "# Saved agent-readiness scan",
    "",
    `- Scan ID: ${record.id}`,
    `- Target: ${record.request.url}`,
    `- Saved: ${record.savedAt}`,
    `- ${scope}`,
    "",
    "---",
    "",
    text || "_The scanner returned no text report. Inspect `scan.json` for the complete MCP result._",
    "",
  ].join("\n");
}

export class ScanStore {
  constructor({
    rootDirectory = resolveScanRoot(),
    now = () => new Date(),
    idFactory = randomUUID,
  } = {}) {
    if (!path.isAbsolute(rootDirectory)) {
      throw new ScanStoreError("Scan storage root must be an absolute path.");
    }
    this.rootDirectory = path.normalize(rootDirectory);
    this.now = now;
    this.idFactory = idFactory;
  }

  async save({ request, result }) {
    const savedAt = this.now().toISOString();
    const timestamp = savedAt.replace(/[:.]/g, "-");
    const id = `${timestamp}--${hostSlug(request.url)}--${this.idFactory()}`;
    const finalDirectory = path.join(this.rootDirectory, id);
    let pendingDirectory;

    try {
      await mkdir(this.rootDirectory, { recursive: true, mode: 0o700 });
      pendingDirectory = await mkdtemp(path.join(this.rootDirectory, ".pending-"));
      const record = {
        schemaVersion: 2,
        id,
        savedAt,
        request,
        result,
      };
      const reportView = buildReportView(record);
      record.viewer = {
        scoreBasis: "applicable_check_pass_rate",
        score: reportView.metrics.score,
        passing: reportView.metrics.passing,
        applicable: reportView.metrics.applicable,
        excluded: reportView.metrics.excluded,
        partial: reportView.partial,
      };
      await writeFile(
        path.join(pendingDirectory, "scan.json"),
        `${JSON.stringify(record, null, 2)}\n`,
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await writeFile(
        path.join(pendingDirectory, "report.md"),
        markdownReport(record),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await writeFile(
        path.join(pendingDirectory, "report.html"),
        renderReportHtml(reportView),
        { encoding: "utf8", flag: "wx", mode: 0o600 },
      );
      await rename(pendingDirectory, finalDirectory);
      pendingDirectory = undefined;
      return {
        id,
        savedAt,
        directory: finalDirectory,
        jsonPath: path.join(finalDirectory, "scan.json"),
        markdownPath: path.join(finalDirectory, "report.md"),
        viewerPath: path.join(finalDirectory, "report.html"),
      };
    } catch (error) {
      if (pendingDirectory) {
        await rm(pendingDirectory, { recursive: true, force: true }).catch(() => {});
      }
      if (error instanceof ScanStoreError) throw error;
      throw new ScanStoreError(`Could not save the completed scan: ${error.message}`, { cause: error });
    }
  }
}
