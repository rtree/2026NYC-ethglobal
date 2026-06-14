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
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, argv, env, exit } from "node:process";

// ---- baked deployment config (Base mainnet; from deployments/base-mainnet.json + server guard) -------
const CFG = {
  chainId: 8453,
  delegateImpl: "0x37d9933c5ac95399c840d3a2c07fdfdbc8b7f9c1",
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
  // public Base RPCs (viem fallback) — keyless, write-capable
  rpcs: ["https://mainnet.base.org", "https://base.publicnode.com", "https://base.drpc.org", "https://1rpc.io/base"],
};

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
const die = (s) => { log(`${C.red}✖ ${s}${C.reset}`); exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hasFlag(f) { return argv.includes(f); }
function flagVal(f) { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; }

function makeClients() {
  const transport = fallback((flagVal("--rpc") ? [flagVal("--rpc")] : CFG.rpcs).map((u) => http(u, { retryCount: 3, retryDelay: 600 })));
  return {
    pub: createPublicClient({ chain: base, transport }),
    wallet: createWalletClient({ chain: base, transport }),
  };
}

// ---- key source resolution: Ledger (recommended) -> imported key (env/file/prompt) ------------------
async function resolveAccount() {
  if (hasFlag("--ledger")) {
    warn("Ledger mode is EXPERIMENTAL and requires a recent Ledger Ethereum app that clear-signs EIP-7702.");
    const { ledgerAccount } = await import("./ledger.mjs").catch(() => {
      die("Ledger support needs the optional native packages. Run:\n    npm i @ledgerhq/hw-transport-node-hid @ledgerhq/hw-app-eth\n  then re-run with --ledger. (Or import a dedicated key instead.)");
    });
    const path = flagVal("--hd-path") ?? "m/44'/60'/0'/0/0";
    return ledgerAccount(path);
  }
  // Imported key. Prefer env/file so the secret is never echoed or stored in shell history.
  let secret = env.PRIVATE_KEY || env.MNEMONIC || null;
  const keyFile = flagVal("--key-file");
  if (!secret && keyFile) secret = readFileSync(keyFile, "utf8").trim();
  if (!secret) {
    warn("No Ledger (--ledger) and no PRIVATE_KEY/MNEMONIC/--key-file provided.");
    warn("Ledger is RECOMMENDED. If you must import a key, use a DEDICATED low-value EOA — never your main seed.");
    const rl = createInterface({ input: stdin, output: stdout });
    secret = (await rl.question("Paste mnemonic or 0x-private-key (input is visible — prefer --key-file): ")).trim();
    rl.close();
  }
  if (!secret) die("no signer provided");
  try {
    const acct = /^0x[0-9a-fA-F]{64}$/.test(secret) ? privateKeyToAccount(secret) : mnemonicToAccount(secret);
    secret = null; // best-effort: drop the reference
    return acct;
  } catch (e) {
    die(`could not parse key: ${e instanceof Error ? e.message : String(e)}`);
  }
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
    return;
  }
  if (isDelegated) {
    warn(`This EOA is already delegated to ${currentImpl} (e.g. a MetaMask Smart Account).`);
    warn("Activating will OVERWRITE that delegation.");
    if (!hasFlag("--force")) die("Re-run with --force to overwrite, or use a fresh EOA.");
    warn("--force set: proceeding to overwrite.");
  }

  // Wait for funding. Activation needs ETH (gas + vault reserve); a first trade later needs ~0.001 USDC.
  info(`Fund ${C.b}${address}${C.reset} on ${C.b}Base mainnet${C.reset}:`);
  log(`    • ${C.b}${formatEther(REQUIRED_ETH)} ETH${C.reset} minimum (recommend ~0.002 ETH: gas + ${formatEther(VAULT_TOTAL)} gas-vault reserve)`);
  log(`    • ${C.b}0.001 USDC${C.reset} for your first guarded trade (optional now)`);
  let warned = false;
  for (;;) {
    const [bal, usdc] = await Promise.all([
      pub.getBalance({ address }),
      pub.readContract({ address: CFG.usdc, abi: ERC20_ABI, functionName: "balanceOf", args: [address] }).catch(() => 0n),
    ]);
    if (bal >= REQUIRED_ETH) {
      ok(`Funded: ${formatEther(bal)} ETH${usdc >= RECOMMENDED_USDC ? `, ${Number(usdc) / 1e6} USDC` : ""}`);
      if (usdc < RECOMMENDED_USDC) warn(`USDC is ${Number(usdc) / 1e6} (< 0.001). You can add it before trading.`);
      break;
    }
    if (!warned) { info(`Waiting for ETH… (have ${formatEther(bal)}, need ${formatEther(REQUIRED_ETH)}). Ctrl-C to abort.`); warned = true; }
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
  const hash = await wallet.sendTransaction({ account, to: address, data, authorizationList: [authorization], chain: base });
  info(`tx: ${C.cyn}https://basescan.org/tx/${hash}${C.reset}`);

  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") die(`activation reverted on-chain (status ${rcpt.status}). See the tx above.`);

  const after = await pub.getCode({ address }).catch(() => undefined);
  const nowOurs = !!after && after.toLowerCase().startsWith("0xef0100") && getAddress("0x" + after.slice(8, 48)).toLowerCase() === CFG.delegateImpl.toLowerCase();
  if (!nowOurs) die("tx succeeded but delegation not detected — re-run to inspect.");

  log("");
  ok(`${C.b}Activated.${C.reset} ${address} is now an IntentOS guarded account on Base mainnet.`);
  info(`Next: open the IntentOS panel, sign in with ${C.b}${address}${C.reset}, build your Intent, and run a guarded trade.`);
  log(`${C.dim}Executions are signed by the platform SessionKey and paid by the relayer, reimbursed from your gas vault. No more signatures from you.${C.reset}`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
