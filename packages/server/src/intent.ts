// IntentBuilder orchestration: conversation -> dual AgentPackage drafts -> FIX (freeze + packageHash),
// persisted per-wallet in the store (plan/010 §16/§18). On-chain mint reads the FIXed drafts later.
import { keccak256, toHex, type Hex } from "viem";
import { store } from "./store.js";
import { chat as llmChat, defaultPackages, type Turn } from "./vertex.js";
import type { AgentPackageDraft, IntentDoc, StartConfig } from "./intentTypes.js";

const DEFAULT_START: StartConfig = { loopPeriodSec: 10, ttlMinutes: 20, watcherEnabled: true };

function newIntentId(): string {
  return `intent-${Math.random().toString(36).slice(2, 8)}`;
}

function packageHash(d: AgentPackageDraft): Hex {
  const canonical = JSON.stringify({
    role: d.role,
    summary: d.summary,
    agents: d.agents,
    soul: d.soul,
    constraints: d.constraints,
    semantic: d.semantic,
  });
  return keccak256(toHex(canonical));
}

async function ensureDoc(uid: string, intentId?: string): Promise<IntentDoc> {
  if (intentId) {
    const existing = await store().getIntent(uid, intentId);
    if (existing) return existing;
  }
  const id = intentId ?? newIntentId();
  const doc: IntentDoc = {
    intentId: id,
    title: "DCA USDC -> WETH",
    status: "draft",
    createdAt: Date.now(),
    executorTokenId: null,
    watcherTokenId: null,
    packages: defaultPackages(),
    startConfig: DEFAULT_START,
  };
  await store().putIntent(uid, doc);
  return doc;
}

export async function intentChat(uid: string, intentId: string | undefined, ownerText: string) {
  const doc = await ensureDoc(uid, intentId);
  const text = (ownerText ?? "").toString().slice(0, 500);
  if (text) await store().appendTurn(uid, doc.intentId, { role: "owner", text, at: Date.now() });

  const transcript = (await store().getTranscript(uid, doc.intentId)).map<Turn>((t) => ({ role: t.role, text: t.text }));
  const result = await llmChat(transcript.length ? transcript : [{ role: "owner", text: text || "I want to DCA USDC into WETH." }]);

  await store().appendTurn(uid, doc.intentId, { role: "agent", text: result.reply, at: Date.now() });
  // preserve any already-FIXed package (don't overwrite a frozen one)
  const next: IntentDoc = {
    ...doc,
    packages: {
      executor: doc.packages.executor.fixed ? doc.packages.executor : result.packages.executor,
      watcher: doc.packages.watcher.fixed ? doc.packages.watcher : result.packages.watcher,
    },
  };
  await store().putIntent(uid, next);
  return { intentId: doc.intentId, reply: result.reply, packages: next.packages, llm: result.llm };
}

export async function fixPackage(uid: string, intentId: string, role: "EXECUTOR" | "WATCHER") {
  const doc = await store().getIntent(uid, intentId);
  if (!doc) throw new Error("intent not found");
  const key = role === "EXECUTOR" ? "executor" : "watcher";
  const draft = { ...doc.packages[key], fixed: true };
  draft.packageHash = packageHash(draft);
  await store().putPackageSnapshot({ ...draft, packageHash: draft.packageHash, intentId, createdAt: Date.now() });
  const next: IntentDoc = { ...doc, packages: { ...doc.packages, [key]: draft } };
  await store().putIntent(uid, next);
  return { intentId, role, packageHash: draft.packageHash, packages: next.packages };
}

export async function updatePackageSemantic(uid: string, intentId: string, role: "EXECUTOR" | "WATCHER", semantic: unknown) {
  const doc = await store().getIntent(uid, intentId);
  if (!doc) throw new Error("intent not found");
  const key = role === "EXECUTOR" ? "executor" : "watcher";
  const current = doc.packages[key];
  if (current.fixed) throw new Error("package is already FIXed");
  const items = Array.isArray(semantic)
    ? semantic.map((v) => String(v).trim()).filter(Boolean).slice(0, 8)
    : [];
  if (items.length === 0) throw new Error("semantic guardrails required");
  const next = { ...doc, packages: { ...doc.packages, [key]: { ...current, semantic: items } } };
  await store().putIntent(uid, next);
  return { intentId, role, packages: next.packages };
}

export async function setStartConfig(uid: string, intentId: string, cfg: Partial<StartConfig>) {
  const doc = await store().getIntent(uid, intentId);
  if (!doc) throw new Error("intent not found");
  const startConfig: StartConfig = {
    loopPeriodSec: clampInt(cfg.loopPeriodSec, 5, 60, doc.startConfig.loopPeriodSec),
    ttlMinutes: clampInt(cfg.ttlMinutes, 1, 30, doc.startConfig.ttlMinutes),
    watcherEnabled: cfg.watcherEnabled ?? doc.startConfig.watcherEnabled,
  };
  await store().putIntent(uid, { ...doc, startConfig });
  return { intentId, startConfig };
}

export async function listIntents(uid: string) {
  return store().listIntents(uid);
}
export async function getIntentFull(uid: string, intentId: string) {
  const doc = await store().getIntent(uid, intentId);
  if (!doc) return null;
  const transcript = await store().getTranscript(uid, intentId);
  return { ...doc, transcript };
}

function clampInt(v: unknown, min: number, max: number, def: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.round(n)));
}
