// Off-chain document shapes (plan/010 §16). On-chain stays primary for money state; these hold only
// pre-mint drafts, the IntentBuilder transcript, AGENTS.md text, StartConfig, and the history index.
import type { Address, Hex } from "viem";

export interface AgentPackageDraft {
  role: "EXECUTOR" | "WATCHER";
  summary: string; // SUMMARY.md
  agents: string; // AGENTS.md (objective / tools / never-rules / default)
  soul: string; // SOUL.md (risk posture / recovery preference)
  constraints: {
    tokenA: Address;
    tokenB: Address;
    poolFee: number;
    amountCapPerTx: string;
    cumulativeCap: string;
    slippageCapBps: number;
    expiry: string;
  };
  semantic: string[]; // Semantic Guardrails the Watcher judges
  fixed: boolean;
  packageHash?: Hex;
}

export interface StartConfig {
  loopPeriodSec: number;
  ttlMinutes: number;
  watcherEnabled: boolean;
}

/** Bounded runtime schedule, set when the AgentLoop is started (plan/010 §18). */
export interface RuntimeState {
  startedAt: number;
  autoStopAt: number;
  loopPeriodSec: number;
  plannedTicks: number;
}

export type RuntimeStatus =
  | "scheduled"
  | "running"
  | "stopping"
  | "stopped"
  | "expired"
  | "failed"
  | "self-stopped"
  | "unbound";

export interface RuntimeRecord {
  runtimeId: string;
  ownerUid: string;
  intentId: string;
  executorTokenId: string;
  watcherTokenId: string | null;
  delegate: Address;
  role: "EXECUTOR";
  packageHash: Hex;
  runtimeOwner: Address;
  bindingNonce: string;
  cloudRunService: string;
  status: RuntimeStatus;
  startedAt: number;
  lastHeartbeatAt: number | null;
  autoStopAt: number;
  loopPeriodSec: number;
  plannedTicks: number;
  executedTicks: number;
  failureReason: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface IntentDoc {
  intentId: string;
  title: string;
  status: "draft" | "live" | "stopped";
  createdAt: number;
  executorTokenId: string | null;
  watcherTokenId: string | null;
  packages: { executor: AgentPackageDraft; watcher: AgentPackageDraft };
  startConfig: StartConfig;
  runtime?: RuntimeState | null;
  runtimeId?: string | null;
}

export interface TranscriptTurn {
  role: "owner" | "agent";
  text: string;
  at: number;
}
