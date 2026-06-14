// Keyless JSON-RPC proxy for the Activation Kit (and any keyless client). The kit must reach a
// 7702-aware Base node to estimate/submit the delegate+initialize tx, but we do NOT want to ship an
// Alchemy/Infura key inside the publicly-downloaded kit. So the kit calls `POST /api/rpc` here and the
// server forwards to the keyed providers it already loads from Secret Manager (Alchemy first), trying
// each in order until one answers. The upstream key never leaves the server.
//
// SAFETY: this is an open relay surface, so we (1) allowlist read + the exact methods activation needs,
// (2) cap the body size, and (3) never echo the upstream URL/key in errors. It only proxies Base
// mainnet JSON-RPC; no arbitrary host.
import { getBaseRpcUrls } from "@intentos/runtime";

// Methods the kit needs: chain/account reads + gas + raw-tx broadcast. eth_sendTransaction is NOT here
// (the kit signs locally and sends eth_sendRawTransaction). No admin/debug/trace methods.
const ALLOWED = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_sendRawTransaction",
]);

let _cached: { urls: string[]; at: number } | null = null;
async function rpcUrls(): Promise<string[]> {
  if (_cached && Date.now() - _cached.at < 60_000) return _cached.urls;
  const urls = await getBaseRpcUrls();
  _cached = { urls, at: Date.now() };
  return urls;
}

type RpcReq = { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };

/** Handle a single or batched JSON-RPC request from the kit. Returns the upstream JSON response. */
export async function proxyRpc(body: unknown): Promise<unknown> {
  const reqs: RpcReq[] = Array.isArray(body) ? (body as RpcReq[]) : [body as RpcReq];
  for (const r of reqs) {
    if (!r || typeof r.method !== "string" || !ALLOWED.has(r.method)) {
      throw new Error(`method not allowed: ${r?.method ?? "(none)"}`);
    }
  }
  const urls = await rpcUrls();
  let lastErr: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        lastErr = new Error(`upstream ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (e) {
      lastErr = e; // try the next provider; do not leak which URL/key failed
    }
  }
  throw new Error(`all RPC providers failed${lastErr instanceof Error ? `: ${lastErr.message}` : ""}`);
}
