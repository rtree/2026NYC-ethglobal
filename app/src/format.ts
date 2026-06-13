import { formatUnits, type Hex } from "viem";

export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
export const shortHash = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
export const usdc = (v: bigint) => `${formatUnits(v, 6)} USDC`;
export const eth = (v: bigint) => `${Number(formatUnits(v, 18)).toFixed(6)} ETH`;
export const weth = (v: bigint) => `${Number(formatUnits(v, 18)).toFixed(8)} WETH`;
export const txUrl = (h: Hex) => `https://basescan.org/tx/${h}`;
export const addrUrl = (a: string) => `https://basescan.org/address/${a}`;
