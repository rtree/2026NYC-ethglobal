// WatcherRuntime (010 §8 watcher tools, North Star §5). Reads EvidenceCommitted, judges against the
// Semantic Guardrails, and casts monotonic tighten / freeze votes (quorum=1) signed by the Watcher
// KMS SessionKey. The Watcher can ONLY narrow capability — never loosen (enforced on-chain).
import type { Account, Address, Hex, PublicClient, WalletClient } from "viem";
import { decodeEventLog } from "viem";
import {
  CHAIN_ID,
  ExecutionDelegate7702Abi,
  KMS,
  freezeDigest,
  kmsSignDigest,
  keyVersion,
  tightenDigest,
  type GuardPatch,
} from "@intentos/shared";
import { relayWatcherTighten, relayWatcherFreeze } from "./relay.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = ExecutionDelegate7702Abi as any;

export interface EvidenceEntry {
  executorAgentTokenId: bigint;
  intentId: Hex;
  executionId: Hex;
  action: number;
  reason: string;
  txHash: Hex;
  blockNumber: bigint;
}

/** intentos.read_evidence — pull EvidenceCommitted entries from the delegate (Owner EOA). */
export async function readEvidence(
  pub: PublicClient,
  delegate: Address,
  fromBlock: bigint,
  toBlock?: bigint,
): Promise<EvidenceEntry[]> {
  const logs = await pub.getLogs({ address: delegate, fromBlock, toBlock: toBlock ?? "latest" });
  const out: EvidenceEntry[] = [];
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi, data: log.data, topics: log.topics }) as {
        eventName: string;
        args: Record<string, unknown>;
      };
      if (ev.eventName !== "EvidenceCommitted") continue;
      const a = ev.args as unknown as {
        executorAgentTokenId: bigint;
        intentId: Hex;
        executionId: Hex;
        action: number;
        reason: string;
      };
      out.push({
        executorAgentTokenId: a.executorAgentTokenId,
        intentId: a.intentId,
        executionId: a.executionId,
        action: a.action,
        reason: a.reason,
        txHash: log.transactionHash as Hex,
        blockNumber: log.blockNumber as bigint,
      });
    } catch {
      /* not our event */
    }
  }
  return out;
}

export type Judgement =
  | { verdict: "OK" }
  | { verdict: "TIGHTEN"; patch: GuardPatch }
  | { verdict: "FREEZE"; note: string };

/** Sign + relay a monotonic tighten vote with the Watcher KMS SessionKey (quorum=1 -> immediate). */
export async function voteTighten(
  wallet: WalletClient,
  pub: PublicClient,
  delegate: Address,
  patch: GuardPatch,
  relayer: Account | Address,
  watcherKeyVersion: string = keyVersion(KMS.watcherSessionKey),
): Promise<Hex> {
  const digest = tightenDigest(CHAIN_ID, delegate, patch);
  const sig = await kmsSignDigest(watcherKeyVersion, digest);
  return relayWatcherTighten(wallet, pub, delegate, patch, sig, relayer);
}

/** Sign + relay a freeze vote with the Watcher KMS SessionKey (quorum=1 -> immediate). */
export async function voteFreeze(
  wallet: WalletClient,
  pub: PublicClient,
  delegate: Address,
  bindingNonce: bigint,
  relayer: Account | Address,
  watcherKeyVersion: string = keyVersion(KMS.watcherSessionKey),
): Promise<Hex> {
  const digest = freezeDigest(CHAIN_ID, delegate, bindingNonce);
  const sig = await kmsSignDigest(watcherKeyVersion, digest);
  return relayWatcherFreeze(wallet, pub, delegate, sig, relayer);
}
