// Client for the control-panel write-path API (same origin in prod; Vite proxy in dev).
import { bearer } from "./auth";
import type { AgentPackageDraft, IntentDoc, StartConfig } from "./intentTypes";

export interface ApiResult {
  ok?: boolean;
  txHash?: string;
  tokenId?: string;
  reason?: string;
  error?: string;
  newAmountCap?: string;
}

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const t = await bearer();
  return t ? { ...extra, authorization: `Bearer ${t}` } : extra;
}

async function post(path: string): Promise<ApiResult> {
  const res = await fetch(path, { method: "POST", headers: await authHeaders() });
  const body = (await res.json()) as ApiResult;
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: await authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: await authHeaders() });
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}

export interface ChatResponse {
  intentId: string;
  reply: string;
  packages: { executor: AgentPackageDraft; watcher: AgentPackageDraft };
  llm: "vertex" | "mock";
}

export const api = {
  createExecutor: () => post("/api/executor/create"),
  createWatcher: () => post("/api/watcher/create"),
  trade: () => post("/api/trade"),
  watcherFreeze: () => post("/api/watcher/freeze"),
  watcherTighten: () => post("/api/watcher/tighten"),
  ownerResume: () => post("/api/owner/resume"),
  reset: () => post("/api/reset"),

  // IntentBuilder + per-wallet store (plan/010 §16/§18)
  intentChat: (text: string, intentId?: string) =>
    postJson<ChatResponse>("/api/intent/chat", { text, intentId }),
  fixPackage: (intentId: string, role: "EXECUTOR" | "WATCHER") =>
    postJson<{ intentId: string; role: string; packageHash: string; packages: { executor: AgentPackageDraft; watcher: AgentPackageDraft } }>(
      "/api/intent/fix",
      { intentId, role },
    ),
  setStartConfig: (intentId: string, cfg: Partial<StartConfig>) =>
    postJson<{ intentId: string; startConfig: StartConfig }>("/api/intent/start-config", { intentId, ...cfg }),
  listIntents: () => getJson<{ intents: IntentDoc[] }>("/api/intents"),
  getIntent: (intentId: string) => getJson<IntentDoc & { transcript: { role: string; text: string; at: number }[] }>(`/api/intents/${intentId}`),
};
