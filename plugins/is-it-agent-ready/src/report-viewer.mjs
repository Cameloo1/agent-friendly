const CHECK_LINE = /^-\s+(PASS|FAIL|OK|WARNING|WARN|ERROR|UNABLE TO CHECK|NOT APPLICABLE|SKIPPED)\s+([A-Za-z0-9][A-Za-z0-9_-]*)(?::|\s+--)\s*(.*)$/i;
const DETAIL_MARKER = /^\*\*(Fix|Skill|Spec):\*\*/i;
const APPLICABLE_STATUSES = new Set(["pass", "fail", "warning", "error", "unable"]);

function textBlocks(result) {
  return (result?.content || [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n");
}

function statusFrom(token, summary) {
  switch (token.toUpperCase()) {
    case "PASS": return "pass";
    case "FAIL": return "fail";
    case "WARNING":
    case "WARN": return "warning";
    case "ERROR": return "error";
    case "UNABLE TO CHECK": return "unable";
    case "NOT APPLICABLE":
    case "SKIPPED": return "excluded";
    case "OK":
      return /excluded|not applicable|not a .+ site/i.test(summary) ? "excluded" : "info";
    default: return "info";
  }
}

function displayCategory(value) {
  const known = new Map([
    ["content accessibility", "Content accessibility"],
    ["bot access control", "Bot access control"],
    ["api, auth, mcp & a2a discovery", "API, auth, MCP & A2A discovery"],
  ]);
  return known.get(value.toLowerCase()) || value;
}

function parseHeading(line) {
  if (!line.startsWith("## ")) return null;
  const heading = line.slice(3).trim();
  const counted = heading.match(/^(.*?)\s+\((\d+)\/(\d+)\s+passing\)$/i);
  return {
    name: displayCategory((counted?.[1] || heading).trim()),
    declaredPassing: counted ? Number(counted[2]) : null,
    declaredApplicable: counted ? Number(counted[3]) : null,
  };
}

function scoreMetrics(categories, partial) {
  const checks = categories.flatMap((category) => category.checks);
  const passing = checks.filter((check) => check.status === "pass").length;
  const applicable = checks.filter((check) => APPLICABLE_STATUSES.has(check.status)).length;
  const excluded = checks.filter((check) => check.status === "excluded").length;
  const declared = categories.filter((category) => category.declaredApplicable !== null);
  const countsMatch = declared.every((category) => {
    const categoryPassing = category.checks.filter((check) => check.status === "pass").length;
    const categoryApplicable = category.checks.filter((check) => APPLICABLE_STATUSES.has(check.status)).length;
    return category.declaredPassing === categoryPassing
      && category.declaredApplicable === categoryApplicable;
  });
  const score = !partial && applicable > 0 && countsMatch
    ? Math.round((passing / applicable) * 100)
    : null;
  return { passing, applicable, excluded, score, countsMatch };
}

export function buildReportView(record) {
  const text = textBlocks(record.result).replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const targetLine = lines.find((line) => line.startsWith("# Agent Readiness:"));
  const redirectLine = lines.find((line) => /^>\s*Redirected from\s+/i.test(line));
  const maturityLine = lines.find((line) => /^\*\*Level\s+[0-5]\/5\s+--/i.test(line));
  const maturity = maturityLine?.match(/^\*\*Level\s+([0-5])\/5\s+--\s+(.+?)\*\*$/i);
  const normalizedUrl = targetLine?.slice("# Agent Readiness:".length).trim() || record.request.url;
  const redirectedFrom = redirectLine?.replace(/^>\s*Redirected from\s+/i, "").trim() || null;
  const categories = [];
  let category;
  let check;
  let collectEvidence = false;

  for (const line of lines) {
    const heading = parseHeading(line);
    if (heading) {
      category = { ...heading, checks: [] };
      categories.push(category);
      check = null;
      collectEvidence = false;
      continue;
    }

    const matched = line.match(CHECK_LINE);
    if (matched && category) {
      const [, token, id, summary] = matched;
      check = {
        id,
        status: statusFrom(token, summary),
        summary: summary.trim(),
        evidence: [],
      };
      category.checks.push(check);
      collectEvidence = ["fail", "warning", "error", "unable"].includes(check.status);
      continue;
    }

    if (!check || !collectEvidence) continue;
    const detail = line.trim();
    if (!detail) continue;
    if (DETAIL_MARKER.test(detail)) {
      collectEvidence = false;
      continue;
    }
    check.evidence.push(detail);
  }

  for (const current of categories) {
    for (const currentCheck of current.checks) {
      currentCheck.evidence = currentCheck.evidence.join(" ") || currentCheck.summary;
    }
  }

  const partial = record.result?._meta?.partial === true
    || /\bpartial scan\b|\bscore omitted\b/i.test(text);
  const metrics = scoreMetrics(categories, partial);
  return {
    id: record.id,
    savedAt: record.savedAt,
    profile: record.request.profile || null,
    enabledChecks: record.request.enabledChecks || null,
    requestedUrl: redirectedFrom || record.request.url,
    normalizedUrl,
    maturity: maturity ? { level: Number(maturity[1]), name: maturity[2] } : null,
    partial,
    categories,
    metrics,
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function statusLabel(status) {
  return {
    pass: "PASS",
    fail: "FAIL",
    warning: "WARNING",
    error: "ERROR",
    unable: "UNABLE",
    excluded: "EXCLUDED",
    info: "INFO",
  }[status] || status.toUpperCase();
}

function renderCheck(check) {
  const evidence = ["fail", "warning", "error", "unable"].includes(check.status)
    ? `<p class="evidence"><strong>Evidence:</strong> ${escapeHtml(check.evidence)}</p>`
    : "";
  return `<li class="check">
          <div class="check-line">
            <code>${escapeHtml(check.id)}</code>
            <span class="status status-${escapeHtml(check.status)}">${statusLabel(check.status)}</span>
          </div>
          ${evidence}
        </li>`;
}

function renderCategory(category) {
  return `<section>
      <h2>${escapeHtml(category.name)}</h2>
      <ul>${category.checks.map(renderCheck).join("\n")}</ul>
    </section>`;
}

export function renderReportHtml(view) {
  let hostname = "public website";
  try { hostname = new URL(view.normalizedUrl).hostname; } catch {}
  const score = view.metrics.score === null
    ? `<div class="score score-unavailable">Score unavailable</div>`
    : `<div class="score">${view.metrics.score}<span>/100</span></div>`;
  const scoreDetail = view.metrics.applicable > 0
    ? `${view.metrics.passing} of ${view.metrics.applicable} applicable checks passing`
    : "No applicable checks returned";
  const scope = view.profile || (view.enabledChecks ? "focused checks" : "scan");
  const route = view.requestedUrl !== view.normalizedUrl
    ? `<div class="route"><span>${escapeHtml(view.requestedUrl)}</span><span aria-hidden="true">→</span><span>${escapeHtml(view.normalizedUrl)}</span></div>`
    : `<div class="route"><span>${escapeHtml(view.normalizedUrl)}</span></div>`;
  const scoreNote = view.partial
    ? "The scanner returned a partial result, so no 100-point score was calculated."
    : "The 100-point score is the applicable-check pass rate. Excluded checks do not count.";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>Agent readiness — ${escapeHtml(hostname)}</title>
  <style>
    :root {
      color-scheme: dark;
      --page: #181818;
      --surface: #242424;
      --row: #383838;
      --line: #3a3a3a;
      --text: #ececec;
      --muted: #a4a4a4;
      --pass: #a8c9ae;
      --fail: #ff8a4c;
      --warn: #e4c27a;
      --excluded: #929292;
    }
    * { box-sizing: border-box; }
    html { background: var(--page); }
    body {
      margin: 0;
      background: var(--page);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }
    main {
      width: min(100%, 680px);
      min-height: 100vh;
      margin: 0 auto;
      padding: 22px 18px 30px;
      background: var(--surface);
    }
    header { padding-bottom: 4px; }
    .score-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .score {
      font-size: 30px;
      font-weight: 650;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .score span {
      color: var(--muted);
      font-size: 16px;
      font-weight: 500;
      letter-spacing: 0;
    }
    .score-unavailable {
      font-size: 22px;
      letter-spacing: -0.02em;
    }
    .scope {
      color: var(--muted);
      font-size: 11px;
      font-weight: 650;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .score-detail { margin: 7px 0 0; }
    .route {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 7px;
      margin-top: 5px;
      color: var(--muted);
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    section { margin-top: 26px; }
    h2 {
      margin: 0;
      padding-bottom: 7px;
      border-bottom: 1px solid var(--line);
      font-size: 18px;
      font-weight: 620;
      letter-spacing: -0.015em;
    }
    ul { margin: 0; padding: 0; list-style: none; }
    .check {
      padding: 9px 0 10px;
      border-bottom: 1px solid var(--line);
    }
    .check:last-child { border-bottom: 0; }
    .check-line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
    }
    code {
      display: block;
      min-width: 0;
      padding: 4px 8px;
      border-radius: 6px;
      background: var(--row);
      color: var(--text);
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 12px;
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .status {
      font-size: 12px;
      font-weight: 650;
      letter-spacing: 0.015em;
      white-space: nowrap;
    }
    .status-pass { color: var(--pass); }
    .status-fail, .status-error { color: var(--fail); }
    .status-warning, .status-unable { color: var(--warn); }
    .status-excluded, .status-info { color: var(--excluded); }
    .evidence {
      margin: 6px 0 0;
      color: var(--text);
      font-size: 12.5px;
      line-height: 1.4;
    }
    .evidence strong { font-weight: 650; }
    footer {
      margin-top: 28px;
      padding-top: 12px;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 11px;
    }
    footer p { margin: 0 0 3px; }
    @media (max-width: 420px) {
      main { padding: 16px 10px 24px; }
      .score { font-size: 27px; }
      h2 { font-size: 17px; }
    }
    @media print {
      html, body, main { background: var(--surface); }
      main { width: 100%; min-height: auto; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div class="score-row">
        <div>${score}<p class="score-detail">${escapeHtml(scoreDetail)}</p></div>
        <div class="scope">${escapeHtml(scope)}</div>
      </div>
      ${route}
    </header>
    ${view.categories.map(renderCategory).join("\n")}
    <footer>
      <p>${escapeHtml(scoreNote)}</p>
      <p>Saved ${escapeHtml(view.savedAt)} · Scan ${escapeHtml(view.id)}</p>
    </footer>
  </main>
</body>
</html>
`;
}
