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
  agentNft: "0x82b70553c4b7b4506cb39032c91e94c49d613fee" as Address,
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  weth: "0x4200000000000000000000000000000000000006" as Address,
};

export const BASE_RPC = import.meta.env.VITE_BASE_RPC ?? "https://mainnet.base.org";

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
