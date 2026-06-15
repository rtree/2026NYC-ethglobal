// M1 milestone runner: deploy -> 7702 delegate+initialize -> fund vault -> ONE guarded 0.001 USDC
// swap. Works on a Base fork (INTENTOS_FORK=1, deals funds) or Base mainnet (real funds).
// Usage:
//   fork:    INTENTOS_FORK=1 INTENTOS_RPC=http://127.0.0.1:8545 tsx scripts/m1-run.ts
//   mainnet: INTENTOS_RPC=https://mainnet.base.org tsx scripts/m1-run.ts
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  http,
  keccak256,
  parseEther,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import {
  Action,
  ExecutionDelegate7702Abi,
  KMS,
  TOKENS,
  UNISWAP,
  getKmsEthAddress,
  keyVersion,
} from "@intentos/shared";
import {
  deployContracts,
  delegateAndInitialize,
  fundGasVault,
  quoteExactInputSingle,
  buildExecutionRequest,
  signExecutionRequest,
  relaySubmitExecution,
  previewGuard,
  getPlatformAccount,
  getOwnerAccount,
  getBaseRpcUrl,
} from "../src/index.js";

const FORK = process.env.INTENTOS_FORK === "1";
const abi = ExecutionDelegate7702Abi as never;
const erc20 = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const AMOUNT_IN = 1_000n; // 0.001 USDC (6 decimals)

async function dealUsdc(test: ReturnType<typeof createTestClient>, pub: ReturnType<typeof createPublicClient>, holder: Address, amount: bigint) {
  for (let slot = 0n; slot < 30n; slot++) {
    const index = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, slot]));
    const prev = await pub.getStorageAt({ address: TOKENS.USDC, slot: index });
    await test.setStorageAt({ address: TOKENS.USDC, index, value: toHex(amount, { size: 32 }) });
    const bal = (await pub.readContract({ address: TOKENS.USDC, abi: erc20, functionName: "balanceOf", args: [holder] })) as bigint;
    if (bal === amount) return;
    await test.setStorageAt({ address: TOKENS.USDC, index, value: prev ?? toHex(0n, { size: 32 }) });
  }
  throw new Error("dealUsdc: slot not found");
}

function saveDeployment(delegateImpl: Address, agentNft: Address) {
  if (FORK) return;
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "../../../deployment/base-mainnet.json");
  const j = JSON.parse(readFileSync(path, "utf8"));
  j.contracts.executionDelegate7702Impl = delegateImpl;
  j.contracts.agentNFT = agentNft;
  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
}

function readExistingImpl(): Address | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, "../../../deployment/base-mainnet.json");
  const j = JSON.parse(readFileSync(path, "utf8"));
  return (j.contracts.executionDelegate7702Impl as Address | null) ?? null;
}

