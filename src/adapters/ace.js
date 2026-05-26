import { config, requireLiveConfig } from "../config.js";
import { optionalImport, stableId } from "../util.js";

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

    this.client = new AceDataCloud({
      paymentHandler: createX402PaymentHandler({
        network: config.ace.network,
        solanaPrivateKey: config.ace.solanaPayerPrivateKey
      })
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
    if (this.mode !== "live") {
      return fakeAceResult(serviceName, prompt, context);
    }

    const response = await this.invokeConfiguredService(serviceName, prompt, context);

    return {
      mode: "live",
      serviceName,
      requestId: response?.id ?? null,
      x402Tx:
        response?.headers?.x402_tx ??
        response?.headers?.["x402-tx"] ??
        response?.x402_tx ??
        null,
      output:
        response?.choices?.[0]?.message?.content ??
        response?.data?.choices?.[0]?.message?.content ??
        JSON.stringify(response)
    };
  }

  async invokeConfiguredService(serviceName, prompt, context) {
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
  if (serviceName.includes("serpapi")) {
    return {
      q: `${context.candidate?.name ?? "SAP agent"} ${context.candidate?.tool?.name ?? ""}`,
      query: `${context.candidate?.name ?? "SAP agent"} ${context.candidate?.tool?.name ?? ""}`
    };
  }

  if (serviceName.includes("midjourney") || serviceName.includes("flux")) {
    return {
      prompt: `Clean technical dashboard thumbnail for ${context.candidates?.[0]?.name ?? "SAP agent audit"}`
    };
  }

  return { prompt };
}
