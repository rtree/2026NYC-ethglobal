// Browser mirror of the server's off-chain document shapes (plan/010 §16). Kept minimal for the UI.
import type { Address, Hex } from "viem";

export interface AgentPackageDraft {
  role: "EXECUTOR" | "WATCHER";
  summary: string;
  agents: string;
  soul: string;
  constraints: {
    tokenA: Address;
    tokenB: Address;
    poolFee: number;
    amountCapPerTx: string;
    cumulativeCap: string;
    slippageCapBps: number;
    expiry: string;
  };
  semantic: string[];
  fixed: boolean;
  packageHash?: Hex;
}

export interface StartConfig {
  loopPeriodSec: number;
  ttlMinutes: number;
  watcherEnabled: boolean;
}

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
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  startedAt: number;
  lastHeartbeatAt: number | null;
  autoStopAt: number;
  loopPeriodSec: number;
  plannedTicks: number;
  executedTicks: number;
  runtimeTradesUsed: number;
  maxRuntimeTrades: number;
  watcherActionsUsed: number;
  maxWatcherActions: number;
  llmCallsUsed: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedVertexCostUsd: number;
  maxVertexCostUsd: number;
  failureReason: string | null;
  lastTickAction: string | null;
  lastTickTxHash: Hex | null;
  lastWatcherAction: string | null;
  lastWatcherReason: string | null;
  lastWatcherTxHash: Hex | null;
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
  executorTxHash?: Hex | null;
  watcherTxHash?: Hex | null;
  packages: { executor: AgentPackageDraft; watcher: AgentPackageDraft };
  startConfig: StartConfig;
  runtime?: RuntimeState | null;
  runtimeId?: string | null;
}
