// IntentOS control-panel server. Serves the built dApp + a small write-path API behind Basic auth.
// Keys never reach the browser: mint / 7702 / KMS-signed execute / votes all happen here.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";
import {
  createExecutor,
  createWatcher,
  getState,
  ownerResume,
  reset,
  trade,
  watcherFreeze,
  watcherTighten,
} from "./journey.js";
import { getBasicAuth } from "./auth.js";
import { issueNonce, siweMessage, verifyAndMint } from "./web3auth.js";
import { requireUid, authEnabled, rateLimit } from "./authGate.js";
import { intentChat, fixPackage, setStartConfig, listIntents, getIntentFull } from "./intent.js";

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
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
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

// timing-safe-ish basic auth check
function checkAuth(req: IncomingMessage, expected: string): boolean {
  const h = req.headers.authorization ?? "";
  if (!h.startsWith("Basic ")) return false;
  const got = Buffer.from(h.slice(6), "base64").toString();
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const API: Record<string, () => Promise<unknown>> = {
  "POST /api/executor/create": createExecutor,
  "POST /api/watcher/create": createWatcher,
  "POST /api/trade": trade,
  "POST /api/watcher/freeze": watcherFreeze,
  "POST /api/watcher/tighten": watcherTighten,
  "POST /api/owner/resume": ownerResume,
  "POST /api/reset": reset,
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
  const expectedAuth = await getBasicAuth();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const path = url.pathname;

    // /healthz is unauthenticated (Cloud Run probe)
    if (path === "/healthz") {
      json(res, 200, { ok: true });
      return;
    }

    if (expectedAuth && !checkAuth(req, expectedAuth)) {
      res.writeHead(401, { "www-authenticate": 'Basic realm="IntentOS", charset="UTF-8"' });
      res.end("Authentication required");
      return;
    }

    if (path === "/api/state" && req.method === "GET") {
      try {
        json(res, 200, await getState());
      } catch (e) {
        json(res, 500, { error: e instanceof Error ? e.message : String(e) });
      }
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

    const key = `${req.method} ${path}`;
    if (API[key]) {
      await readBody(req); // drain
      try {
        json(res, 200, (await API[key]()) ?? { ok: true });
      } catch (e) {
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
    console.log(`auth: ${expectedAuth ? "Basic (enabled)" : "DISABLED"}`);
    console.log(
      `toggles: AUTH=${authEnabled() ? "firebase" : "off"} STORE=${process.env.INTENTOS_STORE ?? "memory"} LLM=${process.env.INTENTOS_LLM ?? "mock"}`,
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