async function main() {
  const platform = await getPlatformAccount();
  const owner = await getOwnerAccount();
  const RPC = FORK ? (process.env.INTENTOS_RPC ?? "http://127.0.0.1:8545") : await getBaseRpcUrl();
  const transport = http(RPC, { retryCount: 6, retryDelay: 1000, batch: false });
  const pub = createPublicClient({ chain: base, transport });
  const wallet = createWalletClient({ chain: base, transport });

  console.log(`network: ${FORK ? "BASE FORK" : "BASE MAINNET"}  rpc=${RPC.replace(/\/v2\/.*/, "/v2/***")}`);
  console.log(`platform(relayer/deployer): ${platform.address}`);
  console.log(`owner(EOA): ${owner.address}`);

  if (FORK) {
    const test = createTestClient({ chain: base, mode: "anvil", transport: http(RPC) });
    await test.setBalance({ address: platform.address, value: parseEther("1") });
    await test.setBalance({ address: owner.address, value: parseEther("1") });
    await dealUsdc(test, pub, owner.address, 1_000_000n);
  }

  const sessionKey = await getKmsEthAddress(keyVersion(KMS.executorSessionKey));
  const watcherKey = await getKmsEthAddress(keyVersion(KMS.watcherSessionKey));

  // Resume support: if the owner is already 7702-delegated + initialized, skip deploy/initialize.
  const existing = readExistingImpl();
  const ownerCode = await pub.getCode({ address: owner.address });
  const delegated = !!ownerCode && ownerCode.toLowerCase().startsWith("0xef0100");
  let initialized = false;
  if (delegated) {
    const g = (await pub.readContract({ address: owner.address, abi, functionName: "guard" })) as { router: Address };
    initialized = g.router !== "0x0000000000000000000000000000000000000000";
  }

  let delegateImpl: Address;
  if (existing && delegated && initialized) {
    delegateImpl = existing;
    console.log(`RESUME: owner already delegated+initialized -> impl ${delegateImpl}`);
    const [execVault] = (await pub.readContract({ address: owner.address, abi, functionName: "gasVaults" })) as [bigint, bigint];
    if (execVault === 0n) {
      const fundHash = await fundGasVault(wallet, pub, owner, false, parseEther("0.002"));
      console.log(`fundGasVault(exec): ${fundHash}`);
    } else {
      console.log(`exec vault already funded: ${execVault}`);
    }
  } else {
    // Fresh setup: deploy impls, then owner delegates + initializes (+ seeds the vault) in one tx.
    const deployed = await deployContracts(wallet, pub, platform);
    delegateImpl = deployed.delegateImpl;
    console.log(`ExecutionDelegate7702 impl: ${delegateImpl}`);
    console.log(`AgentNFT: ${deployed.agentNft}`);
    saveDeployment(delegateImpl, deployed.agentNft);

    const guard = {
      router: UNISWAP.swapRouter02,
      selector: "0x04e45aaf" as Hex, // exactInputSingle
      tokenA: TOKENS.USDC,
      tokenB: TOKENS.WETH,
      poolFee: UNISWAP.usdcWethPoolFee,
      amountCapPerTx: 2_000n, // 0.002 USDC
      cumulativeCap: 10_000n, // 0.01 USDC
      slippageCapBps: 300, // 3% (tiny notional)
      expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
      frozen: false,
      bindingNonce: 1n,
    };
    const initHash = await delegateAndInitialize(wallet, pub, owner, delegateImpl, {
      guard,
      sessionKey,
      watcherKey,
      relayer: platform.address,
      gasPerTxCap: parseEther("0.0002"),
      initialExecVault: parseEther("0.002"),
      initialWatcherVault: 0n,
      packageHash: keccak256(toHex("intent-abc/pkg")),
      semanticGuardHash: keccak256(toHex("intent-abc/sem")),
    });
    console.log(`7702 delegate + initialize (+vault): ${initHash}`);
    const code = await pub.getCode({ address: owner.address });
    console.log(`owner code after 7702: ${code}`);
  }
  // 4. executor: quote -> build -> preview guard -> KMS sign -> relayer submit
  const quoted = await quoteExactInputSingle(pub, TOKENS.USDC, TOKENS.WETH, AMOUNT_IN);
  const reason = "M1 mainnet: BUY 0.001 USDC->WETH inside Hard Guardrails";
  const req = buildExecutionRequest({
    intentId: keccak256(toHex("intent-abc")),
    executorTokenId: 1n,
    action: Action.BUY,
    tokenIn: TOKENS.USDC,
    tokenOut: TOKENS.WETH,
    recipient: owner.address,
    amountIn: AMOUNT_IN,
    quotedAmountOut: quoted,
    slippageBps: 250,
    nonce: BigInt(Date.now()),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
    bindingNonce: 1n,
    reason,
  });

  const pre = await previewGuard(pub, owner.address, req);
  if (!pre.ok) throw new Error(`preview guard rejected: ${pre.reason}`);

  const sig = await signExecutionRequest(owner.address, req);
  const txHash = await relaySubmitExecution(wallet, pub, owner.address, req, reason, sig, platform);
  const rcpt = await pub.waitForTransactionReceipt({ hash: txHash });
  // Pin both reads to the receipt block so a load-balanced RPC can't return inconsistent state.
  const wethBefore = (await pub.readContract({ address: TOKENS.WETH, abi: erc20, functionName: "balanceOf", args: [owner.address], blockNumber: rcpt.blockNumber - 1n })) as bigint;
  const wethAfter = (await pub.readContract({ address: TOKENS.WETH, abi: erc20, functionName: "balanceOf", args: [owner.address], blockNumber: rcpt.blockNumber })) as bigint;

  let evidence = false;
  for (const log of rcpt.logs) {
    try {
      if (decodeEventLog({ abi, data: log.data, topics: log.topics }).eventName === "EvidenceCommitted") evidence = true;
    } catch { /* not ours */ }
  }

  console.log(`\nswap tx: ${txHash}`);
  if (!FORK) console.log(`basescan: https://basescan.org/tx/${txHash}`);
  console.log(`WETH before/after: ${wethBefore} / ${wethAfter}`);
  console.log(`EvidenceCommitted: ${evidence}`);
  if (wethAfter <= wethBefore) throw new Error("FAIL: no WETH received");
  if (!evidence) throw new Error("FAIL: no EvidenceCommitted");
  console.log(`\nM1 ${FORK ? "FORK" : "MAINNET"} RUN PASS — guarded USDC->WETH executed via EIP-7702 + KMS + relayer.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
