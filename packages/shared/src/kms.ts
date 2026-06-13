// GCP KMS as an Ethereum signer. The key signs digests only (sign-only, 0 ETH) — plan/010 §5/§10.
// We pass our 32-byte Ethereum digest in the `sha256` field; KMS signs the bytes as-is.

import { KeyManagementServiceClient } from "@google-cloud/kms";
import { secp256k1 } from "@noble/curves/secp256k1";
import { getAddress, keccak256, serializeSignature, toHex, type Address, type Hex } from "viem";

const client = new KeyManagementServiceClient();

/** Append the first key version to a cryptoKey resource name. */
export function keyVersion(cryptoKeyName: string, version = 1): string {
  return `${cryptoKeyName}/cryptoKeyVersions/${version}`;
}

function pemToDer(pem: string): Buffer {
  const body = pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  return Buffer.from(body, "base64");
}

/** secp256k1 SubjectPublicKeyInfo ends with the uncompressed point 0x04||X||Y (65 bytes). */
function uncompressedPointFromSpki(der: Buffer): Buffer {
  const point = der.subarray(der.length - 65);
  if (point[0] !== 0x04) throw new Error("KMS: unexpected public key encoding");
  return point;
}

function parseDerEcdsa(der: Buffer): { r: bigint; s: bigint } {
  // SEQUENCE 0x30 len | INTEGER 0x02 lenR r | INTEGER 0x02 lenS s
  let i = 0;
  if (der[i++] !== 0x30) throw new Error("KMS: bad DER seq");
  i++; // seq len
  if (der[i++] !== 0x02) throw new Error("KMS: bad DER r");
  const rLen = der[i++];
  const r = BigInt("0x" + der.subarray(i, i + rLen).toString("hex"));
  i += rLen;
  if (der[i++] !== 0x02) throw new Error("KMS: bad DER s");
  const sLen = der[i++];
  const s = BigInt("0x" + der.subarray(i, i + sLen).toString("hex"));
  return { r, s };
}

function addressFromUncompressed(point: Buffer): Address {
  const hash = keccak256(("0x" + point.subarray(1).toString("hex")) as Hex);
  return getAddress(("0x" + hash.slice(-40)) as Hex);
}

/** Ethereum address controlled by a KMS key version. */
export async function getKmsEthAddress(keyVersionName: string): Promise<Address> {
  const [pub] = await client.getPublicKey({ name: keyVersionName });
  if (!pub.pem) throw new Error("KMS: no public key pem");
  return addressFromUncompressed(uncompressedPointFromSpki(pemToDer(pub.pem)));
}

/** Sign a 32-byte Ethereum digest with a KMS key version. Returns a 65-byte r||s||v signature. */
export async function kmsSignDigest(keyVersionName: string, ethDigest: Hex): Promise<Hex> {
  const digest = Buffer.from(ethDigest.slice(2), "hex");
  const [resp] = await client.asymmetricSign({ name: keyVersionName, digest: { sha256: digest } });
  if (!resp.signature) throw new Error("KMS: empty signature");
  const der = Buffer.from(resp.signature as Uint8Array);

  let { r, s } = parseDerEcdsa(der);
  const n = secp256k1.CURVE.n;
  if (s > n / 2n) s = n - s; // enforce low-s

  const addr = await getKmsEthAddress(keyVersionName);
  const msgHash = ethDigest.slice(2);
  for (const rec of [0, 1] as const) {
    const sig = new secp256k1.Signature(r, s).addRecoveryBit(rec);
    const pub = sig.recoverPublicKey(msgHash).toRawBytes(false);
    if (addressFromUncompressed(Buffer.from(pub)).toLowerCase() === addr.toLowerCase()) {
      return serializeSignature({
        r: toHex(r, { size: 32 }),
        s: toHex(s, { size: 32 }),
        v: BigInt(27 + rec),
      });
    }
  }
  throw new Error("KMS: could not recover signature v");
}
