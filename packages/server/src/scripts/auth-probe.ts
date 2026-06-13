// Live end-to-end auth handshake probe: nonce -> SIWE sign (throwaway key) -> /api/auth/web3 ->
// signInWithCustomToken REST. Pinpoints exactly where "missing bearer token" originates.
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const URL = process.env.URL ?? "https://intentos-panel-41929375451.us-central1.run.app";
const API_KEY = process.env.VITE_FIREBASE_API_KEY ?? "";

async function main() {
  const acct = privateKeyToAccount(generatePrivateKey());
  console.log("throwaway address:", acct.address);

  // 1) nonce + message
  const nonceRes = await fetch(`${URL}/api/auth/nonce?address=${acct.address}`);
  console.log(`1. /api/auth/nonce -> ${nonceRes.status}`);
  if (!nonceRes.ok) { console.log("   FAIL:", (await nonceRes.text()).slice(0, 200)); return; }
  const { message } = (await nonceRes.json()) as { message: string };

  // 2) sign
  const signature = await acct.signMessage({ message });
  console.log("2. signed SIWE message (len", signature.length, ")");

  // 3) verify + mint custom token
  const web3Res = await fetch(`${URL}/api/auth/web3`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, signature }),
  });
  console.log(`3. /api/auth/web3 -> ${web3Res.status}`);
  const web3Body = await web3Res.text();
  if (!web3Res.ok) { console.log("   FAIL:", web3Body.slice(0, 300)); return; }
  const { customToken, uid } = JSON.parse(web3Body) as { customToken: string; uid: string };
  console.log("   uid:", uid, "| customToken len:", customToken.length);

  // 4) exchange custom token for a Firebase ID token (what the browser does)
  if (!API_KEY) { console.log("4. SKIP signInWithCustomToken (no VITE_FIREBASE_API_KEY in env)"); return; }
  const exch = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) },
  );
  console.log(`4. signInWithCustomToken -> ${exch.status}`);
  const exchBody = await exch.text();
  if (!exch.ok) { console.log("   FAIL:", exchBody.slice(0, 400)); return; }
  const tok = JSON.parse(exchBody) as { idToken: string; expiresIn: string };
  console.log("   idToken len:", tok.idToken?.length, "| expiresIn:", tok.expiresIn);

  // 5) use the ID token against a gated endpoint
  const intentsRes = await fetch(`${URL}/api/intents`, { headers: { authorization: `Bearer ${tok.idToken}` } });
  console.log(`5. /api/intents WITH bearer -> ${intentsRes.status}`);
  console.log("   body:", (await intentsRes.text()).slice(0, 120));
  console.log("\nALL STEPS COMPLETED");
}

main().catch((e) => { console.error("THREW:", e); process.exit(1); });
