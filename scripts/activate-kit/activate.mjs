#!/usr/bin/env node
// IntentOS — Local Activation Kit (EIP-7702)
// ---------------------------------------------------------------------------------------------------
// WHY THIS EXISTS: browser wallets (MetaMask) refuse to sign an EIP-7702 authorization for an arbitrary
// dApp-chosen implementation (viem: `Account type "json-rpc" is not supported`). They only 7702-delegate
// to their OWN smart-account implementation. So to delegate YOUR EOA to the IntentOS guard, the
// authorization must be signed by a LOCAL account (key in this process) or a hardware wallet (Ledger).
//
// This kit does exactly one thing, non-custodially and locally:
//   1) load YOUR signer (Ledger [recommended] or an imported mnemonic / private key),
//   2) wait until that EOA holds a little Base ETH,
//   3) sign + broadcast ONE EIP-7702 self-transaction that delegates the EOA to ExecutionDelegate7702
//      and initializes your Hard Guardrails (guard caps, the platform SessionKey + relayer, a tiny gas
//      vault). Your funds never leave your account; the key never leaves this machine.
//
// After this, sign in to the IntentOS panel WITH THE SAME EOA and the agent trades strictly inside your
// guardrails (executions are signed by the platform SessionKey and paid by the relayer, reimbursed from
// your own gas vault). No further signatures from you.
//
// SECURITY: Ledger is strongly recommended for real funds (the key never touches disk/RAM). If you must
// import a key, use a DEDICATED, low-value EOA — never your main wallet's seed. The kit reads the secret
// from a file or env var (so it is not echoed or stored in shell history) and never transmits it.
//
// INSTALL-FREE: the distributed build inlines `viem`. Ledger support is optional (native HID modules
// cannot be bundled) and loaded on demand only when you pass --ledger.
import { createPublicClient, createWalletClient, http, fallback, encodeFunctionData, keccak256, toHex, formatEther, parseEther, getAddress } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount, mnemonicToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, existsSync, chmodSync, unlinkSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout, argv, env, exit } from "node:process";

// ---- baked deployment config (Base mainnet; from deployment/base-mainnet.json + server guard) -------
const CFG = {
  chainId: 8453,
  delegateImpl: "0xDe45a782AE5544D1D682E1cfccf9D6DDa3c833f9",
  sessionKey: "0x86bA13f74C5f2AC469eeb6e0010A6AFfd49298eE", // executor SessionKey (KMS, sign-only)
  watcherKey: "0xEe1Dc2f082612D6d510D7E3b3EEd26cE385E9D38", // watcher SessionKey (KMS, sign-only)
  relayer: "0x078383c4c20b4e9732Ac0c30A68b8123D53ea6C9", // platform relayer / gas sponsor
  swapRouter02: "0x2626664c2603336E57B271c5C0b26F421741e481",
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  weth: "0x4200000000000000000000000000000000000006",
  poolFee: 500,
  selector: "0x04e45aaf", // exactInputSingle
  // guard rails (clamped, tiny-amounts policy) — mirrors the server DEMO_GUARD
  amountCapPerTx: 2000n, // 0.002 USDC (6dp)
  cumulativeCap: 100000n, // 0.1 USDC cumulative
  slippageCapBps: 300,
  gasPerTxCap: parseEther("0.0002"),
  initialExecVault: parseEther("0.0004"),
  initialWatcherVault: parseEther("0.0002"),
  packageHash: keccak256(toHex("intent-abc/pkg")),
  semanticGuardHash: keccak256(toHex("intent-abc/sem")),
  // Default panel origin (this kit is downloaded from it). Its /api/rpc is a KEYLESS proxy to the
  // server's keyed, 7702-aware providers (Alchemy first) — public Base RPCs don't reflect the pending
  // delegation during eth_estimateGas and reject the activation tx. Override with --panel / --rpc.
  panelUrl: "https://intentos-panel-41929375451.us-central1.run.app",
  // public Base RPCs (viem fallback) — keyless but NOT 7702-aware for estimateGas; used only as a last resort.
  rpcs: ["https://mainnet.base.org", "https://base.publicnode.com", "https://base.drpc.org", "https://1rpc.io/base"],
};

// Explicit gas for the activation tx so we DON'T call eth_estimateGas (public Base RPCs estimate against
// the pre-delegation account and revert the delegate+initialize self-call). The real cost is ~120k-200k.
const ACTIVATION_GAS = 600000n;

