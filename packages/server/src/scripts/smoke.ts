// Real-backend live smoke test (no mocks). Exercises the deployed server end to end:
//   1. /api/state returns live Base mainnet chain data
//   2. money/LLM endpoints are Firebase-gated (401 without a bearer)
//   3. the full Web3 -> Firebase handshake yields a usable ID token
//   4. that token unlocks the per-wallet store (/api/intents)
// Usage: URL=https://<run-url> VITE_FIREBASE_API_KEY=... node dist/scripts/smoke.js
// Exit 0 = all pass, 1 = any fail. Safe: read-only + a throwaway sign-in (no money moves).
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const URL = process.env.URL ?? "https://intentos-panel-41929375451.us-central1.run.app";
const API_KEY = process.env.VITE_FIREBASE_API_KEY ?? "";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}

async function main() {
  // 1. live chain state
  const stateRes = await fetch(`${URL}/api/state`);
  const state = stateRes.ok ? ((await stateRes.json()) as { delegated?: boolean; timeline?: unknown[] }) : null;
  check("/api/state returns live chain data", !!state && typeof state.delegated === "boolean", state ? `delegated=${state.delegated}` : `http ${stateRes.status}`);

  // 2. gated endpoints reject without a bearer (fail-closed)
  const tradeNoAuth = await fetch(`${URL}/api/trade`, { method: "POST" });
  check("/api/trade is Firebase-gated", tradeNoAuth.status === 401, `http ${tradeNoAuth.status}`);
  const chatNoAuth = await fetch(`${URL}/api/intent/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  check("/api/intent/chat is Firebase-gated", chatNoAuth.status === 401, `http ${chatNoAuth.status}`);
  const intentsNoAuth = await fetch(`${URL}/api/intents`);
  check("/api/intents is Firebase-gated", intentsNoAuth.status === 401, `http ${intentsNoAuth.status}`);

  // 3. full Web3 -> Firebase handshake (throwaway key)
  const acct = privateKeyToAccount(generatePrivateKey());
  const nonceRes = await fetch(`${URL}/api/auth/nonce?address=${acct.address}`);
  const nonceOk = nonceRes.ok;
  const { message } = nonceOk ? ((await nonceRes.json()) as { message: string }) : { message: "" };
  check("/api/auth/nonce", nonceOk, `http ${nonceRes.status}`);
  let idToken = "";
  if (nonceOk) {
    const signature = await acct.signMessage({ message });
    const web3Res = await fetch(`${URL}/api/auth/web3`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, signature }) });
    const web3Ok = web3Res.ok;
    const web3 = web3Ok ? ((await web3Res.json()) as { customToken: string }) : null;
    check("/api/auth/web3 mints custom token", web3Ok && !!web3?.customToken, `http ${web3Res.status}`);

    if (web3Ok && web3 && API_KEY) {
      const exch = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: web3.customToken, returnSecureToken: true }),
      });
      const exchOk = exch.ok;
      const tok = exchOk ? ((await exch.json()) as { idToken: string }) : null;
      idToken = tok?.idToken ?? "";
      check("signInWithCustomToken -> Firebase ID token", exchOk && !!idToken, `http ${exch.status}`);
    } else if (!API_KEY) {
      console.log("SKIP  signInWithCustomToken (no VITE_FIREBASE_API_KEY)");
    }
  }

  // 4. ID token unlocks the per-wallet store
  if (idToken) {
    const intentsRes = await fetch(`${URL}/api/intents`, { headers: { authorization: `Bearer ${idToken}` } });
    check("/api/intents with bearer", intentsRes.status === 200, `http ${intentsRes.status}`);
  }

  console.log(`\n${failures === 0 ? "ALL SMOKE CHECKS PASSED" : `${failures} SMOKE CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error("THREW:", e); process.exit(1); });
