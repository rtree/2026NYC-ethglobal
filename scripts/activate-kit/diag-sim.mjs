// One-off diagnostic: simulate the EIP-7702 delegate+initialize self-call for the user's EOA to get the
// real revert reason. Read-only — no key, no broadcast. Uses an authorizationList-style state override.
import { createPublicClient, http, encodeFunctionData } from "viem";
import { base } from "viem/chains";

const EOA = "0x5E9041E731E10727d923d79b1e83290f6E83a221";
const IMPL = "0x37d9933c5ac95399c840d3a2c07fdfdbc8b7f9c1";
const SR = "0x2626664c2603336E57B271c5C0b26F421741e481";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const WETH = "0x4200000000000000000000000000000000000006";
const SK = "0x86bA13f74C5f2AC469eeb6e0010A6AFfd49298eE";
const WK = "0xEe1Dc2f082612D6d510D7E3b3EEd26cE385E9D38";
const REL = "0x078383c4c20b4e9732Ac0c30A68b8123D53ea6C9";

const ABI = [{
  type: "function", name: "initialize", stateMutability: "nonpayable", outputs: [],
  inputs: [
    { name: "g", type: "tuple", components: [
      { name: "router", type: "address" }, { name: "selector", type: "bytes4" }, { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" }, { name: "poolFee", type: "uint24" }, { name: "amountCapPerTx", type: "uint256" },
      { name: "cumulativeCap", type: "uint256" }, { name: "slippageCapBps", type: "uint16" }, { name: "expiry", type: "uint64" },
      { name: "frozen", type: "bool" }, { name: "bindingNonce", type: "uint256" } ] },
    { name: "sessionKey", type: "address" }, { name: "watcherKey", type: "address" }, { name: "relayer", type: "address" },
    { name: "gasPerTxCap", type: "uint256" }, { name: "initialExecVault", type: "uint256" },
    { name: "initialWatcherVault", type: "uint256" }, { name: "packageHash", type: "bytes32" }, { name: "semanticGuardHash", type: "bytes32" },
  ],
}];

const guard = {
  router: SR, selector: "0x04e45aaf", tokenA: USDC, tokenB: WETH, poolFee: 500,
  amountCapPerTx: 2000n, cumulativeCap: 100000n, slippageCapBps: 300,
  expiry: BigInt(Math.floor(Date.now() / 1000) + 86400), frozen: false, bindingNonce: 1n,
};
const data = encodeFunctionData({ abi: ABI, functionName: "initialize", args: [
  guard, SK, WK, REL, 200000000000000n, 400000000000000n, 200000000000000n,
  "0x24191fd4c069c95c0e6a6711321734b6e16e06129deb6352f4bffebaef0f77ab",
  "0x553663a0176f85dd74632c16285656b504cf44dade45e2ccc7190f80c025dddc",
] });

const pub = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

// Simulate WITH a 7702 state override: pretend the EOA already has the delegate code, then call
// initialize() as the account itself (msg.sender == address(this)).
try {
  const r = await pub.call({
    account: EOA, to: EOA, data,
    stateOverride: [{ address: EOA, code: ("0xef0100" + IMPL.slice(2)) }],
  });
  console.log("OK (no revert). result:", r);
} catch (e) {
  console.log("REVERT:", e.shortMessage || e.message);
  if (e.metaMessages) console.log(e.metaMessages.join("\n"));
  if (e.cause?.reason) console.log("reason:", e.cause.reason);
  if (e.cause?.data) console.log("data:", e.cause.data);
}
