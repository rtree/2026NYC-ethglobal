// One-shot live check of the M5 GCP integrations via ADC (run locally with developer ADC, or on
// Cloud Run with the SA). Proves: (1) IAM signJwt mints a Firebase custom token, (2) Firestore REST
// read/write works, (3) Vertex generateContent returns JSON. Tiny + bounded; prints PASS/FAIL only.
// Usage: INTENTOS_STORE=firestore INTENTOS_LLM=vertex node packages/server/dist/scripts/m5-live-check.js
import { mintCustomToken } from "../firebaseAuth.js";
import { store } from "../store.js";
import { chat } from "../vertex.js";
import type { AgentPackageDraft } from "../intentTypes.js";

const uid = "eip155:8453:0xlivecheck000000000000000000000000000000";

async function main() {
  let ok = true;

  // 1) signJwt custom token
  try {
    const token = await mintCustomToken(uid, { address: "0xlivecheck", chainId: 8453 });
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("not a JWT");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    if (payload.uid !== uid) throw new Error("uid mismatch");
    console.log(`PASS signJwt custom token (aud=${payload.aud.slice(0, 40)}…, exp in ${payload.exp - Math.floor(Date.now() / 1000)}s)`);
  } catch (e) {
    ok = false;
    console.log(`FAIL signJwt: ${e instanceof Error ? e.message : e}`);
  }

  // 2) Firestore round-trip (only when INTENTOS_STORE=firestore)
  if ((process.env.INTENTOS_STORE ?? "memory") === "firestore") {
    try {
      const s = store();
      const intentId = `livecheck-${Date.now()}`;
      await s.putIntent(uid, {
        intentId,
        title: "live check",
        status: "draft",
        createdAt: Date.now(),
        executorTokenId: null,
        watcherTokenId: null,
        // minimal packages
        packages: { executor: stub("EXECUTOR"), watcher: stub("WATCHER") },
        startConfig: { loopPeriodSec: 5, ttlMinutes: 10, watcherEnabled: true },
      });
      await s.appendTurn(uid, intentId, { role: "owner", text: "hello", at: Date.now() });
      const back = await s.getIntent(uid, intentId);
      const turns = await s.getTranscript(uid, intentId);
      if (!back || back.intentId !== intentId) throw new Error("read-back failed");
      if (turns.length !== 1) throw new Error("transcript read-back failed");
      console.log(`PASS Firestore round-trip (intent + 1 turn) [${intentId}]`);
    } catch (e) {
      ok = false;
      console.log(`FAIL Firestore: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.log("SKIP Firestore (INTENTOS_STORE!=firestore)");
  }

  // 3) Vertex (only when INTENTOS_LLM=vertex)
  if ((process.env.INTENTOS_LLM ?? "mock") === "vertex") {
    try {
      const res = await chat([{ role: "owner", text: "DCA USDC into ETH, small and careful." }]);
      if (res.llm !== "vertex") throw new Error(`fell back to ${res.llm} (Vertex unreachable)`);
      if (!res.packages.executor.summary) throw new Error("empty package");
      console.log(`PASS Vertex generateContent (reply: "${res.reply.slice(0, 50)}…")`);
    } catch (e) {
      ok = false;
      console.log(`FAIL Vertex: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.log("SKIP Vertex (INTENTOS_LLM!=vertex)");
  }

  console.log(ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
  process.exit(ok ? 0 : 1);
}

function stub(role: "EXECUTOR" | "WATCHER"): AgentPackageDraft {
  return {
    role,
    summary: "live check",
    agents: "x",
    soul: "x",
    constraints: { tokenA: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", tokenB: "0x4200000000000000000000000000000000000006", poolFee: 500, amountCapPerTx: "2000", cumulativeCap: "100000", slippageCapBps: 300, expiry: "9999999999" },
    semantic: ["x"],
    fixed: false,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
