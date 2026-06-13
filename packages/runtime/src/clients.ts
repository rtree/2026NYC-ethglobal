import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { base } from "viem/chains";
import { baseRpcUrl } from "@intentos/shared";

export function makePublicClient(rpcUrl: string = baseRpcUrl()) {
  return createPublicClient({ chain: base as Chain, transport: http(rpcUrl) });
}

export function makeWalletClient(rpcUrl: string = baseRpcUrl()) {
  return createWalletClient({ chain: base as Chain, transport: http(rpcUrl) });
}
