// M1 vertical-slice proof on a Base fork (anvil). Drives the REAL stack: KMS-signed ExecutionRequest
// accepted by ExecutionDelegate7702 on real Base state, swapping USDC->WETH via Uniswap, reimbursing
// the relayer. No real money. Prereq: `anvil --fork-url <base>` on :8545 and GCP ADC for KMS.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  createPublicClient as mkPublic,
  createTestClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  encodeFunctionData,
  http,
  keccak256,
  parseEther,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  Action,
  ExecutionDelegate7702Abi,
  KMS,
  TOKENS,
  getKmsEthAddress,
  keyVersion,
} from "@intentos/shared";
import { quoteExactInputSingle } from "../src/quote.js";
import { buildExecutionRequest, signExecutionRequest } from "../src/buildRequest.js";
import { relaySubmitExecution } from "../src/relay.js";

const ANVIL = "http://127.0.0.1:8545";
// anvil default dev accounts (well-known keys; fork only, never mainnet)
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const RELAYER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const delegateAbi = ExecutionDelegate7702Abi as never;

function delegateBytecode(): Hex {
  const here = dirname(fileURLToPath(import.meta.url));
  const artifact = JSON.parse(
    readFileSync(resolve(here, "../../../contracts/out/ExecutionDelegate7702.sol/ExecutionDelegate7702.json"), "utf8"),
  );
  return artifact.bytecode.object as Hex;
}

async function readBalance(pub: ReturnType<typeof mkPublic>, token: Address, who: Address): Promise<bigint> {
  return (await pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] })) as bigint;
}

/** Brute-force the ERC20 balance storage slot and set it (whale-independent). */
async function setErc20Balance(
  test: ReturnType<typeof createTestClient>,
  pub: ReturnType<typeof mkPublic>,
  token: Address,
  holder: Address,
  amount: bigint,
): Promise<void> {
  for (let slot = 0n; slot < 30n; slot++) {
    const index = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [holder, slot]));
    const prev = await pub.getStorageAt({ address: token, slot: index });
    await test.setStorageAt({ address: token, index, value: toHex(amount, { size: 32 }) });
    if ((await readBalance(pub, token, holder)) === amount) return;
    await test.setStorageAt({ address: token, index, value: prev ?? toHex(0n, { size: 32 }) });
  }
  throw new Error("setErc20Balance: slot not found");
}

async function main() {
  const deployer = privateKeyToAccount(DEPLOYER_PK);
  const relayer = privateKeyToAccount(RELAYER_PK);
  const pub = mkPublic({ chain: base, transport: http(ANVIL) });
  const wallet = createWalletClient({ chain: base, transport: http(ANVIL) });
  const test = createTestClient({ chain: base, mode: "anvil", transport: http(ANVIL) });

  // 1. deploy the delegate (acts as the Owner EOA in this fork test)
  const deployHash = await wallet.deployContract({ abi: delegateAbi, bytecode: delegateBytecode(), account: deployer });
  const deployRcpt = await pub.waitForTransactionReceipt({ hash: deployHash });
  const D = deployRcpt.contractAddress as Address;
  console.log("delegate (Owner EOA):", D);

  // 2. fund the Owner EOA: 5 USDC + 2 ETH
  await setErc20Balance(test, pub, TOKENS.USDC, D, 5_000_000n);
  await test.setBalance({ address: D, value: parseEther("2") });

  // 3. initialize the guard as an Owner self-call (msg.sender == address(this) == D)
  const sessionKey = await getKmsEthAddress(keyVersion(KMS.executorSessionKey));
  const watcherKey = await getKmsEthAddress(keyVersion(KMS.watcherSessionKey));
  console.log("executor SessionKey:", sessionKey);
  await test.impersonateAccount({ address: D });
  const guard = {
    router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
    selector: "0x04e45aaf" as Hex, // exactInputSingle
    tokenA: TOKENS.USDC,
    tokenB: TOKENS.WETH,
    poolFee: 500,
    amountCapPerTx: 5_000_000n,
    cumulativeCap: 100_000_000n,
    slippageCapBps: 100,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    frozen: false,
    bindingNonce: 1n,
  };
  await wallet.sendTransaction({
    account: D,
    to: D,
    data: encodeFunctionData({
      abi: delegateAbi,
      functionName: "initialize",
      args: [guard, sessionKey, watcherKey, relayer.address, parseEther("0.02"), parseEther("1"), 0n, keccak256(toHex("pkg")), keccak256(toHex("sem"))],
    }),
  });
  await test.stopImpersonatingAccount({ address: D });

  // 4. executor decides BUY 0.001 USDC; quote -> build -> KMS sign
  const amountIn = 1_000n; // 0.001 USDC (6 decimals)
  const quoted = await quoteExactInputSingle(pub, TOKENS.USDC, TOKENS.WETH, amountIn);
  console.log("quoted WETH out:", quoted.toString());
  const reason = "M1 fork e2e: BUY 0.001 USDC->WETH, inside caps";
  const req = buildExecutionRequest({
    intentId: keccak256(toHex("intent-abc")),
    executorTokenId: 123n,
    action: Action.BUY,
    tokenIn: TOKENS.USDC,
    tokenOut: TOKENS.WETH,
    recipient: D,
    amountIn,
    quotedAmountOut: quoted,
    slippageBps: 100,
    nonce: 1n,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3_600),
    bindingNonce: 1n,
    reason,
  });
  const sig = await signExecutionRequest(D, req);
  console.log("KMS signature:", sig.slice(0, 20) + "...");

  // 5. relayer submits; assert WETH received + EvidenceCommitted
  const wethBefore = await readBalance(pub, TOKENS.WETH, D);
  const txHash = await relaySubmitExecution(wallet, pub, D, req, reason, sig, relayer);
  const rcpt = await pub.waitForTransactionReceipt({ hash: txHash });
  const wethAfter = await readBalance(pub, TOKENS.WETH, D);

  let evidence = false;
  for (const log of rcpt.logs) {
    try {
      const ev = decodeEventLog({ abi: delegateAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "EvidenceCommitted") evidence = true;
    } catch {
      /* not our event */
    }
  }

  console.log("WETH before/after:", wethBefore.toString(), wethAfter.toString());
  console.log("EvidenceCommitted emitted:", evidence);
  if (wethAfter <= wethBefore) throw new Error("FAIL: no WETH received");
  if (!evidence) throw new Error("FAIL: no EvidenceCommitted");
  console.log("\nM1 FORK E2E PASS — KMS-signed guarded USDC->WETH swap executed on Base fork.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
