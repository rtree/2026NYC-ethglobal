// TS mirror of the frozen data contract. Source of truth: plan/010-interfaces.md §9/§11/§13 and
// contracts/src/IntentOSTypes.sol. Field order MUST match the Solidity struct (the digest depends
// on abi.encode order).

import type { Address, Hex } from "viem";

export enum Action {
  BUY = 0,
  SELL = 1,
  RECOVER = 2,
}

export interface HardGuardState {
  router: Address;
  selector: Hex; // bytes4
  tokenA: Address;
  tokenB: Address;
  poolFee: number; // uint24
  amountCapPerTx: bigint;
  cumulativeCap: bigint;
  slippageCapBps: number; // uint16
  expiry: bigint; // uint64
  frozen: boolean;
  bindingNonce: bigint;
}

export interface ExecutionRequest {
  intentId: Hex;
  executorAgentTokenId: bigint;
  action: number; // uint8 Action
  tokenIn: Address;
  tokenOut: Address;
  recipient: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  quotedAmountOut: bigint;
  slippageBps: number; // uint16
  nonce: bigint;
  deadline: bigint; // uint64
  bindingNonce: bigint;
  quoteHash: Hex;
  simulationHash: Hex;
  evidenceRoot: Hex;
  reasonHash: Hex;
}

export interface GuardPatch {
  amountCapPerTx: bigint;
  cumulativeCap: bigint;
  slippageCapBps: number;
  expiry: bigint;
}

// Canonical terminal states (010 §13). Exact strings — shared by contract/event/UI.
export type TerminalState =
  | "running"
  | "tightened"
  | "frozen"
  | "self-stopped"
  | "owner-stopped"
  | "fund-exhausted"
  | "transferred";

// Predefined actions (010 §8).
export const EXECUTOR_ACTIONS = [
  "HOLD",
  "ASK_WATCHER",
  "GET_UNISWAP_QUOTE",
  "PROPOSE_SWAP",
  "REQUEST_SIMULATION",
  "SUBMIT_EXECUTION_REQUEST",
  "SELF_STOP",
] as const;
export type ExecutorAction = (typeof EXECUTOR_ACTIONS)[number];

export const WATCHER_ACTIONS = [
  "OBSERVE_EXECUTION",
  "READ_EVIDENCE",
  "ASK_EXECUTOR",
  "JUDGE_ON_INTENT",
  "REPORT_OK",
  "REPORT_SUSPICIOUS",
  "VOTE_TIGHTEN",
  "VOTE_FREEZE",
  "SELF_STOP",
] as const;
export type WatcherAction = (typeof WATCHER_ACTIONS)[number];

// The ExecutionRequest tuple components for viem abi-encoding. Order MUST match Solidity.
export const EXECUTION_REQUEST_COMPONENTS = [
  { name: "intentId", type: "bytes32" },
  { name: "executorAgentTokenId", type: "uint256" },
  { name: "action", type: "uint8" },
  { name: "tokenIn", type: "address" },
  { name: "tokenOut", type: "address" },
  { name: "recipient", type: "address" },
  { name: "amountIn", type: "uint256" },
  { name: "minAmountOut", type: "uint256" },
  { name: "quotedAmountOut", type: "uint256" },
  { name: "slippageBps", type: "uint16" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint64" },
  { name: "bindingNonce", type: "uint256" },
  { name: "quoteHash", type: "bytes32" },
  { name: "simulationHash", type: "bytes32" },
  { name: "evidenceRoot", type: "bytes32" },
  { name: "reasonHash", type: "bytes32" },
] as const;
