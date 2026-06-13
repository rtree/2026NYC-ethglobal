// IntentBuilder LLM. Vertex AI Gemini via ADC (backend-only — never the API-key Gemini Developer API,
// plan/010 §18). Falls back to a scripted compile when INTENTOS_LLM!=vertex or Vertex is unreachable,
// so the demo never hard-fails. The server validates/normalizes whatever the model returns.
import { accessToken, PROJECT_ID } from "./gcp.js";
import type { AgentPackageDraft } from "./intentTypes.js";

const LOCATION = process.env.INTENTOS_VERTEX_LOCATION ?? "us-central1";
const MODEL = process.env.INTENTOS_VERTEX_MODEL ?? "gemini-2.5-flash";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";

export interface Turn {
  role: "owner" | "agent";
  text: string;
}
export interface ChatResult {
  reply: string;
  packages: { executor: AgentPackageDraft; watcher: AgentPackageDraft };
  llm: "vertex" | "mock";
}

// Demo-safe defaults: USDC->WETH, tiny caps. The normalizer always clamps to these rails.
export function defaultPackages(): { executor: AgentPackageDraft; watcher: AgentPackageDraft } {
  const expiry = String(Math.floor(Date.now() / 1000) + 86_400);
  const executor: AgentPackageDraft = {
    role: "EXECUTOR",
    summary: "Recurring small BUYs of WETH with USDC (DCA), inside hard caps.",
    agents:
      "# Executor Agent\nObjective: accumulate WETH from USDC in small, recurring guarded buys.\n" +
      "Tools: intentos.quote, intentos.submitExecutionRequest (USDC->WETH only).\n" +
      "Never: exceed the per-tx or cumulative cap; trade any pair other than USDC/WETH; widen any guard.\n" +
      "Default: if a quote looks stale or the route is unnatural, HOLD this tick.",
    soul: "Risk posture: conservative. Priority: capital preservation over speed. Recovery: fall back to USDC on failure.",
    constraints: {
      tokenA: USDC,
      tokenB: WETH,
      poolFee: 500,
      amountCapPerTx: "2000",
      cumulativeCap: "100000",
      slippageCapBps: 300,
      expiry,
    },
    semantic: ["route naturalness", "quote freshness", "recovery preference -> USDC on fail"],
    fixed: false,
  };
  const watcher: AgentPackageDraft = {
    role: "WATCHER",
    summary: "Read execution evidence and tighten/freeze on semantic violations (quorum 1).",
    agents:
      "# Watcher Agent\nObjective: monitor the Executor's evidence and protect the Owner.\n" +
      "Tools: intentos.readEvidence, intentos.voteTighten, intentos.voteFreeze (monotonic — tighten only).\n" +
      "Never: loosen a guard; move funds; act outside the watched intent.\n" +
      "Default: if evidence shows unnatural routes or stale quotes, VOTE_TIGHTEN; on clear abuse, VOTE_FREEZE.",
    soul: "Risk posture: protective. Priority: stop bad execution early. Recovery: prefer freeze over allowing loss.",
    constraints: {
      tokenA: USDC,
      tokenB: WETH,
      poolFee: 500,
      amountCapPerTx: "2000",
      cumulativeCap: "100000",
      slippageCapBps: 300,
      expiry,
    },
    semantic: ["route naturalness", "quote freshness", "simulation adequacy"],
    fixed: false,
  };
  return { executor, watcher };
}

// Force everything back onto the demo rails regardless of what the model emitted.
export function normalize(p: { executor: AgentPackageDraft; watcher: AgentPackageDraft }): {
  executor: AgentPackageDraft;
  watcher: AgentPackageDraft;
} {
  const base = defaultPackages();
  const fix = (draft: AgentPackageDraft, fallback: AgentPackageDraft): AgentPackageDraft => ({
    role: fallback.role,
    summary: ascii(draft.summary, fallback.summary, 280),
    agents: ascii(draft.agents, fallback.agents, 1200),
    soul: ascii(draft.soul, fallback.soul, 600),
    constraints: {
      tokenA: USDC,
      tokenB: WETH,
      poolFee: 500,
      amountCapPerTx: clampNum(draft.constraints?.amountCapPerTx, 1n, 2000n, 2000n),
      cumulativeCap: clampNum(draft.constraints?.cumulativeCap, 1n, 100_000n, 100_000n),
      slippageCapBps: clampInt(draft.constraints?.slippageCapBps, 1, 300, 300),
      expiry: fallback.constraints.expiry,
    },
    semantic: Array.isArray(draft.semantic) && draft.semantic.length ? draft.semantic.slice(0, 6).map((s) => ascii(s, "", 80)) : fallback.semantic,
    fixed: false,
  });
  return { executor: fix(p.executor ?? base.executor, base.executor), watcher: fix(p.watcher ?? base.watcher, base.watcher) };
}