// Minimum ETH the EOA needs at activation: the vault reserve (exec+watcher) MUST be <= balance
// (`initialize` reverts OVER_ALLOCATED otherwise), plus gas headroom for the type-4 tx itself.
const VAULT_TOTAL = CFG.initialExecVault + CFG.initialWatcherVault; // 0.0006 ETH
const REQUIRED_ETH = VAULT_TOTAL + parseEther("0.0006"); // ~0.0012 ETH; recommend ~0.002 for comfort
const RECOMMENDED_USDC = 1000n; // 0.001 USDC for a first guarded trade (not needed to activate)

const INITIALIZE_ABI = [
  {
    type: "function",
    name: "initialize",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "g",
        type: "tuple",
        components: [
          { name: "router", type: "address" },
          { name: "selector", type: "bytes4" },
          { name: "tokenA", type: "address" },
          { name: "tokenB", type: "address" },
          { name: "poolFee", type: "uint24" },
          { name: "amountCapPerTx", type: "uint256" },
          { name: "cumulativeCap", type: "uint256" },
          { name: "slippageCapBps", type: "uint16" },
          { name: "expiry", type: "uint64" },
          { name: "frozen", type: "bool" },
          { name: "bindingNonce", type: "uint256" },
        ],
      },
      { name: "sessionKey", type: "address" },
      { name: "watcherKey", type: "address" },
      { name: "relayer", type: "address" },
      { name: "gasPerTxCap", type: "uint256" },
      { name: "initialExecVault", type: "uint256" },
      { name: "initialWatcherVault", type: "uint256" },
      { name: "packageHash", type: "bytes32" },
      { name: "semanticGuardHash", type: "bytes32" },
    ],
    outputs: [],
  },
];
const ERC20_ABI = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }];

const C = { reset: "\x1b[0m", b: "\x1b[1m", dim: "\x1b[2m", red: "\x1b[31m", grn: "\x1b[32m", yel: "\x1b[33m", cyn: "\x1b[36m" };
const log = (s = "") => stdout.write(s + "\n");
const ok = (s) => log(`${C.grn}✔${C.reset} ${s}`);
const info = (s) => log(`${C.cyn}→${C.reset} ${s}`);
const warn = (s) => log(`${C.yel}!${C.reset} ${s}`);
const die = (s) => { try { cleanupEnv(); } catch { /* ignore */ } log(`${C.red}✖ ${s}${C.reset}`); exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Remove the temporary key file if the user aborts (e.g. Ctrl-C during the funding wait).
process.on("SIGINT", () => { stdout.write("\n"); try { cleanupEnv(); } catch { /* ignore */ } exit(130); });

function hasFlag(f) { return argv.includes(f); }
function flagVal(f) { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; }

// ---- interactive helpers (no extra deps) -----------------------------------------------------------
const ENV_PATH = flagVal("--env-file") ?? ".env";

/** Visible prompt. */
async function ask(q) {
  const rl = createInterface({ input: stdin, output: stdout });
  const a = (await rl.question(q)).trim();
  rl.close();
  return a;
}

/** Hidden prompt: the prompt text shows, but keystrokes are NOT echoed (for pasting a secret). */
async function askHidden(q) {
  let muted = false;
  const masked = new Writable({ write(chunk, enc, cb) { if (!muted) stdout.write(chunk, enc); cb(); } });
  const rl = createInterface({ input: stdin, output: masked, terminal: true });
  stdout.write(q); // write the prompt UNmuted
  muted = true; // then swallow the echoed keystrokes
  const a = (await rl.question("")).trim();
  rl.close();
  stdout.write("\n");
  return a;
}

/** Minimal .env reader (KEY=value lines). */
function readEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch { /* no file */ }
  return out;
}

