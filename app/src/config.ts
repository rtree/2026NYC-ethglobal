// Browser-safe Base mainnet config + ABIs. Read-only by default; writes go through the user's wallet
// or the relayer (never a privileged backend). Addresses from deployments/base-mainnet.json.
import type { Address } from "viem";
import { base } from "wagmi/chains";

export const CHAIN = base;
export const CHAIN_ID = 8453;

export const ADDR = {
  // The demo Owner EOA (EIP-7702-delegated ExecutionDelegate7702).
  owner: "0xeEa9c291544d02397FD8078e3162a3549ADa0f01" as Address,
  delegateImpl: "0x37d9933c5ac95399c840d3a2c07fdfdbc8b7f9c1" as Address,
  agentNft: "0x3da4947a9b5e255219fa39c52a68219da8f9a7ec" as Address,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
};

export const BASE_RPC = import.meta.env.VITE_BASE_RPC ?? "https://mainnet.base.org";

// Map a Base token address to its symbol (data-driven token-pair display). Unknown -> short address.
const TOKEN_SYMBOLS: Record<string, string> = {
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
  "0x4200000000000000000000000000000000000006": "WETH",
};
export function tokenSymbol(addr?: string): string {
  if (!addr) return "—";
  return TOKEN_SYMBOLS[addr.toLowerCase()] ?? `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
/** "USDC / WETH" derived from a guard's tokenA/tokenB (falls back to the MVP pair). */
export function tokenPair(tokenA?: string, tokenB?: string): string {
  if (!tokenA || !tokenB) return "USDC / WETH";
  return `${tokenSymbol(tokenA)} / ${tokenSymbol(tokenB)}`;
}

// Minimal ABI surface the dApp reads. Full ABI lives in @intentos/shared for the runtime.
export const delegateAbi = [
  {
    type: "function",
    name: "guard",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "router", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "poolFee", type: "uint24" },
          { name: "amountCapPerTx", type: "uint256" },
          { name: "cumulativeCap", type: "uint256" },
          { name: "slippageCapBps", type: "uint16" },
          { name: "expiry", type: "uint64" },
          { name: "frozen", type: "bool" },
          { name: "bindingNonce", type: "uint256" },
        ],
      },
    ],
  },
  { type: "function", name: "cumulativeSpent", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "gasVaults",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "exec", type: "uint256" },
      { name: "watcher", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "fundGasVault",
    stateMutability: "nonpayable",
    inputs: [
      { name: "watcherLane", type: "bool" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "ownerUpdateGuard",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "g",
        type: "tuple",
        components: [
          { name: "router", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "poolFee", type: "uint24" },
          { name: "amountCapPerTx", type: "uint256" },
          { name: "cumulativeCap", type: "uint256" },
          { name: "slippageCapBps", type: "uint16" },
          { name: "expiry", type: "uint64" },
          { name: "frozen", type: "bool" },
          { name: "bindingNonce", type: "uint256" },
        ],
      },
    ],
    outputs: [],
  },
  {
    // PRODUCT mode (plan/080): the browser encodes initialize() to delegate the visitor's OWN EOA in
    // one EIP-7702 self-tx. Kept here (not imported from @intentos/shared) so the Node/KMS graph never
    // enters the browser bundle.
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "g",
        type: "tuple",
        components: [
          { name: "router", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "poolFee", type: "uint24" },
          { name: "amountCapPerTx", type: "uint256" },
          { name: "cumulativeCap", type: "uint256" },
          { name: "slippageCapBps", type: "uint16" },
          { name: "expiry", type: "uint64" },
          { name: "frozen", type: "bool" },
          { name: "bindingNonce", type: "uint256" },
        ],
      },
      { name: "sessionKey", type: "address" },
      { name: "watcherKey", type: "address" },
      { name: "relayer", type: "address" },
      { name: "gasPerTxCap", type: "uint256" },
      { name: "initialExecVault", type: "uint256" },
      { name: "initialWatcherVault", type: "uint256" },
      { name: "packageHash", type: "bytes32" },
      { name: "semanticGuardHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "EvidenceCommitted",
    inputs: [
      { name: "executorAgentTokenId", type: "uint256", indexed: true },
      { name: "intentId", type: "bytes32", indexed: true },
      { name: "executionId", type: "bytes32", indexed: true },
      { name: "action", type: "uint8", indexed: false },
      { name: "packageHash", type: "bytes32", indexed: false },
      { name: "hardGuardHash", type: "bytes32", indexed: false },
      { name: "semanticGuardHash", type: "bytes32", indexed: false },
      { name: "evidenceRoot", type: "bytes32", indexed: false },
      { name: "quoteHash", type: "bytes32", indexed: false },
      { name: "simulationHash", type: "bytes32", indexed: false },
      { name: "executionRequestHash", type: "bytes32", indexed: false },
      { name: "resultHash", type: "bytes32", indexed: false },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GuardTightened",
    inputs: [
      { name: "newHardGuardHash", type: "bytes32", indexed: false },
      { name: "by", type: "address", indexed: false },
    ],
  },
  { type: "event", name: "GuardFrozen", inputs: [{ name: "by", type: "address", indexed: false }] },
] as const;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;
