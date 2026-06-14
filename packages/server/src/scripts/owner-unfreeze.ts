import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  fallback,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { getBaseRpcUrls } from "@intentos/runtime";
import { ExecutionDelegate7702Abi, type HardGuardState } from "@intentos/shared";

const DEFAULT_OWNER = "0x5e9041e731e10727d923d79b1e83290f6e83a221";

function normalizeAddress(address: string): Address {
  return getAddress(address.toLowerCase());
}

function envBigInt(name: string): bigint | undefined {
  const v = process.env[name]?.trim();
  return v ? BigInt(v) : undefined;
}

function envNumber(name: string): number | undefined {
  const v = process.env[name]?.trim();
  return v ? Number(v) : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadOwnerAccount() {
  const pk = process.env.OWNER_PRIVATE_KEY?.trim();
  if (pk) return privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);

  const mnemonic = process.env.OWNER_MNEMONIC?.trim();
  if (mnemonic) {
    const accountIndex = Number(process.env.OWNER_ACCOUNT_INDEX ?? "0");
    return mnemonicToAccount(mnemonic, { accountIndex });
  }

  throw new Error(
    [
      "Set OWNER_PRIVATE_KEY or OWNER_MNEMONIC in your local shell.",
      "Do not paste secrets into chat, commit them, or put them in .env files.",
      "Example:",
      "  read -rsp 'OWNER_PRIVATE_KEY: ' OWNER_PRIVATE_KEY; echo",
      "  export OWNER_PRIVATE_KEY",
      "  pnpm --filter @intentos/server owner:unfreeze",
      "  unset OWNER_PRIVATE_KEY",
    ].join("\n"),
  );
}

async function main() {
  const owner = normalizeAddress(process.env.OWNER_ADDRESS ?? DEFAULT_OWNER);
  const account = loadOwnerAccount();
  if (account.address.toLowerCase() !== owner.toLowerCase()) {
    throw new Error(`Loaded key is ${account.address}, but OWNER_ADDRESS is ${owner}`);
  }

  const urls = await getBaseRpcUrls();
  const transport = fallback(urls.map((u) => http(u, { retryCount: 2, retryDelay: 500 })));
  const pub = createPublicClient({ chain: base, transport });
  const wallet = createWalletClient({ account, chain: base, transport });

  const current = (await pub.readContract({
    address: owner,
    abi: ExecutionDelegate7702Abi,
    functionName: "guard",
  })) as HardGuardState;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const target: HardGuardState = {
    ...current,
    amountCapPerTx: envBigInt("OWNER_AMOUNT_CAP_PER_TX") ?? current.amountCapPerTx,
    cumulativeCap: envBigInt("OWNER_CUMULATIVE_CAP") ?? current.cumulativeCap,
    slippageCapBps: envNumber("OWNER_SLIPPAGE_CAP_BPS") ?? current.slippageCapBps,
    expiry: envBigInt("OWNER_EXPIRY") ?? (current.expiry > now + 86_400n ? current.expiry : now + 86_400n),
    frozen: false,
  };

  console.log(`owner=${owner}`);
  console.log(`before frozen=${current.frozen} amountCapPerTx=${current.amountCapPerTx} cumulativeCap=${current.cumulativeCap} expiry=${current.expiry}`);
  console.log(`target frozen=${target.frozen} amountCapPerTx=${target.amountCapPerTx} cumulativeCap=${target.cumulativeCap} expiry=${target.expiry}`);

  const data = encodeFunctionData({ abi: ExecutionDelegate7702Abi, functionName: "ownerUpdateGuard", args: [target] });
  const estimated = await pub.estimateGas({ account, to: owner, data });
  const gas = (estimated * 13n) / 10n + 50_000n;
  const hash = await wallet.sendTransaction({ account, to: owner, data, gas, chain: base });
  console.log(`tx=${hash}`);

  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`ownerUpdateGuard reverted: ${hash}`);

  let after = (await pub.readContract({
    address: owner,
    abi: ExecutionDelegate7702Abi,
    functionName: "guard",
    blockNumber: receipt.blockNumber,
  })) as HardGuardState;
  for (let i = 0; after.frozen && i < 12; i++) {
    await sleep(2_500);
    after = (await pub.readContract({
      address: owner,
      abi: ExecutionDelegate7702Abi,
      functionName: "guard",
    })) as HardGuardState;
  }
  console.log(`after frozen=${after.frozen} amountCapPerTx=${after.amountCapPerTx} cumulativeCap=${after.cumulativeCap} expiry=${after.expiry}`);
  if (after.frozen) {
    console.log("warning: receipt succeeded but the RPC still reports frozen=true; re-check /api/state or a block explorer after RPCs catch up");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
