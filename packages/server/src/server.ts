// IntentOS control-panel server. Serves the built dApp + a small write-path API. Public: the SPA,
// /api/state (read-only chain data), and the /api/auth/* Web3->Firebase handshake. Everything that
// moves money or calls the LLM requires a verified Firebase ID token (plan/010 §17). Keys never reach
// the browser: mint / 7702 / KMS-signed execute / votes all happen here.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";
import {
  activatePlan,
  addressFromUid,
  createExecutor,
  createWatcher,
  fundGas,
  getState,
  ownerMode,
  ownerGuardPlan,
  ownerResume,
  reset,
  runtimeRun,
  runtimeStart,
  runtimeStatus,
  runtimeStop,
  runtimeTick,
  trade,
  watcherFreeze,
  watcherTighten,
} from "./journey.js";
import { issueNonce, siweMessage, verifyAndMint } from "./web3auth.js";
import { requireUid, authEnabled, rateLimit } from "./authGate.js";
import { intentChat, fixPackage, setStartConfig, updatePackageSemantic, listIntents, getIntentFull } from "./intent.js";
import { proxyRpc } from "./rpcProxy.js";
import { worldIdEnabled, worldIdConfig, signRpRequest, verifyProof, extractProofFields, signalMatchesAddress, isSharedNullifierUid } from "./worldid.js";
import { store } from "./store.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIST = process.env.APP_DIST ?? resolve(HERE, "../../../app/dist");
const PORT = Number(process.env.PORT ?? 8080);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function json(res: ServerResponse, status: number, body: unknown) {
  const s = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(s);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return {};
  }
}

// Write-path handlers receive the authenticated uid and the (already-parsed) request body, so the
// create/trade/resume/reset endpoints use the caller's FIXed Agent Package (intentId) instead of a
// hardcoded one. Gas funding takes an explicit lane.
type WriteBody = { intentId?: string; lane?: "executor" | "watcher"; reason?: string; role?: "EXECUTOR" | "WATCHER"; semantic?: unknown };
const API: Record<string, (uid: string, body: WriteBody) => Promise<unknown>> = {
  "POST /api/executor/create": (uid, b) => createExecutor({ uid, intentId: b.intentId }),
  "POST /api/watcher/create": (uid, b) => createWatcher({ uid, intentId: b.intentId }),
  "POST /api/gas/fund": (uid, b) => fundGas(b.lane === "watcher" ? "watcher" : "executor", { uid, intentId: b.intentId }),
  "POST /api/runtime/run": (uid, b) => runtimeRun({ uid, intentId: b.intentId }),
  "POST /api/runtime/start": (uid, b) => runtimeStart({ uid, intentId: b.intentId }),
  "POST /api/runtime/stop": (uid, b) => runtimeStop({ uid, intentId: b.intentId }, b.reason),
  "POST /api/runtime/tick": (uid, b) => runtimeTick({ uid, intentId: b.intentId }),
  "POST /api/trade": (uid, b) => trade({ uid, intentId: b.intentId }),
  "POST /api/watcher/freeze": (uid, b) => watcherFreeze({ uid, intentId: b.intentId }),
  "POST /api/watcher/tighten": (uid, b) => watcherTighten({ uid, intentId: b.intentId }),
  "POST /api/owner/guard-plan": (uid, b) => ownerGuardPlan({ uid, intentId: b.intentId }),
  "POST /api/owner/resume": (uid, b) => ownerResume({ uid, intentId: b.intentId }),
  "POST /api/reset": (uid, b) => reset({ uid, intentId: b.intentId }),
  "POST /api/intent/semantic": (uid, b) => {
    if (!b.intentId || !b.role) throw new Error("intentId and role required");
    return updatePackageSemantic(uid, b.intentId, b.role, b.semantic);
  },
};

