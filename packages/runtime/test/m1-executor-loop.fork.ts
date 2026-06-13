// M1 bounded-executor-loop proof on a Base fork. Shows the guard->LLM feedback loop (AmountTooLarge
// backoff) across multiple bounded ticks, each a real KMS-signed USDC->WETH swap. No real money.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
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
import { ExecutionDelegate7702Abi, KMS, TOKENS, getKmsEthAddress, keyVersion } from "@intentos/shared";
import { runExecutor } from "../src/executor.js";

const ANVIL = "http://127.0.0.1:8545";
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const RELAYER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

function bytecode(): Hex {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(resolve(here, "../../../contracts/out/ExecutionDelegate7702.sol/ExecutionDelegate7702.json"), "utf8")).bytecode.object as Hex;
}

async function main() {
  const deployer = privateKeyToAccount(DEPLOYER_PK);
  const relayer = privateKeyToAccount(RELAYER_PK);
  const pub = createPublicClient({ chain: base, transport: http(ANVIL) });
  const wallet = createWalletClient({ chain: base, transport: http(ANVIL) });
  const test = createTestClient({ chain: base, mode: "anvil", transport: http(ANVIL) });

  const hash = await wallet.deployContract({ abi, bytecode: bytecode(), account: deployer });
  const D = (await pub.waitForTransactionReceipt({ hash })).contractAddress as Address;

  // fund 5 USDC (brute-force slot) + 2 ETH
  for (let slot = 0n; slot < 30n; slot++) {
    const index = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [D, slot]));
    const prev = await pub.getStorageAt({ address: TOKENS.USDC, slot: index });
    await test.setStorageAt({ address: TOKENS.USDC, index, value: toHex(5_000_000n, { size: 32 }) });
    const bal = (await pub.readContract({ address: TOKENS.USDC, abi: erc20, functionName: "balanceOf", args: [D] })) as bigint;
    if (bal === 5_000_000n) break;
    await test.setStorageAt({ address: TOKENS.USDC, index, value: prev ?? toHex(0n, { size: 32 }) });
  }
  await test.setBalance({ address: D, value: parseEther("2") });

  const sessionKey = await getKmsEthAddress(keyVersion(KMS.executorSessionKey));
  await test.impersonateAccount({ address: D });
  const guard = {
    router: "0x2626664c2603336E57B271c5C0b26F421741e481" as Address,
    selector: "0x04e45aaf" as Hex,
    tokenA: TOKENS.USDC,
    tokenB: TOKENS.WETH,
    poolFee: 500,
    amountCapPerTx: 2_000n, // forces backoff from baseAmountIn 3000
    cumulativeCap: 10_000n,
    slippageCapBps: 200,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
    frozen: false,
    bindingNonce: 1n,
  };
  await wallet.sendTransaction({ account: D, to: D, data: encodeFunctionData({ abi, functionName: "initialize", args: [guard, sessionKey, "0x0000000000000000000000000000000000000000", relayer.address, parseEther("0.02"), keccak256(toHex("pkg")), keccak256(toHex("sem"))] }) });
  await wallet.sendTransaction({ account: D, to: D, data: encodeFunctionData({ abi, functionName: "fundGasVault", args: [false, parseEther("1")] }) });
  await test.stopImpersonatingAccount({ address: D });

  const records = await runExecutor(
    { pub, wallet, delegate: D, relayerAccount: relayer, intentId: keccak256(toHex("intent-abc")), executorTokenId: 123n },
    { maxTicks: 3, tickIntervalMs: 300, maxAttemptsPerTick: 4, baseAmountIn: 3_000n, slippageBps: 150 },
  );

  const buys = records.filter((r) => r.action === "BUY");
  const rejections = records.flatMap((r) => r.rejections);
  const cumulative = (await pub.readContract({ address: D, abi, functionName: "cumulativeSpent" })) as bigint;
  const weth = (await pub.readContract({ address: TOKENS.WETH, abi: erc20, functionName: "balanceOf", args: [D] })) as bigint;

  console.log("ticks:", records.map((r) => `${r.tick}:${r.action}${r.amountIn ? `(${r.amountIn})` : ""}[${r.rejections.join(",")}]`).join(" "));
  console.log("BUYs:", buys.length, "rejections:", rejections.join(","), "cumulative:", cumulative.toString(), "WETH:", weth.toString());

  if (buys.length !== 3) throw new Error(`FAIL: expected 3 BUYs, got ${buys.length}`);
  if (!rejections.includes("AmountTooLarge")) throw new Error("FAIL: feedback loop did not surface AmountTooLarge");
  if (cumulative !== 4_500n) throw new Error(`FAIL: expected cumulative 4500, got ${cumulative}`);
  if (weth === 0n) throw new Error("FAIL: no WETH received");
  console.log("\nM1 EXECUTOR LOOP PASS — bounded ticks + guard->LLM backoff + real swaps on Base fork.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