function ascii(v: unknown, fallback: string, max: number): string {
  if (typeof v !== "string" || !v.trim()) return fallback;
  // keep it readable; strip control chars, cap length
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, max);
}
function clampNum(v: unknown, min: bigint, max: bigint, def: bigint): string {
  try {
    const n = BigInt(String(v ?? def).replace(/[^0-9]/g, "") || def.toString());
    return (n < min ? min : n > max ? max : n).toString();
  } catch {
    return def.toString();
  }
}
function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}

const SYSTEM = `You are the IntentOS IntentBuilder. Through a short conversation you turn an Owner's natural intent into TWO Agent Packages: an Executor and a Watcher, for guarded USDC<->WETH trading on Base.
Rules:
- Trading pair is ALWAYS USDC/WETH. Tiny caps only (per-tx <= 2000 = 0.002 USDC, cumulative <= 100000 = 0.1 USDC).
- The Executor only BUYs WETH with USDC in small guarded steps. The Watcher can only tighten/freeze (never loosen).
- Reply briefly (<= 2 sentences) to the latest Owner message, then output the updated packages.
Respond with STRICT JSON only, no markdown, shaped:
{"reply":"...","executor":{"summary","agents","soul","constraints":{"amountCapPerTx","cumulativeCap","slippageCapBps"},"semantic":[...]},"watcher":{...same...}}`;

async function callVertex(transcript: Turn[]): Promise<ChatResult> {
  const token = await accessToken();
  const contents = transcript.map((t) => ({
    role: t.role === "owner" ? "user" : "model",
    parts: [{ text: t.text }],
  }));
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents,
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) throw new Error(`vertex ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = JSON.parse(text) as {
    reply?: string;
    executor?: Partial<AgentPackageDraft>;
    watcher?: Partial<AgentPackageDraft>;
  };
  const base = defaultPackages();
  const merged = {
    executor: { ...base.executor, ...parsed.executor, role: "EXECUTOR" as const },
    watcher: { ...base.watcher, ...parsed.watcher, role: "WATCHER" as const },
  };
  return { reply: parsed.reply ?? "Updated the Agent Packages.", packages: normalize(merged), llm: "vertex" };
}

// Scripted fallback: advance a canned reply and keep default packages (tweaked by keyword sniffing).
function mockChat(transcript: Turn[]): ChatResult {
  const lastOwner = [...transcript].reverse().find((t) => t.role === "owner")?.text ?? "";
  const pkgs = defaultPackages();
  // light keyword nudges so the preview visibly reacts
  if (/freeze|stop|halt/i.test(lastOwner)) pkgs.watcher.summary = "Aggressive protection: VOTE_FREEZE on the first clear violation.";
  if (/slow|small|careful|conservative/i.test(lastOwner)) pkgs.executor.constraints.amountCapPerTx = "1000";
  const reply = transcript.length <= 1
    ? "Got it — recurring small USDC->WETH buys with a per-tx and cumulative cap. Any size or total ceiling preferences?"
    : "Updated the Executor and Watcher packages on the right. FIX each when it looks right.";
  return { reply, packages: pkgs, llm: "mock" };
}

export async function chat(transcript: Turn[]): Promise<ChatResult> {
  const mode = (process.env.INTENTOS_LLM ?? "mock").toLowerCase();
  if (mode === "vertex") {
    try {
      return await callVertex(transcript);
    } catch (e) {
      // graceful fallback — demo never hard-fails
      const m = mockChat(transcript);
      m.reply = `${m.reply}`;
      return m;
    }
  }
  return mockChat(transcript);
}
