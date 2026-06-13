// Client for the control-panel write-path API (same origin in prod; Vite proxy in dev).
export interface ApiResult {
  ok?: boolean;
  txHash?: string;
  tokenId?: string;
  reason?: string;
  error?: string;
  newAmountCap?: string;
}

async function post(path: string): Promise<ApiResult> {
  const res = await fetch(path, { method: "POST" });
  const body = (await res.json()) as ApiResult;
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}

export const api = {
  createExecutor: () => post("/api/executor/create"),
  createWatcher: () => post("/api/watcher/create"),
  trade: () => post("/api/trade"),
  watcherFreeze: () => post("/api/watcher/freeze"),
  watcherTighten: () => post("/api/watcher/tighten"),
  ownerResume: () => post("/api/owner/resume"),
  reset: () => post("/api/reset"),
};
