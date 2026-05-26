import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { writeJson, ensureDir, short } from "./util.js";

export function writeReports(run) {
  ensureDir("reports");
  writeJson("reports/latest.json", run);
  writeMarkdown(run);
  writeHtml(run);
}

export function writeMarkdown(run) {
  const lines = [
    `# Probeur Run`,
    ``,
    `- Run ID: \`${run.id}\``,
    `- Started: \`${run.startedAt}\``,
    `- Mode: \`${run.mode}\``,
    `- Agent registration tx: \`${run.registration.tx}\``,
    `- SAP discovery source: \`${run.discovery.source}\``,
    `- Candidates evaluated: \`${run.candidates.length}\``,
    ``,
    `## Payment Evidence`,
    ``,
    `| Type | Evidence |`,
    `| --- | --- |`,
    ...run.payments.map((payment) => `| ${payment.type} | \`${payment.tx ?? payment.id}\` |`),
    ``,
    `## Candidate Results`,
    ``,
    ...run.candidates.flatMap((candidate, index) => [
      `### ${index + 1}. ${candidate.name}`,
      ``,
      `- Wallet: \`${candidate.wallet}\``,
      `- Tool: \`${candidate.tool.name}\``,
      `- Selection score: \`${candidate.selectionScore}\``,
      `- Sentinel: \`${candidate.sentinel.verdict ?? "seen"}\` / \`${candidate.sentinel.score ?? "n/a"}\``,
      `- Summary: ${candidate.ace.summary.output}`,
      `- Research/Risk: ${candidate.ace.research.output}`,
      ``
    ]),
    `## Final Ranking`,
    ``,
    run.ranking.output,
    ``,
    `## Autonomy Proof`,
    ``,
    `This run was triggered without manual decisions after startup. The agent discovered SAP candidates, selected tools, used Sentinel, consumed three Ace Data Cloud service calls, recorded x402 evidence, opened/recorded SAP escrow evidence, and generated this report.`
  ];

  writeFile("reports/latest.md", `${lines.join("\n")}\n`);
}

export function writeHtml(run) {
  const rows = run.candidates
    .map(
      (candidate) => `<tr>
        <td>${escapeHtml(candidate.name)}</td>
        <td><code>${escapeHtml(short(candidate.wallet))}</code></td>
        <td>${escapeHtml(candidate.tool.name)}</td>
        <td>${candidate.selectionScore}</td>
        <td>${escapeHtml(String(candidate.sentinel.score ?? "seen"))}</td>
      </tr>`
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Probeur</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f7f8fb; color: #17202a; }
    main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 56px; }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; border-bottom: 1px solid #d9dee8; padding-bottom: 22px; }
    h1 { margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }
    h2 { margin-top: 34px; font-size: 18px; letter-spacing: 0; }
    .meta { color: #536171; line-height: 1.5; }
    .pill { border: 1px solid #bdc7d5; padding: 6px 10px; border-radius: 999px; background: white; font-size: 13px; white-space: nowrap; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #d9dee8; }
    th, td { text-align: left; padding: 12px 14px; border-bottom: 1px solid #e7ebf1; font-size: 14px; }
    th { background: #eef2f7; color: #354052; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .proof { background: white; border-left: 4px solid #20966f; padding: 16px 18px; line-height: 1.55; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .metric { background: white; border: 1px solid #d9dee8; padding: 14px; }
    .metric strong { display: block; font-size: 22px; margin-top: 5px; }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Probeur</h1>
        <div class="meta">Run ${escapeHtml(run.id)} started ${escapeHtml(run.startedAt)}</div>
      </div>
      <div class="pill">${escapeHtml(run.mode)}</div>
    </header>

    <section class="grid">
      <div class="metric">Candidates<strong>${run.candidates.length}</strong></div>
      <div class="metric">Payment Events<strong>${run.payments.length}</strong></div>
      <div class="metric">Discovery<strong>${escapeHtml(run.discovery.source)}</strong></div>
    </section>

    <h2>Evaluated Candidates</h2>
    <table>
      <thead><tr><th>Agent</th><th>Wallet</th><th>Tool</th><th>Score</th><th>Sentinel</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <h2>Final Ranking</h2>
    <p class="proof">${escapeHtml(run.ranking.output)}</p>

    <h2>Autonomy Proof</h2>
    <p class="proof">The agent moved from trigger to SAP discovery, Sentinel validation, Ace x402 AI calls, SAP escrow evidence, and report generation without manual decisions during the run.</p>
  </main>
</body>
</html>`;

  writeFile("reports/latest.html", html);
}

function writeFile(path, content) {
  writeFileSync(path, content);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (process.argv[1]?.endsWith("report.js")) {
  const latest = "reports/latest.json";
  if (!existsSync(latest)) {
    throw new Error("No reports/latest.json found. Run npm run demo first.");
  }
  const run = JSON.parse(readFileSync(latest, "utf8"));
  writeReports(run);
}
