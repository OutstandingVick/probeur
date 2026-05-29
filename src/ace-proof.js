import { config } from "./config.js";
import { AceAdapter } from "./adapters/ace.js";

const service = process.argv[2];
if (!service) {
  console.error("Usage: node src/ace-proof.js <ai-chat|google-search|github>");
  process.exit(1);
}

const candidate = {
  wallet: "5ug4Rfvt5C67b92sbn5g9iYBYt1bdpDBo3o2NHbE4eMo",
  name: "Probeur",
  protocols: ["sap", "x402", "acedata"],
  reputation: 0,
  tool: { name: "sap-autonomous-tool-audit", category: "agent-audit", priceLamports: 0 },
  tools: [{ name: "sap-autonomous-tool-audit", category: "agent-audit", priceLamports: 0 }]
};

const prompts = {
  "ai-chat": "Summarize Probeur, a SAP-registered Solana agent that audits SAP tools and records x402 proof.",
  "google-search": "Probeur Synapse Agent Protocol OOBE Ace Data Cloud x402 Solana",
  github: "Evaluate the GitHub repository for Probeur as a bounty submission: autonomous SAP registration, Ace Data Cloud usage, and x402 proof logging."
};

const contexts = {
  "ai-chat": { task: "manifest-summary", candidate },
  "google-search": { task: "candidate-research", candidate, sentinel: { score: 90, verdict: "registered" } },
  github: { task: "candidate-ranking", candidates: [candidate] }
};

const ace = new AceAdapter({ mode: config.mode });
await ace.init();
const result = await ace.callAceService(service, prompts[service] ?? prompts["ai-chat"], contexts[service] ?? contexts["ai-chat"]);
console.log(JSON.stringify({ service: result.serviceName, requestId: result.requestId, x402Tx: result.x402Tx, output: String(result.output).slice(0, 500) }, null, 2));
