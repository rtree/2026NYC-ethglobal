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
}