async function serveStatic(res: ServerResponse, urlPath: string) {
  let rel = urlPath === "/" ? "/index.html" : urlPath;
  const full = normalize(join(APP_DIST, rel));
  if (!full.startsWith(APP_DIST)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  if (!existsSync(full)) {
    // SPA fallback
    rel = "/index.html";
  }
  const file = existsSync(full) ? full : join(APP_DIST, "index.html");
  try {
    const buf = await readFile(file);
    const ext = file.slice(file.lastIndexOf("."));
    res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" });
    res.end(buf);
  } catch {
    res.writeHead(404).end("not found");
  }
}

async function main() {
  // No HTTP Basic auth: it does not attach reliably to fetch()/XHR, which caused repeated native
  // login popups and intermittent 401s on /api/*. The real gate is Firebase Auth (Web3 sign-in):
  // public = the SPA, /api/state (read-only chain data), and the /api/auth/* handshake; everything
  // that moves money or calls the LLM requires a verified Firebase ID token (plan/010 §17).
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const path = url.pathname;

    // /healthz is unauthenticated (Cloud Run probe)
    if (path === "/healthz") {
      json(res, 200, { ok: true });
      return;
    }

    // Public client config: the SINGLE source of truth for whether the client must sign in. The client
    // derives "auth required" from this (not from its own build-time Firebase key), so the two can
    // never disagree and silently create an empty-token session that 401s every write (AUTH-002).
    if (path === "/api/config" && req.method === "GET") {
      const wid = worldIdEnabled();
      json(res, 200, {
        authRequired: authEnabled(),
        ownerMode: ownerMode(),
        worldIdRequired: wid,
        worldId: wid ? worldIdConfig() : null,
      });
      return;
    }

    // ---- Web3 login -> Firebase custom token (plan/010 §17) ----
    if (path === "/api/auth/nonce" && req.method === "GET") {
      const address = url.searchParams.get("address") ?? "";
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        json(res, 400, { error: "valid ?address= required" });
        return;
      }
      const nonce = issueNonce(address);
      const domain = req.headers.host ?? "intentos";
      json(res, 200, { nonce, message: siweMessage(address, nonce, domain) });
      return;
    }
    if (path === "/api/auth/web3" && req.method === "POST") {
      const body = (await readBody(req)) as { message?: string; signature?: string };
      try {
        if (!body.message || !body.signature) throw new Error("message and signature required");
        const out = await verifyAndMint(body.message, body.signature as `0x${string}`);
        json(res, 200, out);
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    // ---- World ID human-proof gate (plan/110). RP request signed + proof verified SERVER-SIDE. ----
    // The proof is bound to the signed-in Owner EOA (signal = address) and its nullifier is stored
    // uniquely (one human, one action), so a wallet alone can't mass-create Cloud Run runtimes.
    // Source of truth for "is this user human-verified" — the client must NOT decide from a local flag.
    if (path === "/api/worldid/status" && req.method === "GET") {
      if (!worldIdEnabled()) {
        json(res, 200, { required: false, verified: false });
        return;
      }
      let uid: string;
      try {
        uid = await requireUid(req);
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      try {
        json(res, 200, { required: true, verified: await store().getHumanVerified(uid) });
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    // Self-scoped reset so a user can re-run the World ID flow (e.g. for demo/screenshots). Authed; it
    // only ever clears the CALLER's own verified flag + their nullifier for the action.
    if (path === "/api/worldid/reset" && req.method === "POST") {
      if (!worldIdEnabled()) {
        json(res, 404, { error: "world id not configured" });
        return;
      }
      let uid: string;
      try {
        uid = await requireUid(req);
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      try {
        await store().clearWorldIdVerification(uid, worldIdConfig().action);
        json(res, 200, { reset: true });
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    if (path === "/api/worldid/sign" && req.method === "POST") {
      if (!worldIdEnabled()) {
        json(res, 404, { error: "world id not configured" });
        return;
      }
      try {
        await requireUid(req); // only signed-in users may request a proof challenge
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      try {
        const body = (await readBody(req)) as { action?: string };
        json(res, 200, await signRpRequest(body.action ?? worldIdConfig().action));
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    if (path === "/api/worldid/verify" && req.method === "POST") {
      if (!worldIdEnabled()) {
        json(res, 404, { error: "world id not configured" });
        return;
      }
      let uid: string;
      try {
        uid = await requireUid(req);
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      try {
        const body = (await readBody(req)) as { payload?: unknown };
        const payload = body?.payload ?? body;
        const address = addressFromUid(uid);
        if (!address) {
          json(res, 400, { error: "no address for uid" });
          return;
        }
        // 1) verify the proof with World (forwarded byte-for-byte; never trust the client's word)
        const v = await verifyProof(payload);
        if (!v.ok) {
          json(res, 400, { error: "verification failed", detail: v.body });
          return;
        }
        // 2) bind: the proof's signal must be THIS owner's address
        const { nullifier, signalHash } = extractProofFields(payload);
        if (!nullifier) {
          json(res, 400, { error: "no nullifier in proof" });
          return;
        }
        if (!signalMatchesAddress(signalHash, address)) {
          json(res, 400, { error: "signal does not match account" });
          return;
        }
        // 3) one-human-one-action. The nullifier is deterministic (same human + action ⇒ same value).
        //    - belongs to a DIFFERENT uid  ⇒ 409 (Sybil protection: one human can't claim many accounts)
        //    - belongs to THIS uid / not seen ⇒ idempotent success (re-verifying yourself is fine, e.g. demos)
        //    - EXCEPTION: a small allowlist of test EOAs may share one nullifier (both sides must be listed).
        const action = worldIdConfig().action;
        const mayShare = isSharedNullifierUid(uid);
        const existing = await store().getWorldIdNullifier(action, nullifier);
        if (
          existing && existing.uid && existing.uid !== uid &&
          !(mayShare && isSharedNullifierUid(existing.uid))
        ) {
          json(res, 409, { error: "this World ID is already linked to another account" });
          return;
        }
        if (!existing) {
          const put = await store().putWorldIdNullifier(action, nullifier, uid);
          if (put === "exists") {
            // Stale read / race: the doc actually exists. Re-check the real owner before deciding.
            const owner = await store().getWorldIdNullifier(action, nullifier);
            if (
              owner && owner.uid && owner.uid !== uid &&
              !(mayShare && isSharedNullifierUid(owner.uid))
            ) {
              json(res, 409, { error: "this World ID is already linked to another account" });
              return;
            }
          }
        }
        await store().setHumanVerified(uid, { nullifier, action, verifiedAt: Date.now() });
        json(res, 200, { verified: true });
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    // ---- Runtime Registry status (auth-gated; plan/090) ----
    if (path === "/api/runtime/status" && req.method === "GET") {
      let uid: string;
      try {
        uid = await requireUid(req);
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      const intentId = url.searchParams.get("intentId") ?? "";
      if (!intentId) {
        json(res, 400, { error: "intentId required" });
        return;
      }
      try {
        json(res, 200, await runtimeStatus({ uid, intentId }));
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }


    // ---- keyless JSON-RPC proxy for the Activation Kit (public; allowlisted methods; key stays server-side) ----
    if (path === "/api/rpc" && req.method === "POST") {
      try {
        const body = await readBody(req);
        json(res, 200, await proxyRpc(body));
      } catch (e) {
        json(res, 400, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    // ---- PRODUCT mode: per-user EIP-7702 "Activate" plan (unsigned initialize params; plan/080) ----
    if (path === "/api/activate/plan" && req.method === "GET") {
      let uid: string;
      try {
        uid = await requireUid(req);
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      try {
        const addr = addressFromUid(uid) ?? undefined;
        json(res, 200, { ownerMode: ownerMode(), ...(await activatePlan(addr)) });
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    // ---- public on-chain state read ----
    if (path === "/api/state" && req.method === "GET") {
      try {
        // Public read of on-chain account state. In connected mode the client passes ?address= so the
        // panel reflects the visitor's OWN delegated EOA; with no address it's the shared demo Owner.
        const a = url.searchParams.get("address") ?? "";
        const addr = /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as `0x${string}`) : undefined;
        const intentId = url.searchParams.get("intentId") ?? undefined;
        json(res, 200, await getState(addr, intentId));
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    // ---- IntentBuilder + per-wallet store (auth-gated; §16/§18) ----
    if (path.startsWith("/api/intent") || path === "/api/intents" || path.startsWith("/api/intents/")) {
      let uid: string;
      try {
        uid = await requireUid(req);
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      try {
        if (path === "/api/intent/chat" && req.method === "POST") {
          if (!rateLimit(uid)) {
            json(res, 429, { error: "rate limited" });
            return;
          }
          const body = (await readBody(req)) as { intentId?: string; text?: string };
          json(res, 200, await intentChat(uid, body.intentId, body.text ?? ""));
          return;
        }
        if (path === "/api/intent/fix" && req.method === "POST") {
          const body = (await readBody(req)) as { intentId?: string; role?: "EXECUTOR" | "WATCHER" };
          if (!body.intentId || !body.role) throw new Error("intentId and role required");
          json(res, 200, await fixPackage(uid, body.intentId, body.role));
          return;
        }
        if (path === "/api/intent/start-config" && req.method === "POST") {
          const body = (await readBody(req)) as {
            intentId?: string;
            loopPeriodSec?: number;
            ttlMinutes?: number;
            watcherEnabled?: boolean;
          };
          if (!body.intentId) throw new Error("intentId required");
          const { intentId, ...cfg } = body;
          json(res, 200, await setStartConfig(uid, intentId, cfg));
          return;
        }
        if (path === "/api/intents" && req.method === "GET") {
          json(res, 200, { intents: await listIntents(uid) });
          return;
        }
        const m = path.match(/^\/api\/intents\/([^/]+)$/);
        if (m && req.method === "GET") {
          const doc = await getIntentFull(uid, decodeURIComponent(m[1]));
          if (!doc) {
            json(res, 404, { error: "not found" });
            return;
          }
          json(res, 200, doc);
          return;
        }
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      json(res, 404, { error: "not found" });
      return;
    }

    // ---- write-path (money / agents): Firebase-Auth-gated (plan/010 §17) ----
    const key = `${req.method} ${path}`;
    if (API[key]) {
      let uid: string;
      try {
        uid = await requireUid(req); // throws when auth enabled and no valid bearer
      } catch (e) {
        json(res, 401, { error: e instanceof Error ? e.message : String(e) });
        return;
      }
      const body = (await readBody(req)) as WriteBody;
      try {
        json(res, 200, (await API[key](uid, body)) ?? { ok: true });
      } catch (e) {
        console.error(`[api] ${key} failed:`, e instanceof Error ? e.message : e);
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
      return;
    }

    if (req.method === "GET") {
      await serveStatic(res, path);
      return;
    }
    res.writeHead(404).end("not found");
  });

  server.listen(PORT, () => {
    console.log(`IntentOS control panel on :${PORT} (app dist: ${APP_DIST})`);
    console.log(
      `toggles: AUTH=${authEnabled() ? "firebase" : "off"} STORE=${process.env.INTENTOS_STORE ?? "memory"} LLM=${process.env.INTENTOS_LLM ?? "mock"}`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
