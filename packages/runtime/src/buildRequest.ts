// intentos.submit_execution_request build+sign half (010 §8). Assembles the typed ExecutionRequest and
// signs its digest with the KMS Executor SessionKey. NEVER clamps amounts (010 §12) — caller decides.
import { keccak256, toHex, type Address, type Hex } from "viem";
import {
  Action,
  CHAIN_ID,
  KMS,
  executionRequestDigest,
  keyVersion,
  kmsSignDigest,
  type ExecutionRequest,
} from "@intentos/shared";

export interface BuildParams {
  intentId: Hex;
  executorTokenId: bigint;
  action: Action;
  tokenIn: Address;
  tokenOut: Address;
  recipient: Address; // == delegate (Owner EOA)
  amountIn: bigint;
  quotedAmountOut: bigint;
  slippageBps: number;
  nonce: bigint;
  deadline: bigint;
  bindingNonce: bigint;
  reason: string;
  quoteHash?: Hex;
  simulationHash?: Hex;
  evidenceRoot?: Hex;
}

export function buildExecutionRequest(p: BuildParams): ExecutionRequest {
  const minAmountOut = (p.quotedAmountOut * BigInt(10000 - p.slippageBps)) / 10000n;
  return {
    intentId: p.intentId,
    executorAgentTokenId: p.executorTokenId,
    action: p.action,
    tokenIn: p.tokenIn,
    tokenOut: p.tokenOut,
    recipient: p.recipient,
    amountIn: p.amountIn,
    minAmountOut,
    quotedAmountOut: p.quotedAmountOut,
    slippageBps: p.slippageBps,
    nonce: p.nonce,
    deadline: p.deadline,
    bindingNonce: p.bindingNonce,
    quoteHash: p.quoteHash ?? keccak256(toHex("quote")),
    simulationHash: p.simulationHash ?? keccak256(toHex("sim")),
    evidenceRoot: p.evidenceRoot ?? keccak256(toHex("evidence")),
    reasonHash: keccak256(toHex(p.reason)),
  };
}

/** Sign the ExecutionRequest digest with the KMS Executor SessionKey (sign-only). */
export async function signExecutionRequest(
  delegate: Address,
  r: ExecutionRequest,
  keyVersionName: string = keyVersion(KMS.executorSessionKey),
): Promise<Hex> {
  const digest = executionRequestDigest(CHAIN_ID, delegate, r);
  return kmsSignDigest(keyVersionName, digest);
}
