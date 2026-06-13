// Builds the exact digests the ExecutionDelegate7702 recovers (contracts/src/ExecutionDelegate7702.sol).
// inner = keccak256(abi.encode(chainId, delegate, request)); signed value = EIP-191(inner).

import { encodeAbiParameters, hashMessage, keccak256, type Address, type Hex } from "viem";
import { EXECUTION_REQUEST_COMPONENTS, type ExecutionRequest, type GuardPatch } from "./types.js";

const EXECUTION_REQUEST_TUPLE = {
  type: "tuple",
  components: EXECUTION_REQUEST_COMPONENTS,
} as const;

const GUARD_PATCH_TUPLE = {
  type: "tuple",
  components: [
    { name: "amountCapPerTx", type: "uint256" },
    { name: "cumulativeCap", type: "uint256" },
    { name: "slippageCapBps", type: "uint16" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

export function executionRequestInnerHash(chainId: number, delegate: Address, r: ExecutionRequest): Hex {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, EXECUTION_REQUEST_TUPLE],
    [BigInt(chainId), delegate, r as never],
  );
  return keccak256(encoded);
}

/** The 32-byte value the SessionKey signs (EIP-191 over the inner hash). */
export function executionRequestDigest(chainId: number, delegate: Address, r: ExecutionRequest): Hex {
  return hashMessage({ raw: executionRequestInnerHash(chainId, delegate, r) });
}

export function tightenDigest(chainId: number, delegate: Address, p: GuardPatch): Hex {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "string" }, GUARD_PATCH_TUPLE],
    [BigInt(chainId), delegate, "TIGHTEN", p as never],
  );
  return hashMessage({ raw: keccak256(encoded) });
}

export function freezeDigest(chainId: number, delegate: Address, bindingNonce: bigint): Hex {
  const encoded = encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "string" }, { type: "uint256" }],
    [BigInt(chainId), delegate, "FREEZE", bindingNonce],
  );
  return hashMessage({ raw: keccak256(encoded) });
}
