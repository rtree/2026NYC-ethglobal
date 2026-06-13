// M3 watcher-slice proof on a Base fork. Full adversarial-governance loop:
//   executor swaps (EvidenceCommitted) -> watcher reads evidence -> votes TIGHTEN (monotonic) ->
//   next over-cap request is rejected -> watcher votes FREEZE -> all execution blocked.
// Uses the real Watcher KMS SessionKey. No real money.
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
import {
  Action,
  ExecutionDelegate7702Abi,
  KMS,
  TOKENS,
  UNISWAP,
  getKmsEthAddress,
  keyVersion,
  type GuardPatch,
} from "@intentos/shared";
import {
  quoteExactInputSingle,
  buildExecutionRequest,
  signExecutionRequest,
  relaySubmitExecution,
  previewGuard,
  readEvidence,
  voteTighten,
  voteFreeze,
} from "../src/index.js";

const ANVIL = "http://127.0.0.1:8545";
const DEPLOYER_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const RELAYER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const OWNER_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex; // anvil acct (fork only)
const abi = ExecutionDelegate7702Abi as never;
const erc20 = [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const;

function bytecode(): Hex {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(resolve(here, "../../../contracts/out/ExecutionDelegate7702.sol/ExecutionDelegate7702.json"), "utf8")).bytecode.object as Hex;
}

async function expectReject(pub: ReturnType<typeof createPublicClient>, owner: Address, req: never): Promise<string> {
  const pre = await previewGuard(pub, owner, req as never);
  if (pre.ok) throw new Error("expected guard rejection but preview passed");
  return pre.reason;
}

