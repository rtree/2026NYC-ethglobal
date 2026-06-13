// Bounded Executor AgentLoop (North Star §4, 010 §8/§12). Strictly bounded per repo policy:
// maxTicks, tickIntervalMs, maxAttemptsPerTick — no infinite loops, no spamming.
import type { Account, Address, Hex, PublicClient, WalletClient } from "viem";
import { ExecutionDelegate7702Abi, type ExecutionRequest, type HardGuardState, Action } from "@intentos/shared";
import { quoteExactInputSingle } from "./quote.js";
import { buildExecutionRequest, signExecutionRequest } from "./buildRequest.js";
import { relaySubmitExecution } from "./relay.js";
import { previewGuard } from "./feedback.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;

export interface ExecutorDeps {
  pub: PublicClient;
  wallet: WalletClient;
  delegate: Address;
  relayerAccount: Account | Address;
  intentId: Hex;
  executorTokenId: bigint;
}

export interface ExecutorPolicy {
  maxTicks: number;
  tickIntervalMs: number;
  maxAttemptsPerTick: number;
  baseAmountIn: bigint; // tokenIn units the strategy wants per tick
  slippageBps: number;
}

export interface TickRecord {
  tick: number;
  action: "BUY" | "HOLD" | "STOP";
  amountIn?: bigint;
  txHash?: Hex;
  rejections: string[]; // guard rejections observed this tick (feedback loop evidence)
  note?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readGuard(pub: PublicClient, delegate: Address): Promise<HardGuardState> {
  return (await pub.readContract({ address: delegate, abi, functionName: "guard" })) as HardGuardState;
}
async function readCumulative(pub: PublicClient, delegate: Address): Promise<bigint> {
  return (await pub.readContract({ address: delegate, abi, functionName: "cumulativeSpent" })) as bigint;
}

/** Run a bounded DCA executor: each tick BUY baseAmountIn, backing off on AmountTooLarge, stopping at
 *  the cumulative cap / freeze / maxTicks. Demonstrates the guard->LLM feedback loop deterministically. */
export async function runExecutor(deps: ExecutorDeps, policy: ExecutorPolicy): Promise<TickRecord[]> {
  const records: TickRecord[] = [];
  const { pub, wallet, delegate, relayerAccount } = deps;

  for (let tick = 0; tick < policy.maxTicks; tick++) {
    const guard = await readGuard(pub, delegate);
    const spent = await readCumulative(pub, delegate);

    if (guard.frozen) {
      records.push({ tick, action: "STOP", rejections: [], note: "frozen" });
      break;
    }
    if (spent + policy.baseAmountIn > guard.cumulativeCap) {
      records.push({ tick, action: "STOP", rejections: [], note: "cumulative cap reached" });
      break;
    }

    let amountIn = policy.baseAmountIn;
    const rejections: string[] = [];
    let submitted = false;

    for (let attempt = 0; attempt < policy.maxAttemptsPerTick; attempt++) {
      const quoted = await quoteExactInputSingle(pub, guard.tokenA, guard.tokenB, amountIn, guard.poolFee);
      const reason = `BUY ${amountIn} USDC->WETH t${tick} a${attempt}`.slice(0, 200);
      const req: ExecutionRequest = buildExecutionRequest({
        intentId: deps.intentId,
        executorTokenId: deps.executorTokenId,
        action: Action.BUY,
        tokenIn: guard.tokenA,
        tokenOut: guard.tokenB,
        recipient: delegate,
        amountIn,
        quotedAmountOut: quoted,
        slippageBps: policy.slippageBps,
        nonce: BigInt(Date.now()) * 1000n + BigInt(tick * 10 + attempt),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
        bindingNonce: guard.bindingNonce,
        reason,
      });

      const pre = await previewGuard(pub, delegate, req);
      if (!pre.ok) {
        rejections.push(pre.reason);
        // Feedback: adapt to the boundary. Backoff on amount, stop on cap.
        if (pre.reason === "AmountTooLarge") {
          amountIn = amountIn / 2n;
          if (amountIn === 0n) break;
          continue;
        }
        break; // other rejections: stop this tick
      }

      const sig = await signExecutionRequest(delegate, req);
      const txHash = await relaySubmitExecution(wallet, pub, delegate, req, reason, sig, relayerAccount);
      records.push({ tick, action: "BUY", amountIn, txHash, rejections });
      submitted = true;
      break;
    }

    if (!submitted && records[records.length - 1]?.tick !== tick) {
      records.push({ tick, action: "HOLD", rejections, note: "no valid request this tick" });
    }
    if (tick < policy.maxTicks - 1) await sleep(policy.tickIntervalMs);
  }

  return records;
}
