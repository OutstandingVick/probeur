import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(path = ".env") {
  const fullPath = resolve(process.cwd(), path);
  if (!existsSync(fullPath)) return;

  const content = readFileSync(fullPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function intEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`${name} must be an integer`);
  return value;
}

loadDotEnv();

export const config = {
  mode: process.env.AGENT_MODE ?? "dry-run",
  agent: {
    name: process.env.AGENT_NAME ?? "Probeur",
    description:
      process.env.AGENT_DESCRIPTION ??
      "Probeur autonomously discovers SAP tools, validates them with Sentinel, consumes Ace Data Cloud services, and records x402/escrow payment proofs.",
    keypairPath: process.env.SAP_AGENT_KEYPAIR_PATH ?? "keys/agent.json"
  },
  sap: {
    cluster: process.env.SAP_CLUSTER ?? "mainnet-beta",
    rpcUrl: process.env.SAP_RPC_URL ?? "",
    sentinelWallet:
      process.env.SYNAPSE_SENTINEL_WALLET ??
      "Ccr2yK3hLALU4p8oNRqrh4dGuvPJTth5KCLMio8cE1ph",
    escrowPricePerCallLamports: intEnv("SAP_ESCROW_PRICE_PER_CALL_LAMPORTS", 1_000_000),
    escrowInitialDepositLamports: intEnv("SAP_ESCROW_INITIAL_DEPOSIT_LAMPORTS", 10_000_000),
    escrowMaxCalls: intEnv("SAP_ESCROW_MAX_CALLS", 10)
  },
  ace: {
    network: process.env.ACE_X402_NETWORK ?? "solana",
    openaiModel: process.env.ACE_OPENAI_MODEL ?? "gpt-4o-mini",
    solanaPayerPrivateKey: process.env.X402B_SOLANA_PAYER_PRIVATE_KEY ?? "",
    services: {
      summary: process.env.ACE_SERVICE_SUMMARY ?? "ai-chat",
      research: process.env.ACE_SERVICE_RESEARCH ?? "google-search",
      ranking: process.env.ACE_SERVICE_RANKING ?? "github"
    }
  },
  run: {
    intervalSeconds: intEnv("RUN_INTERVAL_SECONDS", 3600),
    maxToolsPerRun: intEnv("MAX_TOOLS_PER_RUN", 5)
  }
};

export function requireLiveConfig() {
  const missing = [];
  if (!config.sap.rpcUrl) missing.push("SAP_RPC_URL");
  if (!config.agent.keypairPath) missing.push("SAP_AGENT_KEYPAIR_PATH");
  if (!config.ace.solanaPayerPrivateKey) missing.push("X402B_SOLANA_PAYER_PRIVATE_KEY");
  if (missing.length) {
    throw new Error(`Live mode is missing required env vars: ${missing.join(", ")}`);
  }
}
