import { config } from "./config.js";
import { SapAdapter } from "./adapters/sap.js";
import { AceAdapter } from "./adapters/ace.js";
import { selectCandidates } from "./scoring.js";
import { appendJsonl, nowIso, stableId } from "./util.js";
import { writeReports } from "./report.js";

async function runOnce({ mode = config.mode } = {}) {
  const startedAt = nowIso();
  const sap = new SapAdapter({ mode });
  const ace = new AceAdapter({ mode });

  await sap.init();
  await ace.init();

  const registration = await sap.registerAgent();
  const discovery = await sap.discoverAgents();
  const selected = selectCandidates(discovery.agents, config.run.maxToolsPerRun);
  const evaluated = [];
  const payments = [];

  for (const candidate of selected) {
    const sentinel = await sap.callSentinel(candidate);
    const summary = await ace.summarizeManifest(candidate);
    const research = await ace.researchCandidate(candidate, sentinel);
    const escrow = await sap.openEscrow(candidate);

    payments.push({ type: "sentinel", tx: sentinel.tx, id: sentinel.sentinelWallet });
    payments.push({ type: "ace:x402:summary", tx: summary.x402Tx, id: summary.requestId });
    payments.push({ type: "ace:x402:research", tx: research.x402Tx, id: research.requestId });
    payments.push({ type: "sap:escrow", tx: escrow.tx, id: escrow.serviceHash });

    evaluated.push({
      ...candidate,
      sentinel,
      ace: { summary, research },
      escrow
    });
  }

  const ranking = await ace.rankCandidates(
    evaluated.map((candidate) => ({
      name: candidate.name,
      wallet: candidate.wallet,
      tool: candidate.tool,
      selectionScore: candidate.selectionScore,
      sentinel: candidate.sentinel,
      research: candidate.ace.research.output
    }))
  );

  payments.push({ type: "ace:x402:ranking", tx: ranking.x402Tx, id: ranking.requestId });

  const run = {
    id: stableId({ startedAt, registration, selected }),
    mode,
    startedAt,
    completedAt: nowIso(),
    registration,
    discovery: {
      source: discovery.source,
      totalAgentsSeen: discovery.agents.length,
      overview: discovery.overview ?? null
    },
    candidates: evaluated,
    ranking,
    payments
  };

  appendJsonl("data/runs.jsonl", run);
  writeReports(run);
  return run;
}

async function registerOnly({ mode = config.mode } = {}) {
  const sap = new SapAdapter({ mode });
  await sap.init();
  const registration = await sap.registerAgent();
  return { mode, registration };
}

async function main() {
  const command = process.argv[2] ?? "once";
  const mode = command === "demo" ? "dry-run" : config.mode;

  if (command === "register") {
    const result = await registerOnly({ mode });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === "start") {
    await runOnce({ mode });
    setInterval(() => {
      runOnce({ mode }).catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    }, config.run.intervalSeconds * 1000);
    return;
  }

  const run = await runOnce({ mode });
  console.log(JSON.stringify({ runId: run.id, mode: run.mode, report: "reports/latest.html" }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