/** Write the pasted secret to .env (chmod 600) so it isn't re-typed and isn't in shell history. */
function writeEnvKey(path, key) {
  const varName = /^0x[0-9a-fA-F]{64}$/.test(key) ? "PRIVATE_KEY" : "MNEMONIC";
  writeFileSync(path, `# IntentOS activation kit — TEMPORARY secret. Delete this file when done.\n${varName}=${key}\n`, { mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* best effort on non-POSIX */ }
}

/** Remove the temporary .env (best-effort overwrite, then unlink) unless --keep-env. */
function cleanupEnv() {
  if (hasFlag("--keep-env") || !existsSync(ENV_PATH)) return;
  try { writeFileSync(ENV_PATH, "\n"); unlinkSync(ENV_PATH); info(`Removed the temporary ${ENV_PATH} (key not left on disk).`); }
  catch { warn(`Could not remove ${ENV_PATH} — delete it yourself; it holds your key.`); }
}

function makeClients() {
  const transport = fallback(rpcList().map((u) => http(u, { retryCount: 3, retryDelay: 600 })));
  return {
    pub: createPublicClient({ chain: base, transport }),
    wallet: createWalletClient({ chain: base, transport }),
  };
}

/** Ordered RPC list: explicit --rpc, else the panel /api/rpc proxy (keyless, 7702-aware) then public RPCs. */
function rpcList() {
  if (flagVal("--rpc")) return [flagVal("--rpc")];
  const panel = (flagVal("--panel") ?? CFG.panelUrl).replace(/\/$/, "");
  return [`${panel}/api/rpc`, ...CFG.rpcs];
}

// ---- key source resolution: interactive (Ledger recommended) -> imported key (hidden -> .env) -------
async function loadLedger() {
  warn("Ledger mode is EXPERIMENTAL and requires a recent Ledger Ethereum app that clear-signs EIP-7702.");
  const mod = await import("./ledger.mjs").catch(() => {
    die("Ledger support needs the optional native packages. Run:\n    npm i @ledgerhq/hw-transport-node-hid @ledgerhq/hw-app-eth\n  then re-run. (Or import a dedicated key instead.)");
  });
  return mod.ledgerAccount(flagVal("--hd-path") ?? "m/44'/60'/0'/0/0");
}

function accountFromSecret(secret) {
  try {
    return /^0x[0-9a-fA-F]{64}$/.test(secret) ? privateKeyToAccount(secret) : mnemonicToAccount(secret);
  } catch (e) {
    die(`could not parse key: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function resolveAccount() {
  // Non-interactive overrides (CI / power users) take precedence and skip the menu.
  if (hasFlag("--ledger")) return loadLedger();
  const fileKey = flagVal("--key-file") ? readFileSync(flagVal("--key-file"), "utf8").trim() : null;
  const direct = env.PRIVATE_KEY || env.MNEMONIC || fileKey;
  if (direct) return accountFromSecret(direct);

  // Reuse a key already saved in .env from a previous run (so funding waits don't require re-pasting).
  const saved = readEnvFile(ENV_PATH);
  if (saved.PRIVATE_KEY || saved.MNEMONIC) {
    info(`Using the signer saved in ${ENV_PATH}.`);
    return accountFromSecret(saved.PRIVATE_KEY || saved.MNEMONIC);
  }

  // Interactive menu.
  log(`${C.b}How do you want to sign the activation?${C.reset}`);
  log(`  ${C.b}[1]${C.reset} Ledger hardware wallet   ${C.grn}(recommended — key never leaves the device)${C.reset}`);
  log(`  ${C.b}[2]${C.reset} Paste a private key / mnemonic   ${C.dim}(hidden input; saved to ${ENV_PATH} for this run, then deleted)${C.reset}`);
  const choice = await ask("Choose [1/2]: ");
  if (choice === "1") return loadLedger();
  if (choice !== "2") die("please choose 1 or 2.");

  warn("Use a DEDICATED, low-value EOA — never your main wallet's seed phrase.");
  const secret = await askHidden("Paste your private key (0x…) or mnemonic, then press Enter (input hidden): ");
  if (!secret) die("no key entered");
  const account = accountFromSecret(secret);
  writeEnvKey(ENV_PATH, secret); // temporary store; removed by cleanupEnv() at the end
  ok(`Saved your signer to ${ENV_PATH} for this run (it will be deleted when finished).`);
  return account;
}

async function main() {
  log(`${C.b}IntentOS — Local Activation Kit (EIP-7702)${C.reset}`);
  log(`${C.dim}Delegates YOUR EOA to ${CFG.delegateImpl} on Base mainnet. Non-custodial; key stays local.${C.reset}\n`);

  const account = await resolveAccount();
  const address = getAddress(account.address);
  ok(`Signer ready: ${C.b}${address}${C.reset}`);

  const { pub, wallet } = makeClients();

  // Safety: detect an existing 7702 delegation (e.g. a MetaMask Smart Account) — activating OVERWRITES it.
  const code = await pub.getCode({ address }).catch(() => undefined);
  const isDelegated = !!code && code.toLowerCase().startsWith("0xef0100");
  const currentImpl = isDelegated ? getAddress("0x" + code.slice(8, 48)) : null;
  if (isDelegated && currentImpl.toLowerCase() === CFG.delegateImpl.toLowerCase()) {
    ok("This EOA is already delegated to the IntentOS guard. Nothing to do.");
    info(`Sign in to the panel with ${address} and build your Intent.`);
    cleanupEnv();
    return;
  }
  if (isDelegated) {
    warn(`This EOA is already delegated to ${currentImpl} (e.g. a MetaMask Smart Account).`);
    warn("Activating will OVERWRITE that delegation.");
    if (!hasFlag("--force")) die("Re-run with --force to overwrite, or use a fresh EOA.");
    warn("--force set: proceeding to overwrite.");
  }

  // Funding. Your EOA needs the funds you'll trade with (plus a little ETH for gas). If you imported a
  // wallet that already holds ETH, this passes immediately and we move on.
  let warned = false;
  for (;;) {
    const [bal, usdc] = await Promise.all([
      pub.getBalance({ address }),
      pub.readContract({ address: CFG.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }).catch(() => 0n),
    ]);
    if (bal >= REQUIRED_ETH) {
      ok(`EOA has ${formatEther(bal)} ETH${usdc > 0n ? `, ${Number(usdc) / 1e6} USDC` : ""} — enough to activate.`);
      break;
    }
    if (!warned) {
      info(`Deposit the funds you'll use for trading into your EOA: ${C.b}${address}${C.reset}`);
      log(`    ${C.dim}(needs a little Base ETH for gas; if this wallet already holds ETH you're set). Ctrl-C to abort.${C.reset}`);
      warned = true;
    }
    await sleep(6000);
  }

  // Build the initialize() calldata (guard + authority keys + tiny vault).
  const guard = {
    router: CFG.swapRouter02, selector: CFG.selector, tokenA: CFG.usdc, tokenB: CFG.weth, poolFee: CFG.poolFee,
    amountCapPerTx: CFG.amountCapPerTx, cumulativeCap: CFG.cumulativeCap, slippageCapBps: CFG.slippageCapBps,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86400), frozen: false, bindingNonce: 1n,
  };
  const data = encodeFunctionData({
    abi: INITIALIZE_ABI, functionName: "initialize",
    args: [guard, CFG.sessionKey, CFG.watcherKey, CFG.relayer, CFG.gasPerTxCap, CFG.initialExecVault, CFG.initialWatcherVault, CFG.packageHash, CFG.semanticGuardHash],
  });

  info("Signing EIP-7702 authorization (delegate your EOA to the IntentOS guard)…");
  // `executor: "self"` — the same EOA signs the authorization AND sends the tx (nonce += 1 handling).
  const authorization = await wallet.signAuthorization({ account, contractAddress: CFG.delegateImpl, executor: "self" });

  info("Broadcasting the activation transaction (delegate + initialize, one type-4 tx)…");
  // Explicit gas + fees so viem does NOT call eth_estimateGas (which reverts on non-7702-aware nodes
  // because the delegate code isn't applied during estimation). The panel /api/rpc proxy still serves
  // gas-price reads. Any unused gas is refunded.
  let maxFeePerGas, maxPriorityFeePerGas;
  try {
    const fees = await pub.estimateFeesPerGas();
    maxFeePerGas = fees.maxFeePerGas;
    maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
  } catch {
    maxPriorityFeePerGas = 1_000_000n; // 0.001 gwei
    maxFeePerGas = 50_000_000n; // 0.05 gwei ceiling (Base is cheap)
  }
  const hash = await wallet.sendTransaction({
    account, to: address, data, authorizationList: [authorization], chain: base,
    gas: ACTIVATION_GAS, maxFeePerGas, maxPriorityFeePerGas,
  });
  info(`tx: ${C.cyn}https://basescan.org/tx/${hash}${C.reset}`);

  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") die(`activation reverted on-chain (status ${rcpt.status}). See the tx above.`);

  // Confirm the delegation landed. Load-balanced public RPCs can briefly serve a node that hasn't seen
  // the new block yet, so poll a few times (pinned to the receipt block) before deciding.
  let nowOurs = false;
  for (let i = 0; i < 6; i++) {
    const after = await pub.getCode({ address, blockNumber: rcpt.blockNumber }).catch(() => undefined);
    nowOurs = !!after && after.toLowerCase().startsWith("0xef0100") && getAddress("0x" + after.slice(8, 48)).toLowerCase() === CFG.delegateImpl.toLowerCase();
    if (nowOurs) break;
    await sleep(1500);
  }
  if (!nowOurs) {
    // The tx succeeded (status 1) — initialize ran — so this is almost certainly RPC load-balancer lag,
    // not a real failure. Tell the truth instead of crying wolf.
    warn("Activation tx SUCCEEDED, but this RPC hasn't surfaced the new account code yet (load-balancer lag).");
    info(`Verify: https://basescan.org/address/${address}#code  — then sign in to the panel with ${C.b}${address}${C.reset}.`);
    cleanupEnv();
    return;
  }

  log("");
  ok(`${C.b}Activated.${C.reset} ${address} is now an IntentOS guarded account on Base mainnet.`);
  info(`Next: open the IntentOS panel, sign in with ${C.b}${address}${C.reset}, build your Intent, and run a guarded trade.`);
  log(`${C.dim}Executions are signed by the platform SessionKey and paid by the relayer, reimbursed from your gas vault. No more signatures from you.${C.reset}`);
  cleanupEnv();
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));