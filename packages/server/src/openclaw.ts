import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import { GoogleAuth } from "google-auth-library";
import { PROJECT_ID } from "./gcp.js";

const sm = new SecretManagerServiceClient();
const auth = new GoogleAuth();

const DEFAULT_GATEWAY_URL = "https://intentos-openclaw-gateway-41929375451.us-central1.run.app";
const DEFAULT_TOKEN_SECRET = "intentos-openclaw-gateway-token";

let cachedGatewayToken: string | null = null;

async function gatewayToken(): Promise<string> {
  if (process.env.OPENCLAW_GATEWAY_TOKEN) return process.env.OPENCLAW_GATEWAY_TOKEN;
  if (cachedGatewayToken) return cachedGatewayToken;
  const secret = process.env.OPENCLAW_GATEWAY_TOKEN_SECRET ?? DEFAULT_TOKEN_SECRET;
  const [v] = await sm.accessSecretVersion({
    name: `projects/${PROJECT_ID}/secrets/${secret}/versions/latest`,
  });
  const token = v.payload?.data?.toString().trim();
  if (!token) throw new Error(`OpenClaw gateway token secret is empty: ${secret}`);
  cachedGatewayToken = token;
  return token;
}

async function authedFetch(url: string, init: RequestInit): Promise<Response> {
  const client = await auth.getIdTokenClient(new URL(url).origin);
  const headers = await client.getRequestHeaders(url);
  const h = new Headers(headers as unknown as ConstructorParameters<typeof Headers>[0]);
  const authz = h.get("authorization");
  const outHeaders = new Headers(init.headers);
  if (authz) outHeaders.set("X-Serverless-Authorization", authz);
  return fetch(url, {
    ...init,
    headers: outHeaders,
  });
}

export async function openClawChat(prompt: string): Promise<string> {
  const base = (process.env.OPENCLAW_GATEWAY_URL ?? DEFAULT_GATEWAY_URL).replace(/\/+$/, "");
  const token = await gatewayToken();
  const res = await authedFetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: "openclaw/default",
      user: "intentos-runtime",
      messages: [{ role: "user", content: prompt }],
      max_completion_tokens: 64,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`openclaw chat ${res.status}: ${body.error?.message ?? JSON.stringify(body).slice(0, 200)}`);
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("openclaw chat returned empty content");
  return text;
}
