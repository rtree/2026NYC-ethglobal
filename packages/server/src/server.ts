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
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
