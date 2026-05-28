import { readFileSync } from "node:fs";
import { config, requireLiveConfig } from "../config.js";
import { appendJsonl, optionalImport, stableId } from "../util.js";

export class AceAdapter {
  constructor({ mode = config.mode } = {}) {
    this.mode = mode;
    this.client = null;
  }

  async init() {
    if (this.mode !== "live") return;
    requireLiveConfig();

    const sdk = await optionalImport(["@acedatacloud/sdk"]);
    const x402 = await optionalImport(["@acedatacloud/x402-client"]);
    if (!sdk || !x402) {
      throw new Error("Install Ace dependencies with npm install before live mode.");
    }

    const AceDataCloud = sdk.AceDataCloud ?? sdk.default?.AceDataCloud ?? sdk.default;
    const createX402PaymentHandler =
      x402.createX402PaymentHandler ?? x402.default?.createX402PaymentHandler;

    if (!AceDataCloud || !createX402PaymentHandler) {
      throw new Error("AceDataCloud SDK exports were not found.");
    }

    const paymentOptions = { network: config.ace.network };
    if (config.ace.network === "solana") {
      paymentOptions.solanaWallet = await createSolanaWalletAdapter(config.agent.keypairPath);
    }

    this.client = new AceDataCloud({
      paymentHandler: createX402PaymentHandler(paymentOptions)
    });
  }

  async summarizeManifest(candidate) {
    const prompt = `Summarize this SAP agent/tool profile for a buyer: ${JSON.stringify(candidate)}`;
    return this.callAceService(config.ace.services.summary, prompt, {
      task: "manifest-summary",
      candidate
    });
  }

  async researchCandidate(candidate, sentinel) {
    const prompt = `Research and classify the operational risk of this SAP tool. Candidate: ${JSON.stringify(
      candidate
    )}. Sentinel: ${JSON.stringify(sentinel)}. Return concise JSON fields risk, reason, use_case.`;
    return this.callAceService(config.ace.services.research, prompt, {
      task: "candidate-research",
      candidate,
      sentinel
    });
  }

  async rankCandidates(candidates) {
    const prompt = `Rank these SAP tools for real autonomous-agent usefulness: ${JSON.stringify(
      candidates
    )}. Return a concise recommendation.`;
    return this.callAceService(config.ace.services.ranking, prompt, {
      task: "candidate-ranking",
      candidates
    });
  }

  async callAceService(serviceName, prompt, context) {
    const normalizedServiceName = normalizeServiceName(serviceName);
    if (this.mode !== "live") {
      return fakeAceResult(normalizedServiceName, prompt, context);
    }

    const response = await this.invokeConfiguredService(normalizedServiceName, prompt, context);

    const result = {
      mode: "live",
      serviceName: normalizedServiceName,
      requestId: response?.id ?? null,
      x402Tx:
        response?.headers?.x402_tx ??
        response?.headers?.["x402-tx"] ??
        response?.x402_tx ??
        null,
      output:
        response?.answer ??
        response?.choices?.[0]?.message?.content ??
        response?.data?.choices?.[0]?.message?.content ??
        response?.results?.[0]?.title ??
        JSON.stringify(response)
    };
    appendJsonl("data/ace-proof.jsonl", result);
    return result;
  }

  async invokeConfiguredService(serviceName, prompt, context) {
    if (serviceName === "ai-chat") {
      return this.client.aichat.create({
        model: config.ace.openaiModel,
        question: prompt,
        stateful: false
      });
    }

    if (serviceName === "google-search") {
      return this.client.search.google(bodyForService(serviceName, prompt, context));
    }

    if (serviceName === "github") {
      return this.client.openai.chat.completions.create({
        model: config.ace.openaiModel,
        messages: [
          {
            role: "system",
            content:
              "You are Probeur's GitHub analysis skill. Evaluate repositories and code signals concisely."
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 300
      });
    }

    if (serviceName === "openai.chat.completions") {
      return this.client.openai.chat.completions.create({
        model: config.ace.openaiModel,
        messages: [
          {
            role: "system",
            content:
              "You are Probeur, an autonomous SAP tool auditor. Be concise, structured, and avoid hype."
          },
          { role: "user", content: prompt }
        ],
        max_tokens: 300
      });
    }

    const target = serviceName.split(".").reduce((node, key) => node?.[key], this.client);
    if (!target) {
      throw new Error(`Ace service path ${serviceName} was not found on the SDK client.`);
    }

    if (typeof target.create === "function") {
      return target.create(bodyForService(serviceName, prompt, context));
    }

    if (typeof target === "function") {
      return target(bodyForService(serviceName, prompt, context));
    }

    throw new Error(`Ace service path ${serviceName} is not callable.`);
  }
}

function fakeAceResult(serviceName, prompt, context) {
  const id = stableId({ serviceName, prompt, context });
  const candidate = context.candidate ?? context.candidates?.[0];
  let output;

  if (context.task === "manifest-summary") {
    output = `${candidate.name} exposes ${candidate.tools.length} tool(s) across ${candidate.protocols.join(
      ", "
    )}. Best buyer use: ${candidate.tools[0]?.category ?? "general automation"}.`;
  } else if (context.task === "candidate-research") {
    const risk = context.sentinel.score >= 85 ? "low" : "medium";
    output = JSON.stringify({
      risk,
      reason: "Sentinel score and reputation are adequate for a bounded paid trial.",
      use_case: candidate.tools[0]?.category ?? "agent tooling"
    });
  } else {
    output = `Top candidate: ${candidate.name}. It has the strongest blend of reputation, Sentinel score, and useful paid SAP tooling.`;
  }

  return {
    mode: "dry-run",
    serviceName,
    requestId: `dry-ace-${id}`,
    x402Tx: `dry-x402-${id}`,
    output
  };
}

function bodyForService(serviceName, prompt, context) {
  if (serviceName.includes("google-search") || serviceName.includes("exa-search")) {
    return {
      q: `${context.candidate?.name ?? "SAP agent"} ${context.candidate?.tool?.name ?? ""}`,
      query: `${context.candidate?.name ?? "SAP agent"} ${context.candidate?.tool?.name ?? ""}`
    };
  }

  if (serviceName.includes("github")) {
    return {
      query: "OOBE-PROTOCOL synapse SAP SDK agent escrow x402",
      prompt
    };
  }

  if (serviceName.includes("midjourney") || serviceName.includes("flux")) {
    return {
      prompt: `Clean technical dashboard thumbnail for ${context.candidates?.[0]?.name ?? "SAP agent audit"}`
    };
  }

  return { prompt };
}

function normalizeServiceName(serviceName) {
  return String(serviceName).trim().replace(/^\/+/, "");
}

async function createSolanaWalletAdapter(keypairPath) {
  const web3 = await optionalImport(["@solana/web3.js"]);
  if (!web3) throw new Error("@solana/web3.js is required for Solana x402 payments.");

  const keypairBytes = JSON.parse(readFileSync(keypairPath, "utf8"));
  const keypair = web3.Keypair.fromSecretKey(Uint8Array.from(keypairBytes));

  return {
    publicKey: keypair.publicKey,
    async signAndSendTransaction(tx) {
      tx.sign(keypair);
      const connection = new web3.Connection(config.sap.sendRpcUrl || config.sap.rpcUrl, "confirmed");
      const signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
      await connection.confirmTransaction(signature, "confirmed");
      return signature;
    }
  };
}
