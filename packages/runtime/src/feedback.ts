// Guard -> LLM feedback (010 §12). Runs the contract's previewGuard via eth_call and decodes the
// custom error so the strategy can re-request inside the boundary. NEVER clamp in the adapter.
import { BaseError, ContractFunctionRevertedError, type Address, type PublicClient } from "viem";
import { ExecutionDelegate7702Abi, type ExecutionRequest } from "@intentos/shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;

export type GuardResult = { ok: true } | { ok: false; reason: string };

export async function previewGuard(
  pub: PublicClient,
  delegate: Address,
  r: ExecutionRequest,
): Promise<GuardResult> {
  try {
    await pub.simulateContract({ address: delegate, abi, functionName: "previewGuard", args: [r] });
    return { ok: true };
  } catch (err) {
    if (err instanceof BaseError) {
      const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
      if (reverted instanceof ContractFunctionRevertedError) {
        return { ok: false, reason: reverted.data?.errorName ?? reverted.reason ?? "Reverted" };
      }
    }
    throw err;
  }
}
