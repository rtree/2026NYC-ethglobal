// IntentOS — Ledger signer for the Activation Kit (EXPERIMENTAL)
// ---------------------------------------------------------------------------------------------------
// Ledger is the RECOMMENDED way to activate with real funds: the private key never leaves the device.
// This wraps a Ledger Ethereum app as a viem "custom account" exposing the two operations the kit needs:
//   • signAuthorization(...)  — sign the EIP-7702 authorization tuple
//   • signTransaction(...)    — sign the EIP-7702 (type-4) self-transaction
//
// REQUIREMENTS (native HID — cannot be bundled, so installed separately):
//     npm i @ledgerhq/hw-transport-node-hid @ledgerhq/hw-app-eth
// and a Ledger Ethereum app recent enough to clear-sign EIP-7702. If your firmware/app does not yet
// support 7702 authorization signing, this will fail with a clear message — fall back to a dedicated
// imported key in that case. Verify on a physical device before trusting it with funds.
import { toAccount } from "viem/accounts";
import { serializeTransaction, serializeAuthorization, hashAuthorization, keccak256, getAddress } from "viem";

async function openEth() {
  const TransportMod = await import("@ledgerhq/hw-transport-node-hid");
  const EthMod = await import("@ledgerhq/hw-app-eth");
  const Transport = TransportMod.default ?? TransportMod;
  const Eth = EthMod.default ?? EthMod;
  const transport = await Transport.open(await Transport.list().then((l) => l[0]));
  if (!transport) throw new Error("no Ledger device found (is it connected, unlocked, with the Ethereum app open?)");
  return { eth: new Eth(transport), transport };
}

function normSig(sig) {
  // hw-app-eth returns r/s without 0x and v as a number/string; normalize to viem's {r,s,v/yParity}.
  const r = ("0x" + String(sig.r)).toLowerCase();
  const s = ("0x" + String(sig.s)).toLowerCase();
  const v = typeof sig.v === "string" ? (sig.v.startsWith("0x") ? Number(BigInt(sig.v)) : parseInt(sig.v, 16)) : Number(sig.v);
  return { r, s, v: BigInt(v) };
}

export async function ledgerAccount(hdPath) {
  const { eth } = await openEth();
  const { address } = await eth.getAddress(hdPath, false, false);
  const checksummed = getAddress(address);

  return toAccount({
    address: checksummed,
    async signMessage() {
      throw new Error("Ledger signMessage is not used by the activation kit");
    },
    async signTransaction(tx, { serializer = serializeTransaction } = {}) {
      // Serialize the unsigned EIP-7702 tx, ask the device to (clear-)sign it, then attach the signature.
      const unsigned = serializer(tx);
      const resolution = null; // clear-signing resolution (token/NFT plugins) not required for this self-call
      let sig;
      if (typeof eth.clearSignTransaction === "function") {
        sig = await eth.clearSignTransaction(hdPath, unsigned.slice(2), { externalPlugins: true, erc20: true, nft: true }, resolution);
      } else if (typeof eth.signTransaction === "function") {
        sig = await eth.signTransaction(hdPath, unsigned.slice(2), resolution);
      } else {
        throw new Error("this Ledger Ethereum app cannot sign transactions via hw-app-eth — update the app");
      }
      const { r, s, v } = normSig(sig);
      return serializer(tx, { r, s, v });
    },
    async signAuthorization(auth) {
      // EIP-7702 authorization signing. Newer Ledger Ethereum apps expose a dedicated method; if absent,
      // fail loudly (do NOT silently sign the wrong digest).
      if (typeof eth.signEIP7702Authorization === "function") {
        const sig = await eth.signEIP7702Authorization(hdPath, {
          chainId: auth.chainId,
          address: auth.contractAddress ?? auth.address,
          nonce: auth.nonce,
        });
        const { r, s, v } = normSig(sig);
        return { chainId: auth.chainId, address: auth.contractAddress ?? auth.address, nonce: auth.nonce, r, s, v, yParity: Number(v % 2n) };
      }
      throw new Error(
        "your Ledger Ethereum app does not support EIP-7702 authorization signing yet.\n" +
        "  Update the Ledger Ethereum app (Ledger Live > My Ledger), or activate with a dedicated imported key.",
      );
    },
  });
}

// Exported for completeness / debugging: the digest viem signs for an authorization.
export function authorizationDigest(auth) {
  return hashAuthorization({ chainId: auth.chainId, contractAddress: auth.contractAddress ?? auth.address, nonce: auth.nonce });
}

export { serializeAuthorization, keccak256 };
