// intentos.get_quote -> Uniswap QuoterV2 on Base (010 §8 concrete tool surface).
import { decodeFunctionResult, encodeFunctionData, type Address, type PublicClient } from "viem";
import { UNISWAP } from "@intentos/shared";

const QUOTER_V2: Address = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";

const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/** Quote a single-hop exact-input swap. QuoterV2 is nonpayable; we eth_call it. */
export async function quoteExactInputSingle(
  client: PublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number = UNISWAP.usdcWethPoolFee,
): Promise<bigint> {
  const data = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
  });
  const res = await client.call({ to: QUOTER_V2, data });
  if (!res.data) throw new Error("quote: empty result");
  const decoded = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInputSingle", data: res.data });
  return (decoded as readonly bigint[])[0];
}