async function main() {
  const deployer = privateKeyToAccount(DEPLOYER_PK);
  const relayer = privateKeyToAccount(RELAYER_PK);
  const owner = privateKeyToAccount(OWNER_PK);
  const pub = createPublicClient({ chain: base, transport: http(ANVIL) });
  const wallet = createWalletClient({ chain: base, transport: http(ANVIL) });
  const test = createTestClient({ chain: base, mode: "anvil", transport: http(ANVIL) });

  // deploy impl
  const dh = await wallet.deployContract({ abi, bytecode: bytecode(), account: deployer });
  const impl = (await pub.waitForTransactionReceipt({ hash: dh })).contractAddress as Address;

  // fund owner with USDC + ETH
  await test.setBalance({ address: owner.address, value: parseEther("1") });
  await test.setBalance({ address: relayer.address, value: parseEther("1") });
  for (let slot = 0n; slot < 30n; slot++) {
    const index = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [owner.address, slot]));
    const prev = await pub.getStorageAt({ address: TOKENS.USDC, slot: index });
    await test.setStorageAt({ address: TOKENS.USDC, index, value: toHex(1_000_000n, { size: 32 }) });
    if (((await pub.readContract({ address: TOKENS.USDC, abi: erc20, functionName: "balanceOf", args: [owner.address] })) as bigint) === 1_000_000n) break;
    await test.setStorageAt({ address: TOKENS.USDC, index, value: prev ?? toHex(0n, { size: 32 }) });
  }

  // owner: 7702 delegate + initialize (+ vault) in one self-tx
  const sessionKey = await getKmsEthAddress(keyVersion(KMS.executorSessionKey));
  const watcherKey = await getKmsEthAddress(keyVersion(KMS.watcherSessionKey));
  const auth = await wallet.signAuthorization({ account: owner, contractAddress: impl, executor: "self" });
  const guard = {
    router: UNISWAP.swapRouter02, selector: "0x04e45aaf" as Hex, tokenA: TOKENS.USDC, tokenB: TOKENS.WETH,
    poolFee: UNISWAP.usdcWethPoolFee, amountCapPerTx: 2_000n, cumulativeCap: 100_000n, slippageCapBps: 300,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400), frozen: false, bindingNonce: 1n,
  };
  const ih = await wallet.sendTransaction({
    account: owner, to: owner.address, authorizationList: [auth],
    data: encodeFunctionData({ abi, functionName: "initialize", args: [guard, sessionKey, watcherKey, relayer.address, parseEther("0.001"), parseEther("0.05"), parseEther("0.05"), keccak256(toHex("pkg")), keccak256(toHex("sem"))] }),
  });
  await pub.waitForTransactionReceipt({ hash: ih });
  const startBlock = await pub.getBlockNumber();

  // --- executor: one guarded swap (0.001 USDC) ---
  const quoted = await quoteExactInputSingle(pub, TOKENS.USDC, TOKENS.WETH, 1_000n);
  const reason = "BUY 0.001 USDC->WETH inside caps";
  const req = buildExecutionRequest({
    intentId: keccak256(toHex("intent-abc")), executorTokenId: 1n, action: Action.BUY,
    tokenIn: TOKENS.USDC, tokenOut: TOKENS.WETH, recipient: owner.address, amountIn: 1_000n,
    quotedAmountOut: quoted, slippageBps: 250, nonce: 1n, deadline: BigInt(Math.floor(Date.now() / 1000) + 600), bindingNonce: 1n, reason,
  });
  const sig = await signExecutionRequest(owner.address, req);
  await relaySubmitExecution(wallet, pub, owner.address, req, reason, sig, relayer);

  // --- watcher: read evidence ---
  const evidence = await readEvidence(pub, owner.address, startBlock - 1n);
  console.log("watcher read evidence entries:", evidence.length, evidence[0]?.reason);
  if (evidence.length === 0) throw new Error("FAIL: watcher saw no evidence");

  // --- watcher: judge -> VOTE_TIGHTEN (amountCap 2000 -> 1000, monotonic) ---
  const patch: GuardPatch = { amountCapPerTx: 1_000n, cumulativeCap: 100_000n, slippageCapBps: 300, expiry: guard.expiry };
  await voteTighten(wallet, pub, owner.address, patch, relayer);
  const g2 = (await pub.readContract({ address: owner.address, abi, functionName: "guard" })) as { amountCapPerTx: bigint };
  console.log("after tighten, amountCapPerTx:", g2.amountCapPerTx.toString());
  if (g2.amountCapPerTx !== 1_000n) throw new Error("FAIL: tighten did not apply");

  // a 2000-unit request that was fine before is now rejected
  const overReq = buildExecutionRequest({
    intentId: keccak256(toHex("intent-abc")), executorTokenId: 1n, action: Action.BUY,
    tokenIn: TOKENS.USDC, tokenOut: TOKENS.WETH, recipient: owner.address, amountIn: 2_000n,
    quotedAmountOut: 1n, slippageBps: 250, nonce: 2n, deadline: BigInt(Math.floor(Date.now() / 1000) + 600), bindingNonce: 1n, reason: "BUY 0.002",
  });
  const rej = await expectReject(pub, owner.address, overReq as never);
  console.log("post-tighten over-cap request rejected with:", rej);
  if (rej !== "AmountTooLarge") throw new Error(`FAIL: expected AmountTooLarge, got ${rej}`);

  // --- watcher: VOTE_FREEZE -> all execution blocked ---
  await voteFreeze(wallet, pub, owner.address, 1n, relayer);
  const g3 = (await pub.readContract({ address: owner.address, abi, functionName: "guard" })) as { frozen: boolean };
  console.log("after freeze, frozen:", g3.frozen);
  const inReq = buildExecutionRequest({
    intentId: keccak256(toHex("intent-abc")), executorTokenId: 1n, action: Action.BUY,
    tokenIn: TOKENS.USDC, tokenOut: TOKENS.WETH, recipient: owner.address, amountIn: 1_000n,
    quotedAmountOut: 1n, slippageBps: 250, nonce: 3n, deadline: BigInt(Math.floor(Date.now() / 1000) + 600), bindingNonce: 1n, reason: "BUY 0.001",
  });
  const frej = await expectReject(pub, owner.address, inReq as never);
  console.log("post-freeze in-cap request rejected with:", frej);
  if (frej !== "GuardIsFrozen") throw new Error(`FAIL: expected GuardIsFrozen, got ${frej}`);

  console.log("\nM3 WATCHER SLICE PASS — evidence -> tighten (monotonic) -> freeze (quorum=1), executor blocked accordingly.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
